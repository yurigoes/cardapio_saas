/**
 * Métricas Prometheus do Cardápio SaaS.
 *
 * Singleton — `prom-client` registra métricas globalmente, então criamos
 * uma única vez e exportamos pra uso em qualquer route handler.
 *
 * Coletas:
 *   - HTTP requests por route + status (counter)
 *   - HTTP latency por route (histogram)
 *   - Pedidos criados (counter por tipo: balcao/delivery/totem/etc)
 *   - Caixas abertos (gauge)
 *   - Email queue size (gauge)
 *   - Print jobs pendentes (gauge)
 *   - Erros internos (counter por código)
 *   - Default metrics do node (CPU, memória, GC, event loop)
 */
import {
  Registry, Counter, Histogram, Gauge, collectDefaultMetrics,
} from "prom-client";

declare global {
  // Garante singleton em hot-reload do Next dev
  // eslint-disable-next-line no-var
  var __metrics_registry__: Registry | undefined;
}

function buildRegistry(): Registry {
  const registry = new Registry();

  // Default metrics do Node (CPU, mem, GC, event loop, etc)
  collectDefaultMetrics({ register: registry, prefix: "cardapio_" });

  // ─── HTTP ──────────────────────────────────────────────────────────────────
  new Counter({
    name:   "cardapio_http_requests_total",
    help:   "Total de requisições HTTP recebidas",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });

  new Histogram({
    name:   "cardapio_http_request_duration_seconds",
    help:   "Latência de requisições HTTP",
    labelNames: ["method", "route", "status"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  // ─── Negócio ───────────────────────────────────────────────────────────────
  new Counter({
    name:   "cardapio_pedidos_criados_total",
    help:   "Total de pedidos criados",
    labelNames: ["tipo", "origem"],  // tipo: balcao|delivery|mesa|totem; origem: pdv|cardapio|totem|whatsapp
    registers: [registry],
  });

  new Counter({
    name:   "cardapio_pagamentos_total",
    help:   "Pagamentos processados",
    labelNames: ["forma", "status"],   // forma: pix|dinheiro|credito; status: aprovado|recusado
    registers: [registry],
  });

  new Gauge({
    name:   "cardapio_caixas_abertos",
    help:   "Quantos caixas estão abertos no momento (todas empresas)",
    registers: [registry],
  });

  new Gauge({
    name:   "cardapio_email_queue_pendentes",
    help:   "E-mails na fila aguardando envio",
    registers: [registry],
  });

  new Gauge({
    name:   "cardapio_print_jobs_pendentes",
    help:   "Jobs de impressão pendentes",
    registers: [registry],
  });

  new Counter({
    name:   "cardapio_erros_total",
    help:   "Erros internos registrados",
    labelNames: ["origem", "code"],   // origem: api|cron|webhook|print|email
    registers: [registry],
  });

  return registry;
}

// Reusa registry em hot-reload
const registry: Registry = globalThis.__metrics_registry__ ?? buildRegistry();
if (!globalThis.__metrics_registry__) globalThis.__metrics_registry__ = registry;

export { registry };

// ─── Helpers de incremento (uso em código de negócio) ───────────────────────

export function recordHttp(opts: {
  method: string; route: string; status: number; durationSeconds: number;
}) {
  try {
    const counter = registry.getSingleMetric("cardapio_http_requests_total") as Counter<string> | undefined;
    counter?.labels(opts.method, opts.route, String(opts.status)).inc();

    const hist = registry.getSingleMetric("cardapio_http_request_duration_seconds") as Histogram<string> | undefined;
    hist?.labels(opts.method, opts.route, String(opts.status)).observe(opts.durationSeconds);
  } catch {}
}

export function recordPedido(tipo: string, origem: string) {
  try {
    const c = registry.getSingleMetric("cardapio_pedidos_criados_total") as Counter<string> | undefined;
    c?.labels(tipo, origem).inc();
  } catch {}
}

export function recordPagamento(forma: string, status: string) {
  try {
    const c = registry.getSingleMetric("cardapio_pagamentos_total") as Counter<string> | undefined;
    c?.labels(forma, status).inc();
  } catch {}
}

export function recordErro(origem: string, code: string) {
  try {
    const c = registry.getSingleMetric("cardapio_erros_total") as Counter<string> | undefined;
    c?.labels(origem, code).inc();
  } catch {}
}

/** Atualiza gauges (chamado pelo endpoint /metrics antes de exportar) */
export async function refreshGauges() {
  try {
    const { queryOne } = await import("@/lib/db/client");

    const caixas = await queryOne<{ qtd: string }>(
      `SELECT COUNT(*) AS qtd FROM caixas WHERE status = 'aberto'`
    ).catch(() => null);
    const g1 = registry.getSingleMetric("cardapio_caixas_abertos") as Gauge<string> | undefined;
    g1?.set(Number(caixas?.qtd ?? 0));

    const emailPend = await queryOne<{ qtd: string }>(
      `SELECT COUNT(*) AS qtd FROM email_jobs WHERE status = 'pendente'`
    ).catch(() => null);
    const g2 = registry.getSingleMetric("cardapio_email_queue_pendentes") as Gauge<string> | undefined;
    g2?.set(Number(emailPend?.qtd ?? 0));

    const printPend = await queryOne<{ qtd: string }>(
      `SELECT COUNT(*) AS qtd FROM print_jobs WHERE status = 'pendente'`
    ).catch(() => null);
    const g3 = registry.getSingleMetric("cardapio_print_jobs_pendentes") as Gauge<string> | undefined;
    g3?.set(Number(printPend?.qtd ?? 0));
  } catch (err) {
    console.warn("[metrics/refreshGauges]", err);
  }
}
