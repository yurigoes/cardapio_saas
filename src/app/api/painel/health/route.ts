/**
 * GET /api/painel/health
 *
 * Saúde do sistema para o admin: rodadas de checks em paralelo:
 *   - DB (latência da query)
 *   - Gateways de pagamento (configurados e ativos)
 *   - Evolution API (se configurada)
 *   - Caixa aberto
 *   - Estoque crítico (produtos com estoque ≤ mínimo)
 *   - Pedidos hoje (volume)
 *   - SW: cliente-side (não server)
 *
 * Status por check:
 *   - "ok"       : tudo bem
 *   - "warning"  : atenção (ex: caixa fechado, estoque baixo)
 *   - "error"    : quebrado (DB lento, gateway inacessível)
 *   - "disabled" : feature não configurada
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

interface CheckResult {
  status:  "ok" | "warning" | "error" | "disabled";
  message: string;
  detail?: Record<string, unknown>;
  latency_ms?: number;
}

function todayStart(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Checks individuais ────────────────────────────────────────────────────────

async function checkDb(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    await query("SELECT 1");
    const latency = Date.now() - t0;
    return {
      status:  latency > 500 ? "warning" : "ok",
      message: latency > 500 ? "Banco com lentidão" : "Banco operacional",
      latency_ms: latency,
    };
  } catch (err) {
    return {
      status:  "error",
      message: "Banco inacessível",
      detail:  { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function checkGateways(empresaId: string): Promise<CheckResult> {
  try {
    const rows = await query<{
      slug: string; ativo: boolean; padrao: boolean;
      ultima_venda: string | null;
    }>(
      `SELECT g.slug, g.ativo, g.padrao,
              (SELECT MAX(created_at) FROM pagamentos
               WHERE gateway_slug = g.slug AND empresa_id = $1
                 AND status = 'aprovado') AS ultima_venda
       FROM gateways_config g
       WHERE g.empresa_id = $1 AND g.deleted_at IS NULL AND g.ativo = TRUE`,
      [empresaId]
    ).catch(() => []);

    if (rows.length === 0) {
      return { status: "disabled", message: "Nenhum gateway configurado" };
    }
    const padrao = rows.find(r => r.padrao);
    return {
      status:  padrao ? "ok" : "warning",
      message: padrao
        ? `${rows.length} gateway(s) ativo(s) · padrão: ${padrao.slug}`
        : `${rows.length} gateway(s) ativo(s) · sem padrão definido`,
      detail:  {
        gateways: rows.map(r => ({
          slug:        r.slug,
          padrao:      r.padrao,
          ultima_venda: r.ultima_venda,
        })),
      },
    };
  } catch (err) {
    return {
      status:  "error",
      message: "Erro ao consultar gateways",
      detail:  { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function checkEvolution(empresaId: string): Promise<CheckResult> {
  try {
    const empresa = await queryOne<{ slug: string; evolution_url: string | null; evolution_key: string | null }>(
      `SELECT slug, evolution_url, evolution_key FROM empresas WHERE id = $1`,
      [empresaId]
    );
    if (!empresa) return { status: "error", message: "Empresa não encontrada" };

    const url = empresa.evolution_url || process.env.EVOLUTION_API_URL || "";
    const key = empresa.evolution_key || process.env.EVOLUTION_API_KEY || "";
    if (!url || !key) {
      return { status: "disabled", message: "Evolution API não configurada" };
    }

    const t0 = Date.now();
    const cleanUrl = url.replace(/\/$/, "");
    const res = await fetch(`${cleanUrl}/instance/connectionState/${empresa.slug}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(3500),
    }).catch(() => null);
    const latency = Date.now() - t0;

    if (!res) return { status: "error", message: "Evolution API inacessível", latency_ms: latency };

    if (res.status === 404 || res.status === 400) {
      return { status: "warning", message: "Evolution online · instância não criada", latency_ms: latency };
    }
    if (!res.ok) {
      return { status: "error", message: `Evolution retornou ${res.status}`, latency_ms: latency };
    }

    const data = await res.json().catch(() => ({}));
    const state = (data?.instance?.state ?? data?.state ?? "unknown") as string;
    const conectado = state.toLowerCase() === "open";

    return {
      status:  conectado ? "ok" : "warning",
      message: conectado ? "WhatsApp conectado" : `WhatsApp ${state}`,
      latency_ms: latency,
      detail: { raw_state: state },
    };
  } catch (err) {
    return {
      status:  "error",
      message: "Erro ao verificar Evolution",
      detail:  { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function checkCaixa(empresaId: string): Promise<CheckResult> {
  try {
    const aberto = await queryOne<{ id: string; aberto_em: string }>(
      `SELECT id, aberto_em FROM caixas
       WHERE empresa_id = $1 AND status = 'aberto' LIMIT 1`,
      [empresaId]
    ).catch(() => null);

    const obrigatorio = await queryOne<{ caixa_obrigatorio: boolean }>(
      `SELECT COALESCE(caixa_obrigatorio, false) AS caixa_obrigatorio
       FROM empresas WHERE id = $1`,
      [empresaId]
    );

    if (aberto) {
      const horasAberto = Math.floor(
        (Date.now() - new Date(aberto.aberto_em).getTime()) / 3_600_000
      );
      return {
        status:  horasAberto > 16 ? "warning" : "ok",
        message: horasAberto > 16
          ? `Caixa aberto há ${horasAberto}h — verifique se foi esquecido`
          : `Caixa aberto há ${horasAberto}h`,
      };
    }

    return {
      status:  obrigatorio?.caixa_obrigatorio ? "warning" : "disabled",
      message: obrigatorio?.caixa_obrigatorio
        ? "Caixa fechado (obrigatório — pedidos presenciais bloqueados)"
        : "Caixa fechado",
    };
  } catch (err) {
    return {
      status:  "error",
      message: "Erro ao verificar caixa",
      detail:  { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function checkEstoque(empresaId: string): Promise<CheckResult> {
  try {
    const baixo = await queryOne<{ qtd: string }>(
      `SELECT COUNT(*) AS qtd FROM produtos
       WHERE empresa_id = $1 AND deleted_at IS NULL
         AND controla_estoque = TRUE
         AND COALESCE(estoque_atual, 0) <= COALESCE(estoque_minimo, 0)`,
      [empresaId]
    ).catch(() => ({ qtd: "0" }));

    const total = await queryOne<{ qtd: string }>(
      `SELECT COUNT(*) AS qtd FROM produtos
       WHERE empresa_id = $1 AND deleted_at IS NULL AND controla_estoque = TRUE`,
      [empresaId]
    ).catch(() => ({ qtd: "0" }));

    const n = Number(baixo?.qtd ?? 0);
    const t = Number(total?.qtd ?? 0);

    if (t === 0) return { status: "disabled", message: "Sem controle de estoque" };
    return {
      status:  n === 0 ? "ok" : "warning",
      message: n === 0
        ? `${t} produto(s) controlado(s) · todos OK`
        : `${n} produto(s) com estoque baixo de ${t} controlado(s)`,
    };
  } catch (err) {
    return {
      status:  "error",
      message: "Erro ao verificar estoque",
      detail:  { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function checkPedidosHoje(empresaId: string): Promise<CheckResult> {
  try {
    const r = await queryOne<{ qtd: string; pendentes: string }>(
      `SELECT COUNT(*) AS qtd,
              COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes
       FROM pedidos
       WHERE empresa_id = $1 AND deleted_at IS NULL
         AND created_at >= $2::date`,
      [empresaId, todayStart()]
    );
    const total = Number(r?.qtd ?? 0);
    const pend  = Number(r?.pendentes ?? 0);

    return {
      status:  pend > 5 ? "warning" : "ok",
      message: total === 0
        ? "Sem pedidos hoje ainda"
        : `${total} pedido(s) hoje · ${pend} pendente(s)`,
    };
  } catch (err) {
    return {
      status:  "error",
      message: "Erro ao verificar pedidos",
      detail:  { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const t0 = Date.now();
    const [db, gateways, evolution, caixa, estoque, pedidos] = await Promise.all([
      checkDb(),
      checkGateways(empresaId),
      checkEvolution(empresaId),
      checkCaixa(empresaId),
      checkEstoque(empresaId),
      checkPedidosHoje(empresaId),
    ]);

    const checks = { db, gateways, evolution, caixa, estoque, pedidos };

    // Status agregado
    const valores = Object.values(checks);
    const overall =
      valores.some(c => c.status === "error")   ? "error"   :
      valores.some(c => c.status === "warning") ? "warning" :
                                                  "ok";

    return ok({
      overall,
      checks,
      checked_at:    new Date().toISOString(),
      total_time_ms: Date.now() - t0,
    });
  } catch (err) {
    console.error("[Health/GET]", err);
    return serverError();
  }
}
