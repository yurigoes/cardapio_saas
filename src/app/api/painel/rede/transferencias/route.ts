/**
 * GET  /api/painel/rede/transferencias       — lista (filtros: status, filial)
 * POST /api/painel/rede/transferencias       — cria nova
 *   Body: { produto_id, filial_destino_id, quantidade, motivo? }
 *
 * Status flow: pendente → em_transito → recebido (ou cancelado)
 * Filial origem é sempre a empresa atual do usuário.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { scopeAtual } from "@/lib/rede/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const scope = await scopeAtual(empresaId);
  if (!scope?.rede_id) return badRequest("Empresa não pertence a uma rede");

  const status   = req.nextUrl.searchParams.get("status");
  const direcao  = req.nextUrl.searchParams.get("direcao"); // entrada|saida|todas

  try {
    const where: string[] = ["t.rede_id = $1"];
    const vals: unknown[] = [scope.rede_id];
    let i = 2;

    if (direcao === "entrada") {
      where.push(`t.filial_destino = $${i++}`); vals.push(empresaId);
    } else if (direcao === "saida") {
      where.push(`t.filial_origem = $${i++}`);  vals.push(empresaId);
    } else {
      // default: ambas direções relacionadas a esta filial
      where.push(`(t.filial_origem = $${i} OR t.filial_destino = $${i})`);
      vals.push(empresaId); i++;
    }

    if (status) { where.push(`t.status = $${i++}`); vals.push(status); }

    const rows = await query(
      `SELECT t.id, t.status, t.quantidade::text, t.motivo, t.observacao,
              t.criado_em::text, t.enviado_em::text, t.recebido_em::text,
              t.filial_origem,  o.nome_fantasia AS origem_nome,  o.nome_filial AS origem_apelido,
              t.filial_destino, d.nome_fantasia AS destino_nome, d.nome_filial AS destino_apelido,
              t.produto_id,     p.nome AS produto_nome
         FROM transferencias_estoque t
         JOIN empresas o ON o.id = t.filial_origem
         JOIN empresas d ON d.id = t.filial_destino
         JOIN produtos p ON p.id = t.produto_id
        WHERE ${where.join(" AND ")}
        ORDER BY t.criado_em DESC
        LIMIT 200`,
      vals
    );

    return ok(rows);
  } catch (err) {
    console.error("[Rede/Transf/GET]", err);
    return serverError();
  }
}

const schema = z.object({
  produto_id:        z.string().uuid(),
  filial_destino_id: z.string().uuid(),
  quantidade:        z.number().positive().max(999999),
  motivo:            z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (body.filial_destino_id === empresaId) {
    return badRequest("Filial origem e destino são iguais");
  }

  const scope = await scopeAtual(empresaId);
  if (!scope?.rede_id) return badRequest("Empresa não pertence a uma rede");

  try {
    // Valida que ambas filiais e produto pertencem à mesma rede
    const destino = await queryOne<{ rede_id: string | null }>(
      `SELECT rede_id FROM empresas WHERE id = $1`, [body.filial_destino_id]
    );
    if (destino?.rede_id !== scope.rede_id) {
      return badRequest("Filial destino não pertence à sua rede");
    }
    const produto = await queryOne<{ rede_id: string | null }>(
      `SELECT rede_id FROM produtos WHERE id = $1`, [body.produto_id]
    );
    if (produto?.rede_id !== scope.rede_id && produto?.rede_id !== null) {
      return badRequest("Produto não pertence à sua rede");
    }

    const r = await queryOne<{ id: string }>(
      `INSERT INTO transferencias_estoque
         (rede_id, filial_origem, filial_destino, produto_id, quantidade, motivo, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [scope.rede_id, empresaId, body.filial_destino_id, body.produto_id,
       body.quantidade, body.motivo ?? null, sub]
    );
    return created({ id: r?.id });
  } catch (err) {
    console.error("[Rede/Transf/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
