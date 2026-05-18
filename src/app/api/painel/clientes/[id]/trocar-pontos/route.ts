/**
 * POST /api/painel/clientes/[id]/trocar-pontos
 *   body: { pontos: number }
 *
 * Versão pra operador/admin no painel: gera cupom pra cliente
 * descontando pontos. Mesma lógica do endpoint público mas
 * autenticado e validado contra a empresa do JWT.
 *
 * Aceita também o cenário cross-filial: o cliente pode ter
 * empresa_id da matriz; basta pertencer à rede do operador.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne, transaction } from "@/lib/db/client";
import { ok, badRequest, forbidden, notFound, serverError } from "@/lib/utils/response";
import { clientesScope } from "@/lib/rede/clientes";
import type { PoolClient } from "pg";

const schema = z.object({
  pontos: z.coerce.number().int().min(1, "pontos deve ser ≥ 1"),
});

function gerarCodigo(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) => Array.from({ length: n }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `RGT-${seg(6)}`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const empresa = await queryOne<{
      id: string; fidelidade_ativo: boolean | null; real_por_ponto: string | null;
    }>(
      `SELECT id, fidelidade_ativo, real_por_ponto
         FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
      [empresaId]
    );
    if (!empresa) return notFound("Empresa não encontrada");
    if (!empresa.fidelidade_ativo) return badRequest("Fidelidade desativada");

    const realPorPonto = Number(empresa.real_por_ponto ?? 0);
    if (realPorPonto <= 0) return badRequest("Regra de troca (R$ por ponto) não configurada");

    const valor = Number((body.pontos * realPorPonto).toFixed(2));
    if (valor <= 0) return badRequest("Pontos insuficientes pra gerar 1 centavo");

    const scope = await clientesScope(empresaId);

    const result = await transaction(async (client: PoolClient) => {
      // Cliente precisa estar no escopo (rede ou empresa)
      const filtro = scope.cross_filial && scope.rede_id
        ? { col: "rede_id", val: scope.rede_id }
        : { col: "empresa_id", val: scope.empresa_id };

      const cliente = await client.query<{ id: string; pontos: number }>(
        `SELECT id, pontos FROM clientes
          WHERE id = $1 AND ${filtro.col} = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [params.id, filtro.val]
      ).then(r => r.rows[0]);

      if (!cliente) return { error: "not_found" as const };
      if (Number(cliente.pontos) < body.pontos) {
        return { error: "insufficient" as const, message: `Saldo: ${cliente.pontos} pts` };
      }

      await client.query(
        `UPDATE clientes SET pontos = pontos - $1, updated_at = NOW() WHERE id = $2`,
        [body.pontos, cliente.id]
      );

      let codigo = "";
      for (let i = 0; i < 6; i++) {
        const t = gerarCodigo();
        const exists = await client.query(
          `SELECT 1 FROM cupons WHERE empresa_id = $1 AND UPPER(codigo) = UPPER($2)`,
          [empresa.id, t]
        ).then(r => r.rows[0]);
        if (!exists) { codigo = t; break; }
      }
      if (!codigo) return { error: "code_fail" as const };

      const validade = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const novo = await client.query<{ id: string }>(
        `INSERT INTO cupons
           (empresa_id, codigo, descricao, tipo, valor,
            uso_maximo, uso_atual, uso_por_cliente,
            valor_minimo_pedido, valido_de, valido_ate,
            cliente_id, pontos_resgatados, ativo)
         VALUES ($1, $2, $3, 'fixo', $4,
                 1, 0, 1,
                 NULL, NOW(), $5,
                 $6, $7, true)
         RETURNING id`,
        [empresa.id, codigo, `Resgate de ${body.pontos} pts (painel)`, valor.toFixed(2),
         validade, cliente.id, body.pontos]
      ).then(r => r.rows[0]);

      return {
        ok: true as const,
        cupom: { id: novo.id, codigo, valor, validade },
        pontos_debitados: body.pontos,
        pontos_restantes: Number(cliente.pontos) - body.pontos,
      };
    });

    if ("error" in result) {
      switch (result.error) {
        case "not_found":    return notFound("Cliente não encontrado nesta rede/empresa");
        case "insufficient": return badRequest(result.message);
        case "code_fail":    return serverError("Não foi possível gerar código único");
      }
    }
    return ok(result);
  } catch (err) {
    console.error("[Painel/Clientes/TrocarPontos/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
