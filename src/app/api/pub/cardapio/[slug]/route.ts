import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { ok, notFound, serverError } from "@/lib/utils/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const empresa = await queryOne<{
      id: string; nome_fantasia: string; logo_url: string | null;
      cor_primaria: string | null; cor_secundaria: string | null;
      whatsapp: string | null; modulos_ativos: string[];
      totem_bg_video_url: string | null; totem_bg_image_url: string | null;
      totem_cta_text: string | null; totem_slogan: string | null;
      horario_abertura: string | null; horario_fechamento: string | null;
      caixa_obrigatorio: boolean;
    }>(
      `SELECT id, nome_fantasia, logo_url, cor_primaria, cor_secundaria, whatsapp, modulos_ativos,
              totem_bg_video_url, totem_bg_image_url, totem_cta_text, totem_slogan,
              horario_abertura::text, horario_fechamento::text,
              COALESCE(caixa_obrigatorio, false) AS caixa_obrigatorio
       FROM empresas
       WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [params.slug]
    );

    if (!empresa) return notFound("Cardápio não encontrado");

    // Caixa aberto? Útil para o totem mostrar feedback proativo.
    // Sempre consultado mas só relevante se caixa_obrigatorio=true.
    const caixaAberto = empresa.caixa_obrigatorio
      ? !!(await queryOne<{ id: string }>(
          `SELECT id FROM caixas WHERE empresa_id = $1 AND status = 'aberto' LIMIT 1`,
          [empresa.id]
        ).catch(() => null))
      : true; // se não exige, sempre "aberto" do ponto de vista do totem

    const [categorias, produtos] = await Promise.all([
      query(
        `SELECT id, nome, descricao, imagem_url, ordem
         FROM categorias
         WHERE empresa_id = $1 AND deleted_at IS NULL AND disponivel = true
         ORDER BY ordem ASC, nome ASC`,
        [empresa.id]
      ),
      query(
        `SELECT id, categoria_id, nome, descricao, preco, imagem_url,
                tempo_preparo, tipo, destaque,
                COALESCE(pontos_fidelidade, 0)         AS pontos_fidelidade,
                COALESCE(variacoes, '{"grupos":[]}'::jsonb) AS variacoes
         FROM produtos
         WHERE empresa_id = $1 AND deleted_at IS NULL AND disponivel = true
         ORDER BY nome ASC`,
        [empresa.id]
      ),
    ]);

    return ok({
      empresa: {
        id:                  empresa.id,
        nome_fantasia:       empresa.nome_fantasia,
        logo_url:            empresa.logo_url,
        cor_primaria:        empresa.cor_primaria,
        cor_secundaria:      empresa.cor_secundaria,
        whatsapp:            empresa.whatsapp,
        totem_bg_video_url:  empresa.totem_bg_video_url,
        totem_bg_image_url:  empresa.totem_bg_image_url,
        totem_cta_text:      empresa.totem_cta_text,
        totem_slogan:        empresa.totem_slogan,
        horario_abertura:    empresa.horario_abertura,
        horario_fechamento:  empresa.horario_fechamento,
        caixa_obrigatorio:   empresa.caixa_obrigatorio,
        caixa_aberto:        caixaAberto,
      },
      categorias,
      produtos,
    });
  } catch (err) {
    console.error("[Pub/Cardapio/GET]", err);
    return serverError();
  }
}
