#!/usr/bin/env node
/**
 * Three Digital — Print Agent
 *
 * Long-poll dos jobs em GET /api/agent/jobs e envia ESC/POS para
 * impressoras locais. Suporta:
 *   - TCP (impressora de rede com IP)
 *   - Windows (impressora pelo nome — local USB ou compartilhada)
 *
 * Uso:
 *   node setup-wizard.js   ← primeira vez (configura)
 *   node index.js          ← roda em loop
 */
"use strict";

const fs   = require("fs");
const net  = require("net");
const path = require("path");
const { imprimirWindows } = require("./lib/windows-printer");

const CONFIG_PATH = path.resolve(__dirname, "config.json");
const LOCK_PATH   = path.resolve(__dirname, "agent.lock");
const VERSION     = "1.11.0";  // 1.11: start-background.bat usa wscript (TOTALMENTE invisivel)

// ─── Lock file (anti-duplicação) ────────────────────────────
// Se agente já está rodando, sai. Lock = arquivo com PID.
// Se PID morto, sobrescreve. runner.vbs também checa isso ANTES
// de lançar, mas dupla checagem aqui em race condition.
function adquirirLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const pid = parseInt(fs.readFileSync(LOCK_PATH, "utf-8").trim(), 10);
      if (pid && pid !== process.pid) {
        try {
          // SIGNAL 0 = check if process alive (não mata)
          process.kill(pid, 0);
          console.error(`[lock] Agente já rodando (PID ${pid}). Saindo.`);
          process.exit(0);
        } catch {
          // PID morto, segue
          console.log(`[lock] Lock antigo (PID ${pid}) morto. Sobrescrevendo.`);
        }
      }
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid));
  } catch (err) {
    console.warn("[lock] Erro ao criar lock:", err.message);
  }
}
function liberarLock() {
  try { if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH); } catch {}
}
process.on("exit",    liberarLock);
process.on("SIGINT",  () => { liberarLock(); process.exit(0); });
process.on("SIGTERM", () => { liberarLock(); process.exit(0); });
process.on("SIGHUP",  () => { liberarLock(); process.exit(0); });
adquirirLock();

// ─── ESC/POS bytes ──────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const INIT     = Buffer.from([ESC, 0x40]);                  // ESC @ — reset
const CUT      = Buffer.from([GS,  0x56, 0x00]);            // GS V 0 — corte total
const FEED2    = Buffer.from([ESC, 0x64, 0x02]);            // ESC d 2 — pula 2 linhas
const ALIGN_L  = Buffer.from([ESC, 0x61, 0x00]);            // ESC a 0 — esquerda
// Codepage WPC1252 (Windows-1252 / Latin-1) — universal em térmicas,
// suporta todos acentos PT-BR (ã, ç, õ, é, etc).
// ESC t 16 = page 16 = WPC1252 na maioria das EPSON/Bematech/Daruma.
const CODEPAGE = Buffer.from([ESC, 0x74, 0x10]);            // ESC t 16
const CHARSET  = Buffer.from([ESC, 0x52, 0x08]);            // ESC R 8 — Brasil

