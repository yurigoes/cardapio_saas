/**
 * POST /api/admin/empresas/[id]/acoes
 *
 * Ações administrativas executadas pelo MASTER (dono do SaaS) sem
 * precisar acessar a VPS via SSH.
 *
 * Body: { acao: <nome>, params?: { ... } }
 *
 * Ações suportadas (todas exigem role=master):
 *   - reset-senha-usuario  { usuario_id, nova_senha }
 *   - desbloquear-usuarios                            -- limpa bloqueado_ate de todos
 *   - forcar-logout-todos                             -- invalida todas sessões
 *   - zerar-dados-operacionais                        -- apaga pedidos/mesas/caixa
 *                                                       (mantém produtos, usuários, config)
 *   - resetar-modulos       { modulos: string[] }     -- substitui modulos_ativos
 *   - suspender             {}                        -- status=suspenso
 *   - reativar              {}                        -- status=ativo
 *   - estatisticas-rapidas  {}                        -- conta linhas em tabelas chave
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, transaction } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import type { PoolClient } from "pg";

const bodySchema = z.object({
  acao:   z.string().min(1).max(50),
  params: z.record(z.unknown()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Apenas master pode executar ações administrativas");

  let body: z.infer<typeof bodySchema>;
  try { body = bodySchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const empresa = await queryOne<{ id: string; nome_fantasia: string }>(
    `SELECT id, nome_fantasia FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [params.id]
  );
  if (!empresa) return notFound("Empresa não encontrada");

  const empresaId = params.id;
  const acao      = body.acao;
  const p         = (body.params ?? {}) as Record<string, unknown>;

  try {
    let result: unknown;

    switch (acao) {
      case "reset-senha-usuario": {
        const usuarioId = String(p.usuario_id ?? "");
        const novaSenha = String(p.nova_senha ?? "");
        if (!usuarioId)             return badRequest("usuario_id obrigatório");
        if (novaSenha.length < 8)   return badRequest("nova_senha precisa de 8+ caracteres");

        // Usa pgcrypto direto pra evitar dep de bcryptjs no app
        const r = await queryOne<{ email: string }>(
          `UPDATE usuarios
              SET senha_hash       = crypt($1, gen_salt('bf', 12)),
                  ativo            = true,
                  bloqueado_ate    = NULL,
                  tentativas_login = 0
            WHERE id = $2 AND empresa_id = $3
            RETURNING email`,
          [novaSenha, usuarioId, empresaId]
        );
        if (!r) return notFound("Usuário não encontrado nesta empresa");
        result = { usuario_email: r.email };
        break;
      }

      case "desbloquear-usuarios": {
        const r = await query<{ id: string }>(
          `UPDATE usuarios
              SET bloqueado_ate = NULL, tentativas_login = 0
            WHERE empresa_id = $1 AND (bloqueado_ate IS NOT NULL OR tentativas_login > 0)
            RETURNING id`,
          [empresaId]
        );
        result = { desbloqueados: r.length };
        break;
      }

      case "forcar-logout-todos": {
        const r = await query<{ id: string }>(
          `UPDATE sessoes SET revogada = true, revogada_em = NOW()
            WHERE usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = $1)
              AND revogada = false
            RETURNING id`,
          [empresaId]
        ).catch(() => [] as { id: string }[]);
        result = { sessoes_revogadas: r.length };
        break;
      }

      case "zerar-dados-operacionais": {
        // Apaga TUDO que é movimentação. Preserva: empresa, plano, usuários,
        // produtos/categorias, mesas, configs, integrações.
        const counts = await transaction(async (client: PoolClient) => {
          const c: Record<string, number> = {};
          const tabelas = [
            "pedido_pagamentos", "pedido_itens", "pedidos",
            "caixa_movimentos", "caixas",
            "estoque_movimentos",
            "vales",
            "comandas",
            "print_jobs",
            "ifood_eventos",
            "audit_log",
            "error_log",
          ];
          for (const t of tabelas) {
            try {
              const r = await client.query(
                `DELETE FROM ${t} WHERE empresa_id = $1`,
                [empresaId]
              );
              c[t] = r.rowCount ?? 0;
            } catch {
              c[t] = -1; // tabela não existe — ok
            }
          }
          // Libera mesas
          await client.query(
            `UPDATE mesas SET status = 'livre', pedido_ativo_id = NULL WHERE empresa_id = $1`,
            [empresaId]
          ).catch(() => {});
          return c;
        });
        result = { apagados: counts };
        break;
      }

      case "resetar-modulos": {
        const modulos = Array.isArray(p.modulos) ? p.modulos.map(String) : null;
        if (!modulos) return badRequest("params.modulos deve ser array de strings");
        await queryOne(
          `UPDATE empresas SET modulos_ativos = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(modulos), empresaId]
        );
        result = { modulos_ativos: modulos };
        break;
      }

      case "suspender":
      case "reativar": {
        const status = acao === "suspender" ? "suspenso" : "ativo";
        await queryOne(
          `UPDATE empresas SET status = $1, updated_at = NOW() WHERE id = $2`,
          [status, empresaId]
        );
        result = { status };
        break;
      }

      case "estatisticas-rapidas": {
        // Conta linhas em tabelas relevantes pra dar visão geral
        const tabelas = [
          "usuarios", "produtos", "pedidos", "mesas", "categorias",
          "clientes", "caixas", "print_jobs", "ifood_eventos",
        ];
        const counts: Record<string, number | string> = {};
        for (const t of tabelas) {
          try {
            const r = await queryOne<{ n: string }>(
              `SELECT COUNT(*)::text AS n FROM ${t} WHERE empresa_id = $1`,
              [empresaId]
            );
            counts[t] = parseInt(r?.n ?? "0", 10);
          } catch { counts[t] = "—"; }
        }
        // Pedidos por status (do mês)
        const porStatus = await query<{ status: string; n: string }>(
          `SELECT status, COUNT(*)::text AS n FROM pedidos
            WHERE empresa_id = $1 AND created_at > NOW() - INTERVAL '30 days'
            GROUP BY status`,
          [empresaId]
        ).catch(() => []);
        result = { tabelas: counts, pedidos_30d_por_status: porStatus };
        break;
      }

      default:
        return badRequest(`Ação desconhecida: ${acao}`);
    }

    await auditLog({
      acao:       `master:${acao}`,
      recurso:    "empresas",
      recursoId:  empresaId,
      dadosNovos: { params: p, result },
      usuario:    { sub: auth.payload.sub, empresaId },
    });

    return ok({ acao, empresa: empresa.nome_fantasia, result });
  } catch (err) {
    console.error(`[Admin/Empresas/Acoes/${acao}]`, err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
