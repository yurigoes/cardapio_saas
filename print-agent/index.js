#!/usr/bin/env node
/**
 * Cardápio SaaS — Print Agent
 *
 * Long-poll de jobs em GET /api/agent/jobs e envia ESC/POS por TCP
 * para impressoras locais conforme `config.json` (criado pelo setup-wizard).
 *
 * Uso:
 *   node setup-wizard.js   ← primeira vez
 *   node index.js          ← roda em loop
 */
"use strict";

const fs   = require("fs");
const net  = require("net");
const path = require("path");

const CONFIG_PATH = path.resolve(__dirname, "config.json");
const VERSION     = "1.0.0";

// ─── ESC/POS bytes ──────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const INIT       = Buffer.from([ESC, 0x40]);                   // @ - reset
const CUT        = Buffer.from([GS,  0x56, 0x00]);             // full cut
const FEED3      = Buffer.from([ESC, 0x64, 0x03]);             // feed 3 lines
const ALIGN_C    = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_L    = Buffer.from([ESC, 0x61, 0x00]);
const BOLD_ON    = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF   = Buffer.from([ESC, 0x45, 0x00]);
const SIZE_2X    = Buffer.from([GS,  0x21, 0x11]);             // double w+h
const SIZE_1X    = Buffer.from([GS,  0x21, 0x00]);

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[FATAL] ${CONFIG_PATH} não existe — rode 'node setup-wizard.js' primeiro.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

// ─── HTTP helpers (sem dependências externas) ───────────────
async function httpJson(method, url, agentKey, body) {
  const u = new URL(url);
  const lib = u.protocol === "https:" ? require("https") : require("http");
  const data = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      method,
      hostname: u.hostname,
      port:     u.port || (u.protocol === "https:" ? 443 : 80),
      path:     u.pathname + u.search,
      headers: {
        "Authorization":     `Bearer ${agentKey}`,
        "X-Agent-Version":   VERSION,
        "Content-Type":      "application/json",
        "Accept":            "application/json",
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
        // dá tempo da impressora drenar antes de fechar
        setTimeout(() => finish(null), 400);
      });
    });
  });
}

function montarPayloadTexto(conteudo) {
  // conteúdo é texto pré-formatado pelo backend (formatadores.ts)
  // Aqui só envolvemos com INIT + texto + FEED + CUT.
  // CP850/Latin1 funciona na maioria das térmicas; se sua impressora exigir,
  // pode rodar `iconv` aqui — mantivemos UTF-8 por padrão.
  const body = Buffer.from(conteudo.replace(/\n/g, "\r\n") + "\r\n", "utf-8");
  return Buffer.concat([INIT, ALIGN_L, body, FEED3, CUT]);
}

// ─── Loop principal ─────────────────────────────────────────
let cfg;

async function processarJob(job) {
  const setor = job.impressora.setor;
  const conf  = cfg.impressoras[setor];

  if (!conf || !conf.ativa) {
    return { sucesso: false, erro: `setor '${setor}' desativado neste agente` };
  }

  const ip    = conf.ip    || job.impressora.ip;
  const porta = conf.porta || job.impressora.porta || 9100;
  if (!ip) return { sucesso: false, erro: `sem IP para setor '${setor}'` };

  try {
    const payload = montarPayloadTexto(job.conteudo || "");
    await imprimirTCP(ip, porta, payload);
    console.log(`  ✓ job ${job.id.slice(0, 8)} → ${setor} @ ${ip}:${porta}`);
    return { sucesso: true };
  } catch (err) {
    console.warn(`  ✗ job ${job.id.slice(0, 8)} → ${setor} @ ${ip}:${porta} — ${err.message}`);
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
      .map(([k, v]) => `${k}@${v.ip}:${v.porta}`).join(", ") || "(nenhum)"
  }`);
  console.log(`Polling a cada ${cfg.pollMs}ms — Ctrl+C para sair\n`);

  // ping inicial pra detectar key inválida cedo
  try {
    await httpJson("GET", `${cfg.apiUrl}/api/agent/jobs`, cfg.agentKey);
    console.log("✓ Autenticado no servidor.\n");
  } catch (err) {
    console.error(`[FATAL] não foi possível autenticar: ${err.message}`);
    process.exit(2);
  }

  // loop
  setInterval(tick, cfg.pollMs);
  tick();
}

main().catch((err) => { console.error(err); process.exit(1); });