let _configMtime = 0;
function loadConfig(force = false) {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[FATAL] ${CONFIG_PATH} não existe — rode o setup primeiro.`);
    console.error(`        Windows: clique em setup.bat`);
    console.error(`        Outros:  node setup-wizard.js`);
    process.exit(1);
  }
  // Hot-reload: relê só se arquivo mudou no disco
  const stat = fs.statSync(CONFIG_PATH);
  if (!force && cfg && stat.mtimeMs === _configMtime) return cfg;
  _configMtime = stat.mtimeMs;
  const novo = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  if (cfg) {
    console.log(`[CONFIG] recarregado do disco (setores: ${
      Object.entries(novo.impressoras).filter(([, v]) => v.ativa).map(([k]) => k).join(",") || "nenhum"
    })`);
  }
  return novo;
}

// ─── HTTP helpers ───────────────────────────────────────────
// HTTP keepAlive desabilitado pra evitar conexões zumbis em CF Tunnel.
// Tunnel CF as vezes mata TCP idle, próxima request pega socket morto
// e CF responde 502. Sem keep-alive abre TCP novo sempre = mais robusto
// (custo: ~10ms a mais por request, irrelevante em polling de 3s).
const _https = require("https");
const _http  = require("http");
const httpsAgent = new _https.Agent({ keepAlive: false });
const httpAgent  = new _http.Agent({ keepAlive: false });

async function httpJson(method, url, agentKey, body) {
  const u    = new URL(url);
  const lib  = u.protocol === "https:" ? _https : _http;
  const agt  = u.protocol === "https:" ? httpsAgent : httpAgent;
  const data = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      method,
      hostname: u.hostname,
      port:     u.port || (u.protocol === "https:" ? 443 : 80),
      path:     u.pathname + u.search,
      agent:    agt,
      headers: {
        "Authorization":   `Bearer ${agentKey}`,
        "X-Agent-Version": VERSION,
        "User-Agent":      `CardapioPrintAgent/${VERSION}`,
        "Content-Type":    "application/json",
        "Accept":          "application/json",
        "Connection":      "close",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
      timeout: 30000,
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        // 502/503/504 do Cloudflare retornam HTML/texto, não JSON.
        // Trata explicitamente sem tentar parsear como JSON.
        if (res.statusCode === 502 || res.statusCode === 503 || res.statusCode === 504) {
          return reject(new Error(`HTTP ${res.statusCode} (CF/origem temporariamente indisponível)`));
        }
        try {
          const parsed = buf ? JSON.parse(buf) : {};
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode} parse: ${e.message} | body: ${buf.slice(0, 100)}`));
        }
      });
    });
    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    if (data) req.write(data);
    req.end();
  });
}

// ─── Impressão TCP (ESC/POS) ────────────────────────────────
function imprimirTCP(ip, porta, payload) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch {}
      err ? reject(err) : resolve();
    };
    sock.setTimeout(8000);
    sock.on("error",   finish);
    sock.on("timeout", () => finish(new Error("TCP timeout")));
    sock.connect(porta, ip, () => {
      sock.write(payload, (err) => {
        if (err) return finish(err);
        setTimeout(() => finish(null), 400);
      });
    });
  });
}

// Tabela de transliteração pra chars sem equivalente direto em CP1252
const REPLACE = [
  [/—|–/g, "-"],
  [/“|”/g, '"'],
  [/‘|’/g, "'"],
  [/…/g, "..."],
  [/✓/g,  "[OK]"],
  [/✗|✖/g, "[X]"],
  [/⚠/g,  "[!]"],
  [/•/g,  "*"],
];

function sanitize(s) {
  let out = String(s);
  for (const [re, sub] of REPLACE) out = out.replace(re, sub);
  return out;
}

// Gera comandos ESC/POS pra imprimir código de barras Code128.
// data = string ASCII (números/letras). Compatível com EPSON/Bematech/Daruma.
//
// Comandos:
//   GS h n          altura em pontos (n=80 ≈ 1cm)
//   GS w n          largura do módulo (n=2-3)
//   GS H n          posição HRI (2 = abaixo)
//   GS f n          fonte HRI (0 = padrão)
//   GS k 73 len d   imprime Code128 (m=73, len bytes, data bytes)
function escposBarcode128(data) {
  const payload = Buffer.from("{B" + data, "ascii"); // {B = code set B
  return Buffer.concat([
    Buffer.from([GS, 0x68, 80]),                    // height
    Buffer.from([GS, 0x77, 3]),                     // width
    Buffer.from([GS, 0x48, 2]),                     // HRI position: below
    Buffer.from([GS, 0x66, 0]),                     // HRI font
    Buffer.from([GS, 0x6b, 73, payload.length]),    // GS k 73 len
    payload,
    Buffer.from([0x0a]),                            // LF final
  ]);
}

