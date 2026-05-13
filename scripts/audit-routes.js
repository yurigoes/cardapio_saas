#!/usr/bin/env node
/**
 * Audit de rotas — para cada role, faz login e bate GET em todas as
 * rotas declaradas em src/app/api/​**​/route.ts. Gera audit-report.md
 * com o status de cada rota por role.
 *
 * Pré-requisitos:
 *   - Rodar `bash scripts/seed-demo-users.sh` antes (cria usuários
 *     com senha "Demo2026")
 *   - App rodando (default: https://app.tthreedigital.com.br)
 *
 * Uso:
 *   BASE_URL=https://app.tthreedigital.com.br \
 *   MASTER_EMAIL=master@tthreedigital.com.br \
 *   MASTER_SENHA=Master2026Cardapio \
 *   node scripts/audit-routes.js
 */
"use strict";

const fs   = require("fs");
const path = require("path");

const BASE_URL      = process.env.BASE_URL      || "https://app.tthreedigital.com.br";
const MASTER_EMAIL  = process.env.MASTER_EMAIL  || "master@tthreedigital.com.br";
const MASTER_SENHA  = process.env.MASTER_SENHA  || "Master2026Cardapio";
const DEMO_SENHA    = process.env.DEMO_SENHA    || "Demo2026";
const TIMEOUT_MS    = 8000;

const ROLES = [
  { role: "master",     email: MASTER_EMAIL,           senha: MASTER_SENHA },
  { role: "admin",      email: "admin@demo.com",       senha: DEMO_SENHA   },
  { role: "gerente",    email: "gerente@demo.com",     senha: DEMO_SENHA   },
  { role: "garcom",     email: "garcom@demo.com",      senha: DEMO_SENHA   },
  { role: "cozinha",    email: "cozinha@demo.com",     senha: DEMO_SENHA   },
  { role: "financeiro", email: "financeiro@demo.com",  senha: DEMO_SENHA   },
  { role: "atendente",  email: "atendente@demo.com",   senha: DEMO_SENHA   },
  { role: "delivery",   email: "delivery@demo.com",    senha: DEMO_SENHA   },
  { role: "motoboy",    email: "motoboy@demo.com",     senha: DEMO_SENHA   },
];

// ─── Coleta rotas do filesystem ─────────────────────────────
function listarRotas(base) {
  const rotas = [];
  function walk(dir, urlPath) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // [param] vira :param na URL
        const segment = e.name.startsWith("[") && e.name.endsWith("]")
          ? `:${e.name.slice(1, -1)}`
          : e.name;
        walk(full, urlPath + "/" + segment);
      } else if (e.name === "route.ts" || e.name === "route.js") {
        const src = fs.readFileSync(full, "utf-8");
        const methods = [];
        if (/export\s+(async\s+)?function\s+GET/.test(src))    methods.push("GET");
        if (/export\s+(async\s+)?function\s+POST/.test(src))   methods.push("POST");
        if (/export\s+(async\s+)?function\s+PATCH/.test(src))  methods.push("PATCH");
        if (/export\s+(async\s+)?function\s+PUT/.test(src))    methods.push("PUT");
        if (/export\s+(async\s+)?function\s+DELETE/.test(src)) methods.push("DELETE");
        rotas.push({ urlPath, methods });
      }
    }
  }
  walk(base, "/api");
  return rotas;
}

// ─── HTTP cliente sem dependência ───────────────────────────
async function http(method, url, { token, body } = {}) {
  const u   = new URL(url);
  const lib = u.protocol === "https:" ? require("https") : require("http");
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve) => {
    const req = lib.request({
      method,
      hostname: u.hostname,
      port:     u.port || (u.protocol === "https:" ? 443 : 80),
      path:     u.pathname + u.search,
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(data  ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = buf ? JSON.parse(buf) : null; } catch {}
        resolve({ status: res.statusCode, body: parsed, raw: buf.slice(0, 200) });
      });
    });
    req.on("error",   (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", ()  => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
    if (data) req.write(data);
    req.end();
  });
}

// ─── Login ───────────────────────────────────────────────────
async function login(email, senha) {
  const r = await http("POST", `${BASE_URL}/api/auth/login`, { body: { email, senha } });
  if (r.status === 200 && r.body?.data?.access_token) return r.body.data.access_token;
  return null;
}

// ─── Substitui :params por valores fake (UUID zero) ──────────
function preencherParams(urlPath) {
  return urlPath.replace(/:\w+/g, "00000000-0000-0000-0000-000000000000");
}

// ─── Classifica resultado ────────────────────────────────────
function classificar(status) {
  if (status === 0)            return "TIMEOUT";
  if (status === 200)          return "OK";
  if (status === 201)          return "OK";
  if (status === 204)          return "OK";
  if (status === 400)          return "BAD_REQ";   // params fake — esperado em rotas com :id
  if (status === 401)          return "AUTH";
  if (status === 403)          return "FORBID";
  if (status === 404)          return "NOT_FOUND"; // ID fake — esperado
  if (status === 405)          return "METHOD";
  if (status === 422)          return "VALIDATION";
  if (status === 429)          return "RATE_LIMIT";
  if (status >= 500)           return "ERROR";
  return `HTTP_${status}`;
}

