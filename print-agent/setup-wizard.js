#!/usr/bin/env node
/**
 * Wizard de configuração inicial do agente de impressão.
 *
 * Pergunta:
 *   - URL do servidor SaaS (ex: https://meusite.com)
 *   - agent_key (pak_xxx) gerada em /painel/impressoras
 *   - Para cada setor (autoatendimento/pdv/cozinha/bar): ativar? IP/porta?
 *
 * Salva em ./config.json (mesmo diretório do agente).
 *
 * Uso:  node setup-wizard.js
 */
"use strict";

const fs       = require("fs");
const path     = require("path");
const readline = require("readline");

const CONFIG_PATH = path.resolve(__dirname, "config.json");

const SETORES = [
  { key: "autoatendimento", label: "Autoatendimento (totem)" },
  { key: "pdv",             label: "PDV / Caixa" },
  { key: "cozinha",         label: "Cozinha" },
  { key: "bar",             label: "Bar" },
  { key: "balcao",          label: "Balcão / Retirada" },
];

function ask(rl, q, def) {
  return new Promise((resolve) => {
    const prompt = def != null ? `${q} [${def}] ` : `${q} `;
    rl.question(prompt, (a) => resolve(a.trim() || def || ""));
  });
}

async function askBool(rl, q, def = false) {
  const d = def ? "S/n" : "s/N";
  const a = (await ask(rl, `${q} (${d})`)).toLowerCase();
  if (!a) return def;
  return a.startsWith("s") || a.startsWith("y");
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Cardápio SaaS — Agente de Impressão Local   ║");
  console.log("║  Wizard de configuração inicial               ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let prev = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try { prev = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); } catch {}
    console.log("Encontrei config.json existente — Enter mantém o valor atual.\n");
  }

  const apiUrl   = await ask(rl, "URL do servidor SaaS (sem barra final):", prev.apiUrl || "https://app.exemplo.com");
  const agentKey = await ask(rl, "agent_key (pak_xxxxxxxx):",                prev.agentKey || "");

  if (!agentKey.startsWith("pak_")) {
    console.error("\n[!] agent_key inválida — deve começar com 'pak_'");
    process.exit(1);
  }

  const pollMs = parseInt(await ask(rl, "Intervalo de poll (ms):", String(prev.pollMs || 2000)), 10) || 2000;

  console.log("\n— Configuração das impressoras por setor —");
  console.log("(IP é o IP da impressora térmica na rede local. Porta padrão ESC/POS = 9100)\n");

  const impressoras = {};
  for (const s of SETORES) {
    const prevImp = (prev.impressoras && prev.impressoras[s.key]) || {};
    const ativar = await askBool(rl, `Ativar setor "${s.label}"?`, !!prevImp.ativa);
    if (!ativar) { impressoras[s.key] = { ativa: false }; continue; }

    const ip    = await ask(rl, `  IP da impressora ${s.key}:`,    prevImp.ip    || "192.168.0.100");
    const porta = parseInt(await ask(rl, `  Porta:`, String(prevImp.porta || 9100)), 10) || 9100;
    impressoras[s.key] = { ativa: true, ip, porta };
  }

  const config = { apiUrl, agentKey, pollMs, impressoras };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");

  console.log(`\n✓ Configuração salva em ${CONFIG_PATH}`);
  console.log("Agora rode:  node index.js\n");

  rl.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