// Encontra padrões [BARCODE128:xxxx] e substitui por comandos ESC/POS.
// Pra impressoras que não suportam (raras), o fallback é não imprimir nada
// (a legenda numérica já está em texto na linha seguinte).
function injetarBarcodes(conteudo) {
  const re = /\[BARCODE128:([A-Za-z0-9\-_.]{1,40})\]/g;
  const parts = [];
  let last = 0; let m;
  while ((m = re.exec(conteudo)) !== null) {
    if (m.index > last) {
      const text = conteudo.slice(last, m.index);
      parts.push(Buffer.from(sanitize(text).replace(/\n/g, "\r\n"), "latin1"));
    }
    parts.push(escposBarcode128(m[1]));
    last = m.index + m[0].length;
  }
  if (last < conteudo.length) {
    const text = conteudo.slice(last);
    parts.push(Buffer.from(sanitize(text).replace(/\n/g, "\r\n"), "latin1"));
  }
  return Buffer.concat(parts);
}

function montarPayloadTexto(conteudo) {
  // Se conteudo tem marcadores [BARCODE128:xxx], renderiza inline.
  const hasBarcode = /\[BARCODE128:/.test(conteudo);
  const body = hasBarcode
    ? injetarBarcodes(conteudo)
    : Buffer.from(sanitize(conteudo).replace(/\n/g, "\r\n") + "\r\n", "latin1");
  return Buffer.concat([INIT, CHARSET, CODEPAGE, ALIGN_L, body, FEED2, CUT]);
}

// ─── Loop principal ─────────────────────────────────────────
let cfg;

// Aliases entre setor do backend e config local
// (compatibilidade: 'caixa' ↔ 'pdv', 'retirada' ↔ 'balcao')
const SETOR_ALIAS = {
  caixa:    ["caixa", "pdv"],
  pdv:      ["pdv", "caixa"],
  retirada: ["retirada", "balcao"],
  balcao:   ["balcao", "retirada"],
};

function resolverSetor(setor, impressoras) {
  // Tenta o nome exato primeiro, depois aliases
  const candidatos = [setor, ...(SETOR_ALIAS[setor] || [])];
  for (const c of candidatos) {
    if (impressoras[c]?.ativa) return { setor: c, conf: impressoras[c] };
  }
  return null;
}

async function processarJob(job) {
  // Hot-reload do config a cada job (pega mudanças do setup.bat sem restart)
  cfg = loadConfig();

  const setor = job.impressora.setor;
  const resolved = resolverSetor(setor, cfg.impressoras);

  if (!resolved) {
    const setoresAtivos = Object.entries(cfg.impressoras)
      .filter(([, v]) => v.ativa).map(([k]) => k).join(", ") || "nenhum";
    return { sucesso: false, erro: `setor '${setor}' desativado neste agente (ativos: ${setoresAtivos})` };
  }
  const conf = resolved.conf;
  if (resolved.setor !== setor) {
    console.log(`  [alias] '${setor}' → '${resolved.setor}'`);
  }

  // Se vier ESC/POS pré-formatado (base64), envia raw. Senão monta texto.
  const formato = job.formato || "text";
  const payload = formato === "escpos"
    ? Buffer.from(job.conteudo || "", "base64")
    : montarPayloadTexto(job.conteudo || "");
  const tipo    = conf.tipo || "tcp";

  try {
    if (tipo === "windows") {
      if (!conf.printer_name) throw new Error(`sem printer_name pra setor '${setor}'`);
      await imprimirWindows(conf.printer_name, payload);
      console.log(`  ✓ job ${job.id.slice(0, 8)} → ${setor} via Windows: ${conf.printer_name}`);
    } else {
      const ip    = conf.ip    || job.impressora.ip;
      const porta = conf.porta || job.impressora.porta || 9100;
      if (!ip) throw new Error(`sem IP pra setor '${setor}'`);
      await imprimirTCP(ip, porta, payload);
      console.log(`  ✓ job ${job.id.slice(0, 8)} → ${setor} via TCP: ${ip}:${porta}`);
    }
    return { sucesso: true };
  } catch (err) {
    console.warn(`  ✗ job ${job.id.slice(0, 8)} → ${setor} — ${err.message}`);
    return { sucesso: false, erro: err.message };
  }
}

// Backoff em erros transitórios (502/503/504/timeout): em vez de
// floodar o log com 1 erro por segundo, dobra o intervalo até 60s.
// Reseta pra cfg.pollMs após sucesso.
let _backoffMs = 0;
let _lastErrMsg = "";
let _errStreak = 0;

async function tick() {
  if (_backoffMs > 0) {
    // Pula o tick atual pra respeitar backoff
    _backoffMs -= cfg.pollMs;
    return;
  }
  try {
    const r = await httpJson("GET", `${cfg.apiUrl}/api/agent/jobs`, cfg.agentKey);
    // Sucesso: reseta backoff
    if (_errStreak > 0) {
      console.log(`[poll] ✓ reconectado após ${_errStreak} falhas`);
      _errStreak = 0;
      _lastErrMsg = "";
    }
    const jobs = r.jobs || [];
    if (jobs.length === 0) return;

    console.log(`[${new Date().toISOString()}] ${jobs.length} job(s)`);
    for (const job of jobs) {
      const result = await processarJob(job);
      try {
        await httpJson("POST", `${cfg.apiUrl}/api/agent/jobs/${job.id}/ack`, cfg.agentKey, result);
      } catch (e) {
        console.warn(`  ! falha ao ackar ${job.id}: ${e.message}`);
      }
    }
  } catch (err) {
    _errStreak++;
    // Backoff exponencial: 5s, 10s, 20s, 40s, 60s (cap)
    const backoff = Math.min(60000, 5000 * Math.pow(2, Math.min(4, _errStreak - 1)));
    _backoffMs = backoff;
    // Só loga a 1ª vez do erro e a cada 10 ocorrências (anti-flood)
    if (err.message !== _lastErrMsg || _errStreak % 10 === 1) {
      console.warn(`[poll #${_errStreak}] ${err.message} — backoff ${backoff / 1000}s`);
      _lastErrMsg = err.message;
    }
  }
}

async function main() {
  cfg = loadConfig();
  console.log(`Cardápio Print Agent v${VERSION}`);
  console.log(`Servidor: ${cfg.apiUrl}`);
  console.log(`Setores ativos: ${
    Object.entries(cfg.impressoras)
      .filter(([, v]) => v.ativa)
      .map(([k, v]) => v.tipo === "windows"
        ? `${k}→${v.printer_name}`
        : `${k}→${v.ip}:${v.porta}`)
      .join(", ") || "(nenhum)"
  }`);
  console.log(`Polling a cada ${cfg.pollMs}ms — Ctrl+C para sair\n`);

  // Tentativa inicial de auth — APENAS pra logar feedback.
  // Não derruba o agente em caso de falha (CF pode estar instável,
  // 502 do tunnel, etc). O tick() faz retry com backoff exponencial.
  try {
    await httpJson("GET", `${cfg.apiUrl}/api/agent/jobs`, cfg.agentKey);
    console.log("✓ Autenticado no servidor.\n");
  } catch (err) {
    // 401 ainda é fatal — key errada, não adianta retry
    if (err.message.includes("HTTP 401") || err.message.includes("HTTP 403")) {
      console.error(`[FATAL] credenciais rejeitadas: ${err.message}`);
      console.error("        Re-cadastre o agente em /painel/impressoras → Gerar key");
      process.exit(2);
    }
    // Outros erros (502, timeout, etc) — segue rodando, retry via tick()
    console.warn(`[WARN] 1ª autenticação falhou (${err.message}). Tentando reconectar via polling…`);
  }

  setInterval(tick, cfg.pollMs);
  tick();
}

main().catch((err) => { console.error(err); process.exit(1); });
