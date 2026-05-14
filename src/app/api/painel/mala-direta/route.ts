/**
 * GET  /api/painel/mala-direta — lista campanhas
 * POST /api/painel/mala-direta — cria nova
 *
 * Body POST: { nome, canal, mensagem, filtro?, delay_min_seg?, delay_max_seg? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "gerente"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query(
      `SELECT id, nome, canal, mensagem, filtro, status, agendada_para,
              delay_min_seg, delay_max_seg, total_alvo, total_enviado, total_falha,
              iniciada_em, concluida_em, created_at
         FROM mala_direta_campanhas
        WHERE empresa_id = $1
        ORDER BY created_at DESC`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[MalaDireta/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  nome:          z.string().min(2).max(100).trim(),
  canal:         z.enum(["whatsapp", "email"]).default("whatsapp"),
  mensagem:      z.string().min(5).max(4000),
  filtro:        z.object({
    cidade:               z.string().optional(),
    ranking:              z.string().optional(),
    ultima_compra_dias:   z.number().int().min(1).optional(),
    aniversario_mes:      z.number().int().min(1).max(12).optional(),
  }).optional(),
  delay_min_seg: z.number().int().min(1).max(600).default(5),
  delay_max_seg: z.number().int().min(1).max(600).default(30),
  agendada_para: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    // Conta alvo baseado no filtro (preview)
    const conds: string[] = ["empresa_id = $1", "deleted_at IS NULL"];
    const vals: unknown[]  = [empresaId];
    let i = 2;
    if (body.canal === "whatsapp") conds.push("telefone IS NOT NULL");
    if (body.canal === "email")    conds.push("email IS NOT NULL");
    if (body.filtro?.ultima_compra_dias) {
      conds.push(`EXISTS (SELECT 1 FROM pedidos p
                            WHERE p.cliente_id = clientes.id
                              AND p.created_at > NOW() - INTERVAL '${body.filtro.ultima_compra_dias} days')`);
    }
    if (body.filtro?.aniversario_mes) {
      conds.push(`EXTRACT(MONTH FROM data_nascimento) = $${i++}`);
      vals.push(body.filtro.aniversario_mes);
    }
    const totalAlvo = await queryOne<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM clientes WHERE ${conds.join(" AND ")}`,
      vals
    );

    const r = await queryOne<{ id: string }>(
      `INSERT INTO mala_direta_campanhas
         (empresa_id, nome, canal, mensagem, filtro,
          delay_min_seg, delay_max_seg, agendada_para, total_alvo, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::timestamptz, $9, $10)
       RETURNING id`,
      [empresaId, body.nome, body.canal, body.mensagem,
       JSON.stringify(body.filtro ?? {}),
       body.delay_min_seg, body.delay_max_seg,
       body.agendada_para ?? null,
       Number(totalAlvo?.n ?? 0),
       sub]
    );

    return created({
      id: r?.id, total_alvo: Number(totalAlvo?.n ?? 0),
      mensagem: `Campanha criada com ${totalAlvo?.n ?? 0} destinatário(s) elegíveis`,
    });
  } catch (err) {
    console.error("[MalaDireta/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
