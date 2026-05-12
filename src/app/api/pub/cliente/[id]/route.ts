/**
 * GET /api/pub/cliente/[id]?slug=empresa-slug
 *
 * Retorna o perfil completo de um cliente:
 *   - dados básicos
 *   - últimos 10 pedidos (com data, total, status)
 *   - cupons ativos (vinculados ao cliente)
 *   - próximo benefício (cupom mais barato em termos de pontos a resgatar, se houver)
 *
 * Rota pública — escopo é dado pelo slug da empresa.
 * Não retorna dados sensíveis (CPF mascarado).
 */
import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound, serverError } from "@/lib/utils/response";

function maskCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return badRequest("Parâmetro 'slug' é obrigatório");

  try {
    const empresa = await queryOne<{ id: string; nome_fantasia: string }>(
      `SELECT id, nome_fantasia FROM empresas
       WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const clienteRaw = await queryOne<{
      id:            string;
      nome:          string | null;
      telefone:      string | null;
      cpf:           string | null;
      pontos:        string | number;
      total_pedidos: string | number;
      total_gasto:   string | number;
      ultimo_pedido: string | null;
      created_at:    string;
    }>(
      `SELECT id, nome, telefone, cpf,
              pontos, total_pedidos, total_gasto,
              ultimo_pedido_em AS ultimo_pedido, created_at
       FROM clientes
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresa.id]
    );
    if (!clienteRaw) return notFound("Cliente não encontrado");

    const cliente = {
      ...clienteRaw,
      cpf:           maskCpf(clienteRaw.cpf),
      pontos:        Number(clienteRaw.pontos),
      total_pedidos: Number(clienteRaw.total_pedidos),
      total_gasto:   Number(clienteRaw.total_gasto),
    };

    // Pedidos recentes
    const pedidos = await query<{
      id:        string;
      numero:    number;
      total:     string | number;
      status:    string;
      tipo:      string;
      criado_em: string;
    }>(
      `SELECT id, numero, total, status, tipo, created_at AS criado_em
       FROM pedidos
       WHERE cliente_id = $1 AND empresa_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 10`,
      [params.id, empresa.id]
    );

    // Cupons ativos
    const cupons = await query<{
      id:         string;
      codigo:     string;
      tipo:       string;
      valor:      string | number;
      validade:   string | null;
      pontos_resgate: number | null;
    }>(
      `SELECT id, codigo, tipo, valor,
              valido_ate AS validade,
              pontos_resgatados AS pontos_resgate
       FROM cupons
       WHERE empresa_id = $1
         AND (cliente_id = $2 OR cliente_id IS NULL)
         AND ativo = true
         AND (valido_ate IS NULL OR valido_ate > NOW())
       ORDER BY pontos_resgatados ASC NULLS LAST, created_at DESC
       LIMIT 12`,
      [empresa.id, params.id]
    );

    // Próximo benefício (cupom de pontos mais barato que ele ainda não tem saldo)
    const proximoBeneficio = cupons.find(
      (c) => c.pontos_resgate != null && Number(c.pontos_resgate) > Number(cliente.pontos)
    );

    return ok({
      empresa: { nome_fantasia: empresa.nome_fantasia, slug },
      cliente,
      pedidos: pedidos.map((p) => ({ ...p, total: Number(p.total) })),
      cupons:  cupons.map((c) => ({
        ...c,
        valor:          Number(c.valor),
        pontos_resgate: c.pontos_resgate != null ? Number(c.pontos_resgate) : null,
      })),
      proximo_beneficio: proximoBeneficio
        ? {
            codigo:    proximoBeneficio.codigo,
            tipo:      proximoBeneficio.tipo,
            valor:     Number(proximoBeneficio.valor),
            pontos:    Number(proximoBeneficio.pontos_resgate ?? 0),
            faltam:    Number(proximoBeneficio.pontos_resgate ?? 0) - Number(cliente.pontos),
          }
        : null,
    });
  } catch (err) {
    console.error("[Pub/Cliente/Detail/GET]", err);
    return serverError();
  }
}
