/**
 * GET /api/painel/contratos        — lista contratos disponibilizados pra conta logada
 * GET /api/painel/contratos?id=X   — retorna 1 contrato completo (html) p/ leitura/assinatura
 *
 * Só retorna contratos com visivel_cliente = true (disponibilizados pelo admin).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const row = await db().query(
        `SELECT id, titulo, conteudo_html, conteudo_hash, aceito, aceito_em, aceito_nome, criado_em
           FROM midia_conta_contratos
          WHERE id = $1 AND conta_id = $2 AND visivel_cliente = true`,
        [id, auth.sub]
      ).then(r => r.rows[0]);
      if (!row) return NextResponse.json({ ok: false, error: "contrato não encontrado" }, { status: 404 });
      return NextResponse.json({ ok: true, contrato: row });
    }
    const rows = await db().query(
      `SELECT id, titulo, conteudo_hash, aceito, aceito_em, aceito_nome, criado_em, disponibilizado_em
         FROM midia_conta_contratos
        WHERE conta_id = $1 AND visivel_cliente = true
        ORDER BY criado_em DESC`,
      [auth.sub]
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, contratos: rows });
  } catch (err) {
    console.error("[painel/contratos GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
