#!/usr/bin/env node
"use strict";

const fs       = require("fs");
const path     = require("path");
const readline = require("readline");

const CONFIG_PATH = path.resolve(__dirname, "config.json");

function ask(rl, q, def) {
  return new Promise(r => {
    const p = def != null ? `${q} [${def}] ` : `${q} `;
    rl.question(p, a => r(a.trim() || def || ""));
  });
}

async function main() {
  console.log("\nCardapio VPS Agent — Setup\n");
  let prev = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try { prev = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); } catch {}
    console.log("(config.json existente — Enter mantém o valor)\n");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const apiUrl   = await ask(rl, "URL do servidor SaaS:",
    prev.apiUrl || "https://app.tthreedigital.com.br");
  const agentKey = await ask(rl, "agent_key (gerada no /admin/vps):", prev.agentKey || "");
  if (!agentKey.startsWith("vak_")) {
    console.error("agent_key precisa começar com 'vak_'");
    process.exit(1);
  }
  const pollMs = parseInt(await ask(rl, "Intervalo de poll (ms):",
    String(prev.pollMs || 5000)), 10) || 5000;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ apiUrl, agentKey, pollMs }, null, 2));
  console.log(`\n✓ Salvo em ${CONFIG_PATH}\n`);
  console.log("Próximo passo:");
  console.log("  sudo node index.js          # roda em primeiro plano (testar)");
  console.log("  bash install-systemd.sh     # instala como serviço (sobe sozinho)\n");
  rl.close();
}
main();
