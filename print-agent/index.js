#!/usr/bin/env node
/**
 * Cardápio SaaS — Print Agent
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
const VERSION     = "1.4.0";  // 1.4: suporte a [BARCODE128:xxx] inline

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
async function httpJson(method, url, agentKey, body) {
  const u   = new URL(url);
  const lib = u.protocol === "https:" ? require("https") : require("http");
  const data = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      method,
      hostname: u.hostname,
      port:     u.port || (u.protocol === "https:" ? 443 : 80),
      path:     u.pathname + u.search,
      headers: {
        "Authorization":   `Bearer ${agentKey}`,
        "X-Agent-Version": VERSION,
        "Content-Type":    "application/json",
        "Accept":          "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
      timeout: 30000,
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try {
          const parsed = buf ? JSON.parse(buf) : {};
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
          }
          resolve(parsed);
        } catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
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

async function tick() {
  try {
    const r = await httpJson("GET", `${cfg.apiUrl}/api/agent/jobs`, cfg.agentKey);
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
    console.warn(`[poll] ${err.message}`);
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

  try {
    await httpJson("GET", `${cfg.apiUrl}/api/agent/jobs`, cfg.agentKey);
    console.log("✓ Autenticado no servidor.\n");
  } catch (err) {
    console.error(`[FATAL] não foi possível autenticar: ${err.message}`);
    process.exit(2);
  }

  setInterval(tick, cfg.pollMs);
  tick();
}

main().catch((err) => { console.error(err); process.exit(1); });
