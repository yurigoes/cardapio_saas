/**
 * GET  /api/painel/pedidos — lista pedidos (orçamentos) do anunciante logado
 * POST /api/painel/pedidos — cria pedido a partir do simulador
 *   Body: { orientacao, insercoes_dia, segundos, dias, observacao? }
 *   O valor é RECALCULADO no servidor (não confia no cliente) e validado contra mínimos.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { calcularValor, validarPedido, parseDuracoes, type SimuladorConfig } from "@/lib/simulador";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT p.id, p.orientacao, p.insercoes_dia, p.segundos, p.dias, p.valor, p.observacao,
            p.status, p.motivo_recusa, p.campanha_id, p.criado_em, p.revisado_em
       FROM midia_pedidos p WHERE p.conta_id = $1 ORDER BY p.criado_em DESC`,
    [auth.sub]
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, pedidos: rows });
}

const schema = z.object({
  orientacao: z.enum(["retrato", "paisagem"]),
  insercoes_dia: z.coerce.number().int().min(1),
  segundos: z.coerce.number().int().min(1).max(120),
  dias: z.coerce.number().int().min(1),
  observacao: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
  const b = parsed.data;

  await ensureSchema();
  const cfgRow = await db().query(
    `SELECT preco_segundo, min_insercoes_dia, min_dias, min_valor, duracoes_seg, ativo
       FROM midia_simulador_config WHERE id = 1`
  ).then(r => r.rows[0]);
  if (!cfgRow?.ativo) return NextResponse.json({ ok: false, error: "simulador desativado no momento" }, { status: 400 });

  const cfg: SimuladorConfig = {
    preco_segundo: Number(cfgRow.preco_segundo),
    min_insercoes_dia: Number(cfgRow.min_insercoes_dia),
    min_dias: Number(cfgRow.min_dias),
    min_valor: Number(cfgRow.min_valor),
    duracoes_seg: parseDuracoes(cfgRow.duracoes_seg),
    ativo: true,
  };

  const erros = validarPedido(cfg, b);
  if (erros.length) return NextResponse.json({ ok: false, error: erros.join(" · ") }, { status: 400 });

  const valor = calcularValor(cfg.preco_segundo, b);

  const id = await db().query<{ id: string }>(
    `INSERT INTO midia_pedidos (conta_id, orientacao, insercoes_dia, segundos, dias, valor, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [auth.sub, b.orientacao, b.insercoes_dia, b.segundos, b.dias, valor, b.observacao ?? null]
  ).then(r => r.rows[0].id);

  // Notifica o master (best-effort) que tem pedido novo
  try {
    const { enviarWhatsAppMaster } = await import("@/lib/whatsapp");
    const conta = await db().query<{ empresa: string }>(`SELECT empresa FROM midia_contas WHERE id = $1`, [auth.sub]).then(r => r.rows[0]);
    await enviarWhatsAppMaster({
      tipo: "pedido_novo",
      cabecalho: "🛒 Novo pedido de inserções",
      mensagem: `${conta?.empresa ?? "Anunciante"} simulou um pedido:\n${b.insercoes_dia} ins/dia · ${b.segundos}s · ${b.dias} dias · ${b.orientacao}\nValor: ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n\nRevise em Admin > Pedidos.`,
    });
  } catch (e) { console.warn("[pedidos] whatsapp master:", (e as Error).message); }

  return NextResponse.json({ ok: true, id, valor });
}
