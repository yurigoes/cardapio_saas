/**
 * Cardápio SaaS — Slave Agent
 * Roda no Windows do restaurante.
 * - Modo CLOUD: apenas client web local → acessa nuvem diretamente
 * - Modo SLAVE: sincroniza pedidos, gerencia impressão local
 */

const express = require("express");
const http    = require("http");
const path    = require("path");
const fs      = require("fs");
const open    = require("open");
const Conf    = require("conf");
const axios   = require("axios");

// ── Configurações persistentes ─────────────────────────────────
const config = new Conf({
  projectName: "cardapio-slave",
  defaults: {
    mode:        null,      // "cloud" | "slave"
    cloudUrl:    "",        // https://cardapio.suaempresa.com.br
    slaveKey:    "",        // chave gerada pelo admin master
    empresaId:   "",
    empresaSlug: "",
    printerType: "network", // "network" | "usb"
    printerHost: "",
    printerPort: 9100,
    autoStart:   true,
    port:        7878,
  },
});

const PORT = config.get("port");
const app  = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "setup-wizard")));

// ── Estado runtime ─────────────────────────────────────────────
let syncInterval = null;
let wsCloudConn  = null;
let isConnected  = false;
let lastSync     = null;
let pendingPrints = [];

// ── Helpers ────────────────────────────────────────────────────
function log(msg)  { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg) { console.warn(`[WARN] ${msg}`); }

function getCloudHeaders() {
  return {
    "Authorization": `Slave ${config.get("slaveKey")}`,
    "X-Slave-Version": "1.0.0",
    "Content-Type": "application/json",
  };
}

// ── API: Status ────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    mode:        config.get("mode"),
    configured:  !!config.get("slaveKey") || config.get("mode") === "cloud",
    connected:   isConnected,
    lastSync,
    cloudUrl:    config.get("cloudUrl"),
    empresaSlug: config.get("empresaSlug"),
    version:     "1.0.0",
    platform:    process.platform,
  });
});

// ── API: Setup inicial ─────────────────────────────────────────
app.post("/api/setup", async (req, res) => {
  const { mode, cloudUrl, slaveKey, printerType, printerHost, printerPort } = req.body;

  if (!["cloud", "slave"].includes(mode)) {
    return res.status(400).json({ error: "Modo inválido" });
  }
  if (!cloudUrl) {
    return res.status(400).json({ error: "URL da nuvem obrigatória" });
  }

  // Testa conexão com a nuvem
  try {
    const testUrl = `${cloudUrl.replace(/\/$/, "")}/api/health`;
    const resp = await axios.get(testUrl, { timeout: 10000 });
    if (!resp.data?.status === "ok" && !resp.data?.data) {
      return res.status(400).json({ error: "API da nuvem não respondeu corretamente" });
    }
  } catch {
    return res.status(400).json({ error: "Não foi possível conectar à URL informada" });
  }

  // Modo slave: valida slave_key
  if (mode === "slave") {
    if (!slaveKey) {
      return res.status(400).json({ error: "Slave Key obrigatória no modo slave" });
    }
    try {
      const authResp = await axios.post(
        `${cloudUrl.replace(/\/$/, "")}/api/sync/auth`,
        { slave_key: slaveKey },
        { timeout: 10000 }
      );
      if (!authResp.data?.data?.empresaId) {
        return res.status(401).json({ error: "Slave Key inválida ou empresa não encontrada" });
      }
      config.set("empresaId",   authResp.data.data.empresaId);
      config.set("empresaSlug", authResp.data.data.slug);
    } catch (err) {
      return res.status(401).json({ error: "Falha ao validar Slave Key: " + (err.response?.data?.error || err.message) });
    }
  }

  // Salva configurações
  config.set("mode",        mode);
  config.set("cloudUrl",    cloudUrl.replace(/\/$/, ""));
  config.set("slaveKey",    slaveKey || "");
  config.set("printerType", printerType || "network");
  config.set("printerHost", printerHost || "");
  config.set("printerPort", parseInt(printerPort || "9100"));

  // Inicia sync se modo slave
  if (mode === "slave") {
    startSync();
  }

  res.json({ success: true, mode, redirect: getAppUrl() });
});

// ── API: Configuração atual ────────────────────────────────────
app.get("/api/config", (req, res) => {
  res.json({
    mode:        config.get("mode"),
    cloudUrl:    config.get("cloudUrl"),
    printerType: config.get("printerType"),
    printerHost: config.get("printerHost"),
    printerPort: config.get("printerPort"),
    autoStart:   config.get("autoStart"),
  });
});

app.post("/api/config", (req, res) => {
  const allowed = ["printerType","printerHost","printerPort","autoStart","port"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      config.set(key, req.body[key]);
    }
  }
  res.json({ success: true });
});

