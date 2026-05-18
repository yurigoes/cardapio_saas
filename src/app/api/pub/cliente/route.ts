/**
 * GET /api/pub/cliente?slug=&tipo=telefone|cpf&valor=
 *   Usado pelo totem para identificar cliente (sem auth)
 *   Retorna dados básicos do cliente + último pedido
 *
 * POST /api/pub/cliente?slug=
 *   Self-registration do cliente via totem (sem auth)
 *   Body: { nome, telefone?, cpf?, email?, data_nascimento? }
 *   Cria registro novo OU retorna existente se telefone/cpf bater.
 *   Respeita scope de rede (cross-filial → cliente único na rede).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound, serverError } from "@/lib/utils/response";
import { EMPRESA_OPERACIONAL_SQL } from "@/lib/billing/empresa-acesso";
import { clientesScope, valuesInsertCliente } from "@/lib/rede/clientes";
import { idempotencyEnter } from "@/lib/idempotency";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug  = searchParams.get("slug");
  const tipo  = searchParams.get("tipo"); // "telefone" | "cpf"
  const valor = searchParams.get("valor");

  if (!slug || !tipo || !valor) return badRequest("slug, tipo e valor são obrigatórios");
  if (!["telefone","cpf"].includes(tipo)) return badRequest("tipo deve ser 'telefone' ou 'cpf'");

  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`, [slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const cliente = await queryOne<Record<string, unknown>>(
      `SELECT id, nome, telefone, cpf, pontos, total_pedidos, total_gasto,
              COALESCE(saldo_cashback, 0) AS saldo_cashback,
              endereco
       FROM clientes WHERE empresa_id = $1 AND ${tipo} = $2`,
      [empresa.id, valor]
    );
    if (!cliente) return ok({ encontrado: false });

    // Busca último pedido
    const ultimoPedido = await queryOne<Record<string, unknown>>(
      `SELECT id, numero, total, created_at,
              (SELECT json_agg(json_build_object(
                'nome', p.nome,
                'quantidade', pi.quantidade,
                'preco', pi.preco_unitario
              ))
               FROM pedido_itens pi
               JOIN produtos p ON p.id = pi.produto_id
               WHERE pi.pedido_id = pd.id
               LIMIT 5
              ) as itens
       FROM pedidos pd
       WHERE cliente_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [cliente.id as string]
    );

    return ok({ encontrado: true, cliente, ultimoPedido });
  } catch (err) {
    console.error("[pub/cliente/GET]", err);
    return serverError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: cadastro de cliente no totem (sem auth)
// ─────────────────────────────────────────────────────────────────────────────
const cadastroSchema = z.object({
  nome:             z.string().min(2, "nome obrigatório").max(120).trim(),
  telefone:         z.string().regex(/^\d{10,15}$/, "telefone inválido").optional(),
  cpf:              z.string().regex(/^\d{11}$/, "CPF inválido").optional(),
  email:            z.string().email().max(255).optional(),
  data_nascimento:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return badRequest("slug é obrigatório");

  // Idempotency: cadastro duplicado vira no-op se mesma key chegar duas vezes
  const idem = await idempotencyEnter(req, "cliente");
  if (idem.cached) return idem.cached;

  let body: z.infer<typeof cadastroSchema>;
  try {
    const r = cadastroSchema.safeParse(await req.json());
    if (!r.success) {
      return badRequest(r.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas
        WHERE slug = $1 AND deleted_at IS NULL AND ${EMPRESA_OPERACIONAL_SQL}`,
      [slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const scope = await clientesScope(empresa.id);
    const ins   = valuesInsertCliente(scope);
    const filtroCol = scope.cross_filial && scope.rede_id ? "rede_id" : "empresa_id";
    const filtroVal = scope.cross_filial && scope.rede_id ? scope.rede_id : empresa.id;

    // Se já existe por telefone OU cpf, retorna o existente (em vez de erro)
    if (body.telefone || body.cpf) {
      const cond: string[] = [];
      const vals: unknown[] = [filtroVal];
      let i = 2;
      if (body.telefone) { cond.push(`telefone = $${i}`); vals.push(body.telefone); i++; }
      if (body.cpf)      { cond.push(`cpf = $${i}`);      vals.push(body.cpf);      i++; }

      const existente = await queryOne<{ id: string; nome: string; telefone: string | null; cpf: string | null; pontos: number }>(
        `SELECT id, nome, telefone, cpf, pontos
           FROM clientes
          WHERE ${filtroCol} = $1 AND (${cond.join(" OR ")}) AND deleted_at IS NULL
          LIMIT 1`,
        vals
      );
      if (existente) {
        const respExist = {
          id:       existente.id,
          nome:     existente.nome,
          telefone: existente.telefone,
          cpf:      existente.cpf,
          pontos:   Number(existente.pontos ?? 0),
          ja_existia: true,
        };
        await idem.save({ success: true, data: respExist }, 200);
        return ok(respExist);
      }
    }

    const novo = await queryOne<{ id: string }>(
      `INSERT INTO clientes
         (empresa_id, rede_id, nome, telefone, cpf, email, data_nascimento, pontos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
       RETURNING id`,
      [
        ins.empresa_id,
        ins.rede_id,
        body.nome,
        body.telefone     ?? null,
        body.cpf          ?? null,
        body.email        ?? null,
        body.data_nascimento ?? null,
      ]
    );

    const respNew = {
      id:       novo?.id,
      nome:     body.nome,
      telefone: body.telefone ?? null,
      cpf:      body.cpf      ?? null,
      pontos:   0,
      ja_existia: false,
    };
    await idem.save({ success: true, data: respNew }, 200);
    return ok(respNew);
  } catch (err) {
    console.error("[pub/cliente/POST]", err);
    // Provavelmente conflito UNIQUE (telefone/cpf duplicado) — tenta retornar o existente
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return badRequest("Já existe um cliente com este telefone/CPF");
    }
    return serverError(msg.slice(0, 200));
  }
}
