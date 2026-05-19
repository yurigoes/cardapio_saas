#!/usr/bin/env node
/**
 * Wizard de configuração do agente.
 *
 * Detecta impressoras Windows automaticamente e oferece como menu.
 * Pra impressoras de rede pede o IP.
 *
 * Salva em ./config.json.
 */
"use strict";

const fs       = require("fs");
const path     = require("path");
const readline = require("readline");
const { listarImpressorasWindows } = require("./lib/windows-printer");

const CONFIG_PATH = path.resolve(__dirname, "config.json");

const SETORES = [
  { key: "cozinha",         label: "Cozinha" },
  { key: "caixa",           label: "Caixa (cupom cliente + fechamento)" },
  { key: "bar",             label: "Bar" },
  { key: "balcao",          label: "Balcão / Retirada" },
  { key: "motoboy",         label: "Motoboy (cupons de entrega)" },
  { key: "autoatendimento", label: "Autoatendimento (totem)" },
  { key: "pdv",             label: "PDV (legado — mesmo que caixa)" },
];

function ask(rl, q, def) {
  return new Promise((resolve) => {
    const prompt = def != null && def !== "" ? `${q} [${def}] ` : `${q} `;
    rl.question(prompt, (a) => resolve(a.trim() || def || ""));
  });
}

async function askBool(rl, q, def = false) {
  const d = def ? "S/n" : "s/N";
  const a = (await ask(rl, `${q} (${d})`)).toLowerCase();
  if (!a) return def;
  return a.startsWith("s") || a.startsWith("y");
}

async function askMenu(rl, q, options, def = 0) {
  console.log(`\n${q}`);
  options.forEach((opt, i) => {
    const marker = i === def ? "→" : " ";
    console.log(`  ${marker} ${i + 1}) ${opt}`);
  });
  while (true) {
    const r = await ask(rl, `Escolha (1-${options.length}):`, String(def + 1));
    const n = parseInt(r, 10);
    if (n >= 1 && n <= options.length) return n - 1;
    console.log(`  Valor inválido — digite 1 a ${options.length}`);
  }
}

async function configurarSetor(rl, setor, prev, impressorasWin) {
  console.log(`\n━━ ${setor.label.toUpperCase()} ━━`);

  const ativar = await askBool(rl, `Ativar este setor neste agente?`, !!prev.ativa);
  if (!ativar) return { ativa: false };

  // Modo de impressora
  const opcoes = [
    "Impressora de REDE (com IP)",
  ];
  if (impressorasWin.length > 0) {
    opcoes.push(`Impressora WINDOWS local/compartilhada (${impressorasWin.length} detectadas)`);
  } else if (process.platform === "win32") {
    opcoes.push("Impressora WINDOWS local/compartilhada (digitar nome)");
  }

  const tipoIdx = await askMenu(rl, "Como esta impressora está conectada?",
    opcoes,
    prev.tipo === "windows" ? 1 : 0
  );
  const tipo = tipoIdx === 1 ? "windows" : "tcp";

  if (tipo === "windows") {
    let printer_name;
    if (impressorasWin.length > 0) {
      const idx = await askMenu(rl, "Qual impressora?",
        impressorasWin,
        impressorasWin.indexOf(prev.printer_name) >= 0 ? impressorasWin.indexOf(prev.printer_name) : 0
      );
      printer_name = impressorasWin[idx];
    } else {
      printer_name = await ask(rl, "Nome da impressora (ex: POS-58):", prev.printer_name);
    }
    return { ativa: true, tipo: "windows", printer_name };
  } else {
    const ip    = await ask(rl, "IP da impressora (ex: 192.168.0.100):", prev.ip || "192.168.0.100");
    const porta = parseInt(await ask(rl, "Porta:", String(prev.porta || 9100)), 10) || 9100;
    return { ativa: true, tipo: "tcp", ip, porta };
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Three Digital — Agente de Impressão Local   ║");
  console.log("║  Configuração inicial                         ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Detecta impressoras Windows
  let impressorasWin = [];
  if (process.platform === "win32") {
    process.stdout.write("Detectando impressoras Windows... ");
    impressorasWin = await listarImpressorasWindows();
    console.log(impressorasWin.length > 0
      ? `${impressorasWin.length} encontrada(s)`
      : "nenhuma encontrada");
    if (impressorasWin.length > 0) {
      impressorasWin.forEach(p => console.log(`  • ${p}`));
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let prev = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try { prev = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); } catch {}
    console.log("\nEncontrei config.json existente — Enter mantém o valor atual.");
  }

  console.log("\n━━ CONEXÃO COM O SERVIDOR ━━");
  const apiUrl   = await ask(rl, "URL do servidor SaaS:", prev.apiUrl || "https://app.tthreedigital.com.br");
  const agentKey = await ask(rl, "agent_key (pak_xxxx, gerada no painel):", prev.agentKey || "");

  if (!agentKey.startsWith("pak_")) {
    console.error("\n[!] agent_key inválida — deve começar com 'pak_'");
    process.exit(1);
  }

  const pollMs = parseInt(
    await ask(rl, "Intervalo de poll em ms:", String(prev.pollMs || 2000)),
    10
  ) || 2000;

  console.log("\n━━ IMPRESSORAS POR SETOR ━━");
  console.log("(Você pode ativar só os setores que essa máquina vai imprimir.");
  console.log(" Ex: o PC da cozinha ativa só 'cozinha'; o do caixa ativa 'pdv'.)");

  const impressoras = {};
  for (const s of SETORES) {
    const prevImp = (prev.impressoras && prev.impressoras[s.key]) || {};
    impressoras[s.key] = await configurarSetor(rl, s, prevImp, impressorasWin);
  }

  const config = { apiUrl, agentKey, pollMs, impressoras };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");

  console.log(`\n✓ Configuração salva em ${CONFIG_PATH}`);
  console.log("\nPróximo passo:");
  console.log("  Windows: dê duplo clique em start.bat (ou install-service.bat para rodar em segundo plano)");
  console.log("  Outros:  node index.js\n");

  rl.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
