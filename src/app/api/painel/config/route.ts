/**
 * GET  /api/painel/config  → configurações e personalização da empresa
 * PATCH /api/painel/config → atualiza configurações
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError, badRequest } from "@/lib/utils/response";

const ALLOWED_ROLES = ["master", "admin", "gerente"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED_ROLES.includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  try {
    const empresa = await queryOne<Record<string, unknown>>(
      `SELECT
         id, nome_fantasia, razao_social, razao_social_full, cnpj,
         inscricao_estadual, inscricao_municipal, regime_tributario, slug,
         whatsapp, telefone, email,
         endereco_cep, endereco_logradouro, endereco_numero,
         endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf,
         gestor_nome, gestor_cpf, gestor_rg, gestor_telefone, gestor_email,
         cadastro_status, cadastro_motivo_rejeicao,
         cor_primaria, cor_secundaria, tema,
         logo_url, banner_url, descricao,
         horario_abertura, horario_fechamento, dias_funcionamento,
         aceita_dinheiro, aceita_pix, aceita_cartao,
         caixa_obrigatorio, imprimir_cozinha_auto, imprimir_cupom_auto,
         taxa_entrega, pedido_minimo, tempo_entrega_min,
         fidelidade_ativo, pontos_por_real, real_por_ponto,
         cashback_ativo, cashback_percentual,
         totem_bg_video_url, totem_bg_image_url, totem_cta_text, totem_slogan,
         totem_logo_url, totem_cor_destaque, totem_promo_texto,
         totem_pos_destaque, totem_atendimento,
         COALESCE(totem_tema, 'escuro') AS totem_tema,
         COALESCE(totem_aceita_dinheiro, false) AS totem_aceita_dinheiro,
         COALESCE(delivery_aceita_fora_zona, false) AS delivery_aceita_fora_zona,
         evolution_url, evolution_key, evolution_eventos,
         n8n_url, n8n_token, n8n_eventos,
         modulos_ativos, status
       FROM empresas
       WHERE id = $1 AND deleted_at IS NULL`,
      [empresaId]
    );

    if (!empresa) return forbidden("Empresa não encontrada");
    return ok(empresa);
  } catch (err) {
    console.error("[Config/GET]", err);
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    // Detecta coluna faltante e devolve mensagem útil pro front
    if (msg.includes("column") && msg.includes("does not exist")) {
      return serverError(`Schema desatualizado — rode migration 086. Detalhe: ${msg.slice(0, 200)}`);
    }
    return serverError(msg.slice(0, 200));
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED_ROLES.includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  // Campos permitidos para atualização
  const ALLOWED_FIELDS = [
    "nome_fantasia", "whatsapp", "telefone", "email",
    "cor_primaria", "cor_secundaria", "tema",
    "logo_url", "banner_url", "descricao",
    "horario_abertura", "horario_fechamento", "dias_funcionamento",
    "aceita_dinheiro", "aceita_pix", "aceita_cartao",
    "caixa_obrigatorio", "imprimir_cozinha_auto", "imprimir_cupom_auto",
    "taxa_entrega", "pedido_minimo", "tempo_entrega_min",
    "fidelidade_ativo", "pontos_por_real", "real_por_ponto",
    "cashback_ativo", "cashback_percentual",
    "totem_bg_video_url", "totem_bg_image_url", "totem_cta_text", "totem_slogan",
    "totem_logo_url", "totem_cor_destaque", "totem_promo_texto",
    "totem_pos_destaque", "totem_atendimento",
    "totem_tema", "totem_aceita_dinheiro", "delivery_aceita_fora_zona",
    "evolution_url", "evolution_key", "evolution_eventos",
    "n8n_url", "n8n_token", "n8n_eventos",
    // Dados cadastrais (form de empresa)
    "razao_social", "razao_social_full", "cnpj",
    "inscricao_estadual", "inscricao_municipal", "regime_tributario",
    "endereco_cep", "endereco_logradouro", "endereco_numero",
    "endereco_complemento", "endereco_bairro", "endereco_cidade", "endereco_uf",
    "gestor_nome", "gestor_cpf", "gestor_rg", "gestor_telefone", "gestor_email",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) return badRequest("Nenhum campo para atualizar");

  // Campos JSONB precisam de serialização explícita + cast — alguns ambientes
  // têm a coluna como TEXT (migração antiga) e o pg-driver serializa array JS
  // como tupla Postgres '{a,b}' em vez de JSON, quebrando leituras futuras.
  const JSONB_FIELDS = new Set([
    "evolution_eventos", "n8n_eventos", "dias_funcionamento", "modulos_ativos",
  ]);

  try {
    const setClauses = Object.keys(updates).map((k, i) => {
      if (JSONB_FIELDS.has(k)) {
        return `${k} = $${i + 2}::jsonb`;
      }
      return `${k} = $${i + 2}`;
    }).join(", ");

    const values = [
      empresaId,
      ...Object.entries(updates).map(([k, v]) =>
        JSONB_FIELDS.has(k) ? JSON.stringify(v ?? []) : v
      ),
    ];

    const updated = await queryOne<{ id: string }>(
      `UPDATE empresas SET ${setClauses}, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      values
    );

    if (!updated) return forbidden("Empresa não encontrada");
    return ok({ updated: true });
  } catch (err) {
    console.error("[Config/PATCH]", err);
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    if (msg.includes("column") && msg.includes("does not exist")) {
      return serverError(`Schema desatualizado — rode migration 086. Detalhe: ${msg.slice(0, 200)}`);
    }
    return serverError(msg.slice(0, 200));
  }
}
