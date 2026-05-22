/**
 * GET  /api/painel/telas — telas da conta + displays pendentes no Xibo
 * POST /api/painel/telas — autoriza um display, vincula ao grupo da conta e salva a tela
 *
 * Fluxo de pareamento (sem dar login Xibo pro cliente):
 *   1. Cliente instala o player Xibo na TV e anota o código que aparece.
 *   2. O player aparece em "displays pendentes" (authorised=0).
 *   3. Cliente escolhe o display e dá um nome → autorizamos + assign no grupo dele.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { listarDisplays, autorizarDisplay, adicionarDisplayAoGrupo } from "@/lib/xibo";
import { z } from "zod";

async function contaXibo(contaId: string) {
  await ensureSchema();
  const p = db();
  const r = await p.query<{ status: string; xibo_display_group_id: number | null }>(
    `SELECT status, xibo_display_group_id FROM midia_contas WHERE id = $1`,
    [contaId]
  );
  return r.rows[0] ?? null;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  const conta = await contaXibo(auth.sub);
  if (!conta || conta.status !== "ativo" || !conta.xibo_display_group_id) {
    return NextResponse.json({ ok: false, error: "conta ainda não ativada" }, { status: 403 });
  }

  try {
    const p = db();
    const telas = await p.query(
      `SELECT id, nome, xibo_display_id, status, created_at
         FROM midia_telas WHERE conta_id = $1 ORDER BY created_at`,
      [auth.sub]
    ).then(r => r.rows);

    // Displays pendentes (não autorizados) que o cliente pode parear
    const todos = await listarDisplays();
    const pendentes = todos
      .filter(d => d.authorised === 0)
      .map(d => ({ displayId: d.displayId, display: d.display, lastAccessed: d.lastAccessed }));

    return NextResponse.json({ ok: true, telas, pendentes });
  } catch (err) {
    console.error("[painel/telas GET]", err);
    return NextResponse.json({ ok: false, error: "erro ao listar telas" }, { status: 500 });
  }
}

const postSchema = z.object({
  displayId: z.coerce.number().int().positive(),
  nome:      z.string().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  const conta = await contaXibo(auth.sub);
  if (!conta || conta.status !== "ativo" || !conta.xibo_display_group_id) {
    return NextResponse.json({ ok: false, error: "conta ainda não ativada" }, { status: 403 });
  }

  let body: z.infer<typeof postSchema>;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  body = parsed.data;

  try {
    // Garante que o display realmente está pendente (evita roubar TV de outro cliente)
    const todos = await listarDisplays();
    const alvo = todos.find(d => d.displayId === body.displayId);
    if (!alvo) return NextResponse.json({ ok: false, error: "display não encontrado" }, { status: 404 });
    if (alvo.authorised === 1) {
      return NextResponse.json({ ok: false, error: "esse display já está pareado" }, { status: 409 });
    }

    // Autoriza e vincula ao grupo da conta
    await autorizarDisplay(body.displayId);
    await adicionarDisplayAoGrupo(body.displayId, conta.xibo_display_group_id);

    const p = db();
    const tela = await p.query<{ id: string }>(
      `INSERT INTO midia_telas (conta_id, nome, xibo_display_id, status)
       VALUES ($1,$2,$3,'ativa') RETURNING id`,
      [auth.sub, body.nome, body.displayId]
    ).then(r => r.rows[0]);

    return NextResponse.json({ ok: true, tela_id: tela.id });
  } catch (err) {
    console.error("[painel/telas POST]", err);
    return NextResponse.json({ ok: false, error: "erro ao parear tela" }, { status: 500 });
  }
}