function emoji(c) {
  if (c === "OK")        return "✅";
  if (c === "FORBID")    return "🚫"; // esperado por design pra alguns roles
  if (c === "AUTH")      return "🔒";
  if (c === "NOT_FOUND") return "❓"; // ID fake — geralmente esperado
  if (c === "BAD_REQ")   return "⚠️";
  if (c === "ERROR")     return "❌"; // bug — investigar
  if (c === "TIMEOUT")   return "⏱️";
  return "·";
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`\nAudit de rotas — ${BASE_URL}\n`);

  // 1. Coleta rotas do FS
  const apiDir = path.resolve(__dirname, "..", "src", "app", "api");
  if (!fs.existsSync(apiDir)) {
    console.error(`✖ Não encontrei ${apiDir}`);
    process.exit(1);
  }
  const rotas = listarRotas(apiDir);
  // Só GETs por enquanto (POST/PATCH precisariam payload válido por rota)
  const rotasGet = rotas.filter(r => r.methods.includes("GET"));
  console.log(`✓ ${rotas.length} rotas encontradas (${rotasGet.length} com GET)\n`);

  // 2. Login com cada role
  console.log("Autenticando roles...");
  const tokens = {};
  for (const r of ROLES) {
    process.stdout.write(`  ${r.role.padEnd(12)} `);
    const token = await login(r.email, r.senha);
    if (token) {
      tokens[r.role] = token;
      console.log(`✓ ${r.email}`);
    } else {
      console.log(`✗ ${r.email} (login falhou — usuário não existe ou senha errada)`);
    }
  }

  // 3. Pra cada role, bate GET em cada rota
  console.log(`\nTestando ${rotasGet.length} GETs × ${Object.keys(tokens).length} roles...`);
  const resultados = []; // { rota, role, status, classe }

  for (const rota of rotasGet) {
    const url = BASE_URL + preencherParams(rota.urlPath);
    for (const role of Object.keys(tokens)) {
      const r = await http("GET", url, { token: tokens[role] });
      resultados.push({
        rota: rota.urlPath, role, status: r.status,
        classe: classificar(r.status),
        amostra: r.raw,
      });
    }
    process.stdout.write(".");
  }
  console.log("\n");

  // 4. Gera relatório markdown
  const out = ["# Audit de rotas\n"];
  out.push(`Gerado em: ${new Date().toISOString()}`);
  out.push(`Base URL: ${BASE_URL}\n`);
  out.push(`## Legenda\n`);
  out.push(`- ✅ OK (200/201/204)`);
  out.push(`- 🚫 FORBID (403 — esperado pra roles sem permissão)`);
  out.push(`- 🔒 AUTH (401 — token rejeitado, possível bug)`);
  out.push(`- ❓ NOT_FOUND (404 — ID fake usado, esperado em rotas com :param)`);
  out.push(`- ⚠️ BAD_REQ (400 — params fake, esperado em algumas rotas)`);
  out.push(`- ❌ **ERROR (500+) — BUG, precisa investigar**`);
  out.push(`- ⏱️ TIMEOUT\n`);

  // Tabela: linha = rota, coluna = role
  const roles = Object.keys(tokens);
  out.push(`## Matriz por rota\n`);
  out.push(`| Rota | ${roles.join(" | ")} |`);
  out.push(`|------|${roles.map(() => "------").join("|")}|`);

  // Agrupa por rota
  const porRota = new Map();
  for (const r of resultados) {
    if (!porRota.has(r.rota)) porRota.set(r.rota, {});
    porRota.get(r.rota)[r.role] = r;
  }

  for (const [rota, byRole] of porRota) {
    const cells = roles.map(r => {
      const x = byRole[r];
      if (!x) return "—";
      return `${emoji(x.classe)} ${x.status}`;
    });
    out.push(`| \`${rota}\` | ${cells.join(" | ")} |`);
  }

  // Lista de erros 500
  const erros = resultados.filter(r => r.classe === "ERROR" || r.classe === "TIMEOUT");
  out.push(`\n## ${erros.length} erros 500/timeout (priorizar)\n`);
  if (erros.length === 0) {
    out.push(`Nenhum 500 detectado nos GETs.`);
  } else {
    out.push(`| Rota | Role | Status | Resposta |`);
    out.push(`|------|------|--------|----------|`);
    for (const e of erros) {
      out.push(`| \`${e.rota}\` | ${e.role} | ${e.status} | \`${(e.amostra || "").slice(0, 100).replace(/\n/g, " ")}\` |`);
    }
  }

  // Roles que falharam login
  const falhouLogin = ROLES.filter(r => !tokens[r.role]);
  if (falhouLogin.length > 0) {
    out.push(`\n## Roles sem login\n`);
    out.push(`Estes roles não conseguiram autenticar — rode \`bash scripts/seed-demo-users.sh\`:\n`);
    for (const r of falhouLogin) out.push(`- ${r.role} (${r.email})`);
  }

  const outFile = path.resolve(__dirname, "..", "audit-report.md");
  fs.writeFileSync(outFile, out.join("\n"), "utf-8");
  console.log(`✓ Relatório salvo em ${outFile}`);
  console.log(`  ${erros.length} erros 500/timeout encontrados`);
}

main().catch((err) => { console.error(err); process.exit(1); });
