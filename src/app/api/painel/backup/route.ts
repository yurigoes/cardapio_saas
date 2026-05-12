/**
 * GET /api/painel/backup
 *
 * Exporta toda a configuração da empresa em JSON.
 * Inclui: empresa, categorias, produtos, cupons (templates), mesas.
 *
 * NÃO inclui:
 *   - Dados transacionais (pedidos, clientes, pagamentos, caixas)
 *   - Credenciais sensíveis (gateways, evolution_key, n8n_token)
 *   - IDs internos (gerados novos no restore)
 *
 * Restrito a admin/gerente.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { forbidden, serverError } from "@/lib/utils/response";

const VERSAO_BACKUP = 1;
const ROLES_OK = ["master", "admin", "gerente"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!ROLES_OK.includes(role)) return forbidden();

  try {
    const [empresa, categorias, produtos, cupons, mesas, gateways] = await Promise.all([
      queryOne(
        `SELECT nome_fantasia, descricao,
                cor_primaria, cor_secundaria, tema, logo_url, banner_url,
                horario_abertura::text, horario_fechamento::text, dias_funcionamento,
                aceita_dinheiro, aceita_pix, aceita_cartao, caixa_obrigatorio,
                imprimir_cozinha_auto, imprimir_cupom_auto,
                taxa_entrega, pedido_minimo, tempo_entrega_min,
                fidelidade_ativo, pontos_por_real, real_por_ponto,
                cashback_ativo, cashback_percentual,
                totem_bg_video_url, totem_bg_image_url, totem_cta_text, totem_slogan,
                pix_tipo, pix_chave, pix_favorecido,
                modulos_ativos
         FROM empresas WHERE id = $1`,
        [empresaId]
      ),
      query(
        `SELECT nome, descricao, imagem_url, ordem, ativo, disponivel
         FROM categorias WHERE empresa_id = $1 AND deleted_at IS NULL
         ORDER BY ordem ASC, nome ASC`,
        [empresaId]
      ),
      query(
        `SELECT p.nome, p.descricao, p.preco, p.preco_custo,
                p.disponivel, p.destaque, p.tempo_preparo, p.imagem_url, p.tipo,
                p.pontos_fidelidade,
                COALESCE(p.variacoes, '{"grupos":[]}'::jsonb) AS variacoes,
                p.controla_estoque, p.estoque_atual, p.estoque_minimo,
                c.nome AS categoria_nome
         FROM produtos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
         WHERE p.empresa_id = $1 AND p.deleted_at IS NULL
         ORDER BY c.ordem ASC NULLS LAST, p.nome ASC`,
        [empresaId]
      ),
      query(
        `SELECT codigo, descricao, tipo, valor,
                uso_maximo, uso_atual, uso_por_cliente,
                valor_minimo_pedido,
                valido_de::text, valido_ate::text,
                pontos_resgatados, ativo
         FROM cupons
         WHERE empresa_id = $1 AND cliente_id IS NULL
         ORDER BY codigo`,
        [empresaId]
      ),
      query(
        `SELECT numero, nome, capacidade, setor
         FROM mesas WHERE empresa_id = $1 AND deleted_at IS NULL
         ORDER BY numero`,
        [empresaId]
      ),
      // Apenas estrutura/slug — credenciais NÃO exportadas
      query(
        `SELECT slug, nome, ambiente, padrao, ativo, configuracoes
         FROM gateways_config
         WHERE empresa_id = $1 AND deleted_at IS NULL
         ORDER BY padrao DESC, nome`,
        [empresaId]
      ),
    ]);

    const backup = {
      versao:     VERSAO_BACKUP,
      gerado_em:  new Date().toISOString(),
      empresa,
      categorias,
      produtos,
      cupons_templates: cupons,
      mesas,
      gateways_estrutura: gateways,
      _aviso: "Não inclui pedidos, clientes, pagamentos nem credenciais. Reconfigure credenciais manualmente após restore.",
    };

    const filename = `backup-${empresaId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type":        "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (err) {
    console.error("[Backup/Export]", err);
    return serverError();
  }
}
