/**
 * index.ts — Ponto de entrada do sync-agent
 *
 * Loop principal:
 * 1. Autentica com a VPS
 * 2. Pull completo inicial
 * 3. Loop a cada SYNC_INTERVAL_MS:
 *    a. push() — envia pedidos offline
 *    b. pull(lastPullAt) — pull incremental
 *    c. Em caso de falha: log warning, continua o loop
 *
 * Health check HTTP na porta 3002: GET /health
 */

import * as http from "http";
import { config, loadState }              from "./config";
import { authenticateWithVPS, ensureAuthenticated } from "./auth";
import { ensureSchema }                   from "./db";
import { pullFromVPS }                    from "./pull";
import { pushToVPS }                      from "./push";
import { getQueueSize }                   from "./queue";
import { logger }                         from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Estado global do loop
// ─────────────────────────────────────────────────────────────────────────────

let isRunning    = true;
let lastSyncAt:  string | null = null;
let lastPullAt:  string | null = null;
let syncErrors   = 0;
let loopTimer:   ReturnType<typeof setTimeout> | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Health check HTTP
// ─────────────────────────────────────────────────────────────────────────────

async function startHealthServer(): Promise<void> {
  const port = parseInt(process.env.HEALTH_PORT || "3002");

  const server = http.createServer(async (req, res) => {
    if (req.method !== "GET" || req.url !== "/health") {
      res.writeHead(404);
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
      return;
    }

    let queueSize = 0;
    try { queueSize = await getQueueSize(); } catch { /* ignore */ }

    const state = loadState();

    const body = JSON.stringify({
      ok:         isRunning,
      lastSync:   lastSyncAt,
      lastPull:   lastPullAt,
      startedAt:  state.startedAt,
      syncErrors,
      queueSize,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(`Health check disponível em http://0.0.0.0:${port}/health`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de sincronização
// ─────────────────────────────────────────────────────────────────────────────

async function syncCycle(): Promise<void> {
  if (!isRunning) return;

  try {
    // Garante autenticação antes do ciclo
    await ensureAuthenticated();

    // 1. Push primeiro — envia o que foi criado offline
    try {
      await pushToVPS();
    } catch (err) {
      logger.warn("Falha no push (continuando)", { error: String(err) });
    }

    // 2. Pull incremental
    try {
      lastPullAt  = await pullFromVPS(lastPullAt ?? undefined);
      lastSyncAt  = new Date().toISOString();
      syncErrors  = 0;
    } catch (err) {
      syncErrors++;
      logger.warn("Falha no pull incremental", {
        error:  String(err),
        errors: syncErrors,
      });

      // Se errar muito, tenta re-autenticar no próximo ciclo
      if (syncErrors >= 5) {
        logger.info("Muitos erros consecutivos — tentando re-autenticação");
        try {
          await authenticateWithVPS();
          syncErrors = 0;
        } catch (authErr) {
          logger.error("Re-autenticação falhou", { error: String(authErr) });
        }
      }
    }
  } catch (err) {
    logger.error("Erro crítico no ciclo de sync", { error: String(err) });
    syncErrors++;
  }

  // Agenda próximo ciclo
  if (isRunning) {
    loopTimer = setTimeout(syncCycle, config.syncIntervalMs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

function setupGracefulShutdown(): void {
  async function shutdown(signal: string) {
    logger.info(`Recebido ${signal} — iniciando shutdown graceful`);
    isRunning = false;

    if (loopTimer) {
      clearTimeout(loopTimer);
    }

    // Tenta um push final antes de encerrar
    try {
      logger.info("Executando push final antes de encerrar...");
      await pushToVPS();
      logger.info("Push final concluído");
    } catch (err) {
      logger.warn("Push final falhou", { error: String(err) });
    }

    logger.info("Sync-agent encerrado com sucesso");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info("════════════════════════════════════════");
  logger.info("  Cardápio SaaS — Sync Agent v1.0.0");
  logger.info("════════════════════════════════════════");
  logger.info("Iniciando...", {
    vpsUrl:         config.vpsUrl,
    syncInterval:   `${config.syncIntervalMs / 1000}s`,
    printAgentUrl:  config.printAgentUrl,
  });

  setupGracefulShutdown();

  // 1. Garante que o schema local existe
  await ensureSchema();

  // 2. Autentica com a VPS
  await authenticateWithVPS();

  // 3. Inicia health check
  await startHealthServer();

  // 4. Pull completo inicial
  logger.info("Executando pull completo inicial...");
  try {
    lastPullAt = await pullFromVPS();
    lastSyncAt = new Date().toISOString();
    logger.info("Pull inicial concluído com sucesso");
  } catch (err) {
    logger.error("Pull inicial falhou — iniciando loop mesmo assim", { error: String(err) });
  }

  // 5. Inicia loop de sync
  logger.info(`Loop de sync iniciado (intervalo: ${config.syncIntervalMs / 1000}s)`);
  loopTimer = setTimeout(syncCycle, config.syncIntervalMs);
}

main().catch((err) => {
  logger.error("Erro fatal na inicialização do sync-agent", { error: String(err) });
  process.exit(1);
});
