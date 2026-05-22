/**
 * POST /api/auth/signup
 * Cria a conta do cliente (status pendente) + assinatura (pendente).
 * Provisionamento no Xibo só acontece quando o pagamento é aprovado.
 *
 * Body: { nome, empresa, email, senha, whatsapp?, cidade?, plano, qtd_telas }
 * Resp: { ok, token, conta_id, assinatura_id }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { hashSenha, criarToken } from "@/lib/auth";
import { obterPlano } from "@/lib/planos-db";

const schema = z.object({
  nome:      z.string().min(2).max(120),
  empresa:   z.string().min(1).max(160),
  email:     z.string().email().max(160).toLowerCase(),
  senha:     z.string().min(6).max(72),
  whatsapp:  z.string().max(30).optional(),
  cidade:    z.string().max(120).optional(),
  plano:     z.string().min(1),
  qtd_telas: z.coerce.number().int().min(1).max(9999).default(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    const r = schema.safeParse(await req.json());
    if (!r.success) return NextResponse.json({ ok: false, error: r.error.errors.map(e => e.message).join("; ") }, { status: 400 });
    body = r.data;
  } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }

  try {
    await ensureSchema();
    const p = db();

    const plano = await obterPlano(body.plano);
    if (!plano) return NextResponse.json({ ok: false, error: "plano inválido" }, { status: 400 });

    // Email já existe?
    const existe = await p.query(`SELECT id FROM midia_contas WHERE email = $1`, [body.email]);
    if (existe.rows.length) {
      return NextResponse.json({ ok: false, error: "E-mail já cadastrado. Faça login." }, { status: 409 });
    }

    const senhaHash = await hashSenha(body.senha);

    const conta = await p.query<{ id: string }>(
      `INSERT INTO midia_contas (nome, empresa, email, senha_hash, whatsapp, cidade, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pendente') RETURNING id`,
      [body.nome, body.empresa, body.email, senhaHash, body.whatsapp ?? null, body.cidade ?? null]
    ).then(r => r.rows[0]);

    const assin = await p.query<{ id: string }>(
      `INSERT INTO midia_assinaturas (conta_id, plano, preco_tela, qtd_telas, status)
       VALUES ($1,$2,$3,$4,'pendente') RETURNING id`,
      [conta.id, plano.id, plano.preco, body.qtd_telas]
    ).then(r => r.rows[0]);

    const token = await criarToken({ sub: conta.id, email: body.email, empresa: body.empresa });

    return NextResponse.json({
      ok: true,
      token,
      conta_id: conta.id,
      assinatura_id: assin.id,
      total_mensal: Number((plano.preco * body.qtd_telas).toFixed(2)),
    });
  } catch (err) {
    console.error("[signup]", err);
    return NextResponse.json({ ok: false, error: "erro ao criar conta" }, { status: 500 });
  }
}