// ── API: Impressão manual (teste) ─────────────────────────────
app.post("/api/print/test", async (req, res) => {
  try {
    await printText("=== TESTE DE IMPRESSÃO ===\nCardápio SaaS Slave\n" + new Date().toLocaleString("pt-BR") + "\n=========================\n\n\n");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Reset configuração ────────────────────────────────────
app.post("/api/reset", (req, res) => {
  config.clear();
  stopSync();
  res.json({ success: true });
});

// ── API: Pedidos pendentes (slave) ─────────────────────────────
app.get("/api/pedidos/pendentes", async (req, res) => {
  if (config.get("mode") !== "slave") {
    return res.status(400).json({ error: "Somente disponível no modo slave" });
  }
  try {
    const resp = await axios.get(
      `${config.get("cloudUrl")}/api/sync/pedidos?status=pendente`,
      { headers: getCloudHeaders(), timeout: 15000 }
    );
    res.json(resp.data);
  } catch (err) {
    res.status(502).json({ error: "Falha ao buscar pedidos: " + err.message });
  }
});

// ── Sync com nuvem (modo slave) ────────────────────────────────
async function syncWithCloud() {
  const cloudUrl  = config.get("cloudUrl");
  const slaveKey  = config.get("slaveKey");
  if (!cloudUrl || !slaveKey) return;

  try {
    // Pull: busca novos pedidos para imprimir
    const resp = await axios.get(`${cloudUrl}/api/sync/pedidos?status=pendente&novo=true`, {
      headers: getCloudHeaders(),
      timeout: 15000,
    });

    const pedidos = resp.data?.data || [];
    for (const pedido of pedidos) {
      await printPedido(pedido);
      // Confirma impressão
      await axios.patch(
        `${cloudUrl}/api/sync/pedidos/${pedido.id}/impresso`,
        {},
        { headers: getCloudHeaders() }
      ).catch(() => {});
    }

    isConnected = true;
    lastSync    = new Date().toISOString();
  } catch (err) {
    isConnected = false;
    warn("Sync falhou: " + err.message);
  }
}

function startSync() {
  if (syncInterval) return;
  syncWithCloud(); // primeira chamada imediata
  syncInterval = setInterval(syncWithCloud, 10_000); // a cada 10s
  log("Sync iniciado");
}

function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  isConnected = false;
}

// ── Impressão ESC/POS ──────────────────────────────────────────
async function printText(text) {
  const printerHost = config.get("printerHost");
  const printerPort = config.get("printerPort");

  if (!printerHost) {
    log("[PRINT SIMULADO]\n" + text);
    return;
  }

  try {
    const net = require("net");
    const client = new net.Socket();

    await new Promise((resolve, reject) => {
      client.connect(printerPort, printerHost, () => {
        // ESC/POS: Init + texto + corte
        const ESC  = 0x1B;
        const GS   = 0x1D;
        const init = Buffer.from([ESC, 0x40]);       // Initialize
        const cut  = Buffer.from([GS, 0x56, 0x41, 0x03]); // Partial cut

        const body = Buffer.from(text, "latin1");
        client.write(Buffer.concat([init, body, cut]));
        client.end();
        resolve();
      });
      client.on("error", reject);
      setTimeout(() => { client.destroy(); reject(new Error("Timeout")); }, 5000);
    });
    log("Impresso via rede: " + printerHost);
  } catch (err) {
    warn("Erro ao imprimir: " + err.message);
    throw err;
  }
}

async function printPedido(pedido) {
  const linha = "=".repeat(32);
  const itens = (pedido.itens || [])
    .map(i => `${i.quantidade}x ${i.nome.padEnd(20).slice(0,20)} R$${Number(i.preco_unitario * i.quantidade).toFixed(2)}`)
    .join("\n");

  const texto = [
    linha,
    `PEDIDO #${pedido.numero || pedido.id.slice(-6).toUpperCase()}`,
    `Tipo: ${pedido.tipo?.toUpperCase() || "?"}`,
    pedido.mesa_id ? `Mesa: ${pedido.comanda || "?"}` : "",
    pedido.cliente_nome ? `Cliente: ${pedido.cliente_nome}` : "",
    new Date(pedido.created_at).toLocaleString("pt-BR"),
    linha,
    itens,
    linha,
    `TOTAL: R$ ${Number(pedido.total || 0).toFixed(2)}`,
    pedido.observacoes ? `OBS: ${pedido.observacoes}` : "",
    linha,
    "",
    "",
  ].filter(Boolean).join("\n");

  await printText(texto);
}

// ── URL do app na nuvem ────────────────────────────────────────
function getAppUrl() {
  const cloudUrl = config.get("cloudUrl");
  const slug     = config.get("empresaSlug");
  if (!cloudUrl) return null;
  if (slug) return `${cloudUrl}/${slug}`;
  return `${cloudUrl}/painel`;
}

// ── Rota raiz: Setup wizard ou redirect ───────────────────────
app.get("/", (req, res) => {
  const mode = config.get("mode");
  if (!mode) {
    // Não configurado → wizard
    res.sendFile(path.join(__dirname, "setup-wizard", "index.html"));
    return;
  }
  if (mode === "cloud") {
    const url = getAppUrl();
    if (url) return res.redirect(url);
  }
  res.sendFile(path.join(__dirname, "setup-wizard", "dashboard.html"));
});

// ── Inicia servidor ────────────────────────────────────────────
server.listen(PORT, "127.0.0.1", async () => {
  log(`Cardápio SaaS Slave rodando em http://localhost:${PORT}`);

  const mode = config.get("mode");

  // Se já configurado em modo slave, inicia sync
  if (mode === "slave" && config.get("slaveKey")) {
    startSync();
  }

  // Abre navegador automaticamente
  try {
    await open(`http://localhost:${PORT}`);
  } catch {
    warn("Não foi possível abrir o navegador automaticamente");
  }
});

// Graceful shutdown
process.on("SIGINT",  () => { stopSync(); server.close(() => process.exit(0)); });
process.on("SIGTERM", () => { stopSync(); server.close(() => process.exit(0)); });
