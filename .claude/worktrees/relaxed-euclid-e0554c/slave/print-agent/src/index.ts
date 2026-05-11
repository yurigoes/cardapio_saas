/**
 * index.ts — Servidor HTTP do print-agent
 *
 * Expõe endpoints para receber solicitações de impressão do Next.js local.
 *
 * POST /print   — Imprime um documento
 * GET  /health  — Status das impressoras
 * GET  /printers — Lista impressoras configuradas
 */

import express, { Request, Response } from "express";
import { config, Setor }              from "./config";
import { routePrint, checkPrinterStatus, TipoPrint } from "./router";
import { PedidoData }                 from "./templates/pedido";
import { logger }                     from "./logger";

const app = express();

// Parse JSON com limite generoso (imagens em base64 podem ser grandes)
app.use(express.json({ limit: "1mb" }));

// ─────────────────────────────────────────────────────────────────────────────
// POST /print
// ─────────────────────────────────────────────────────────────────────────────

interface PrintBody {
  setor: string;
  tipo:  TipoPrint;
  data:  PedidoData;
}

app.post("/print", async (req: Request, res: Response) => {
  const body = req.body as PrintBody;

  // Validação básica
  if (!body?.setor) {
    res.status(400).json({ ok: false, error: "Campo 'setor' é obrigatório" });
    return;
  }

  if (!body?.tipo) {
    res.status(400).json({ ok: false, error: "Campo 'tipo' é obrigatório" });
    return;
  }

  if (!body?.data?.numero) {
    res.status(400).json({ ok: false, error: "Campo 'data.numero' é obrigatório" });
    return;
  }

  const startMs = Date.now();

  try {
    await routePrint(body.setor, body.tipo, {
      ...body.data,
      empresaNome: body.data.empresaNome || config.empresaNome,
    });

    const elapsed = Date.now() - startMs;

    logger.info("Impressão OK", {
      setor:  body.setor,
      tipo:   body.tipo,
      pedido: body.data.numero,
      ms:     elapsed,
    });

    res.json({ ok: true, ms: elapsed });
  } catch (err) {
    const error = String(err);

    logger.error("Falha na impressão", {
      setor:  body.setor,
      tipo:   body.tipo,
      pedido: body.data?.numero,
      error,
    });

    res.status(500).json({ ok: false, error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────

app.get("/health", async (_req: Request, res: Response) => {
  const setores: Setor[] = ["totem", "balcao", "cozinha", "producao", "bar"];
  const printers: Record<string, string> = {};

  // Verifica status de cada setor em paralelo
  await Promise.all(
    setores.map(async (setor) => {
      printers[setor] = await checkPrinterStatus(setor);
    })
  );

  const allOk = Object.values(printers).every(s => s !== "erro");

  res.json({
    ok:       allOk,
    printers,
    empresa:  config.empresaNome,
    uptime:   process.uptime(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /printers
// ─────────────────────────────────────────────────────────────────────────────

app.get("/printers", (_req: Request, res: Response) => {
  const list = Object.entries(config.printers).map(([setor, cfg]) => ({
    setor,
    type: cfg?.type ?? "desconhecido",
    ...(cfg?.type === "network"
      ? { host: (cfg as { host: string; port: number }).host, port: (cfg as { host: string; port: number }).port }
      : {}),
    ...(cfg?.type === "usb"
      ? { vendorId: (cfg as { vendorId: string; productId: string }).vendorId }
      : {}),
  }));

  res.json({ ok: true, printers: list });
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: "Endpoint não encontrado" });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

const server = app.listen(config.port, "0.0.0.0", () => {
  logger.info("════════════════════════════════════════");
  logger.info("  Cardápio SaaS — Print Agent v1.0.0");
  logger.info("════════════════════════════════════════");
  logger.info(`Servidor disponível em http://0.0.0.0:${config.port}`);
  logger.info(`Empresa: ${config.empresaNome}`);
  logger.info(`Impressoras configuradas: ${Object.keys(config.printers).join(", ") || "nenhuma"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("Recebido SIGTERM — encerrando print-agent...");
  server.close(() => {
    logger.info("Print-agent encerrado");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("Recebido SIGINT — encerrando print-agent...");
  server.close(() => {
    logger.info("Print-agent encerrado");
    process.exit(0);
  });
});
