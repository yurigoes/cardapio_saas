/**
 * POST /api/painel/mala-direta/[id]/iniciar
 *
 * Marca campanha como 'enviando' e roda os envios em background
 * (fire-and-forget). Cada envio respeita delay aleatório entre
 * delay_min_seg e delay_max_seg pra evitar bloqueio do WhatsApp.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "gerente"];

interface Campanha {
  id: string; empresa_id: string; canal: string; mensagem: string;
  filtro: Record<string, unknown> | null; status: string;
  delay_min_seg: number; delay_max_seg: number;
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function rndDelay(min: number, max: number) { return min + Math.floor(Math.random() * (max - min)); }

async function enviarWhatsapp(slug: string, telefone: string, mensagem: string): Promise<{ ok: boolean; erro?: string }> {
  const evoUrl = process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const evoKey = process.env.EVOLUTION_API_KEY;
  if (!evoKey) return { ok: false, erro: "EVOLUTION_API_KEY não configurado" };
  const numero = telefone.startsWith("+") ? telefone.replace(/\D/g, "") : "55" + telefone.replace(/\D/g, "");
  try {
    const r = await fetch(`${evoUrl}/message/sendText/${slug}`, {
      method: "POST", headers: { "Content-Type": "application/json", "apikey": evoKey },
      body: JSON.stringify({ number: numero, text: mensagem }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return { ok: false, erro: `HTTP ${r.status}: ${txt.slice(0, 100)}` };
    }
    return { ok: true };
  } catch (err) { return { ok: false, erro: (err as Error).message }; }
}

async function processarCampanha(c: Campanha, slug: string, baseUrl: string) {
  // Substitui {nome} no template — pré-busca todos
  const filtro = c.filtro ?? {};
  const conds: string[] = ["empresa_id = $1", "deleted_at IS NULL"];
  const vals: unknown[]  = [c.empresa_id];
  let i = 2;
  if (c.canal === "whatsapp") conds.push("telefone IS NOT NULL");
  if (c.canal === "email")    conds.push("email IS NOT NULL");
  if (typeof filtro.ultima_compra_dias === "number") {
    conds.push(`EXISTS (SELECT 1 FROM pedidos p
                          WHERE p.cliente_id = clientes.id
                            AND p.created_at > NOW() - INTERVAL '${filtro.ultima_compra_dias} days')`);
  }
  if (typeof filtro.aniversario_mes === "number") {
    conds.push(`EXTRACT(MONTH FROM data_nascimento) = $${i++}`);
    vals.push(filtro.aniversario_mes);
  }

  const clientes = await query<{ id: string; nome: string | null; telefone: string | null }>(
    `SELECT id, nome, telefone FROM clientes WHERE ${conds.join(" AND ")}`,
    vals
  );

  let enviados = 0, falhas = 0;
  for (const cli of clientes) {
    if (!cli.telefone) continue;
    const msg = c.mensagem.replace(/\{nome\}/g, cli.nome ?? "amigo(a)");
    const r = await enviarWhatsapp(slug, cli.telefone, msg);
    if (r.ok) enviados++; else falhas++;
    // Atualiza progresso a cada 5
    if ((enviados + falhas) % 5 === 0) {
      await queryOne(
        `UPDATE mala_direta_campanhas
            SET total_enviado = $1, total_falha = $2 WHERE id = $3`,
        [enviados, falhas, c.id]
      ).catch(() => {});
    }
    await delay(rndDelay(c.delay_min_seg * 1000, c.delay_max_seg * 1000));
  }

  await queryOne(
    `UPDATE mala_direta_campanhas
        SET status = 'concluida', concluida_em = NOW(),
            total_enviado = $1, total_falha = $2 WHERE id = $3`,
    [enviados, falhas, c.id]
  ).catch(() => {});
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const c = await queryOne<Campanha>(
      `SELECT id, empresa_id, canal, mensagem, filtro, status,
              delay_min_seg, delay_max_seg
         FROM mala_direta_campanhas
        WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!c) return notFound();
    if (c.status === "enviando")  return badRequest("Campanha já está enviando");
    if (c.status === "concluida") return badRequest("Campanha já foi enviada");

    const e = await queryOne<{ slug: string }>(
      `SELECT slug FROM empresas WHERE id = $1`, [empresaId]
    );
    if (!e?.slug) return badRequest("Empresa sem slug");

    // Marca como enviando
    await queryOne(
      `UPDATE mala_direta_campanhas
          SET status = 'enviando', iniciada_em = NOW()
        WHERE id = $1`,
      [params.id]
    );

    // Fire-and-forget — processa em background
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tthreedigital.com.br";
    processarCampanha(c, e.slug, baseUrl).catch(err => {
      console.error("[MalaDireta/Iniciar] erro:", err);
      queryOne(
        `UPDATE mala_direta_campanhas SET status = 'cancelada', concluida_em = NOW() WHERE id = $1`,
        [params.id]
      ).catch(() => {});
    });

    return ok({
      mensagem: "Campanha iniciada em background. Acompanhe o progresso na lista de campanhas.",
      campanha_id: params.id,
    });
  } catch (err) {
    console.error("[MalaDireta/Iniciar]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
