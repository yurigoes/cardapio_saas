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
         id, nome_fantasia, razao_social, cnpj, slug,
         whatsapp, telefone, email,
         cor_primaria, cor_secundaria, tema,
         logo_url, banner_url, descricao,
         horario_abertura, horario_fechamento, dias_funcionamento,
         aceita_dinheiro, aceita_pix, aceita_cartao,
         taxa_entrega, pedido_minimo, tempo_entrega_min,
         fidelidade_ativo, pontos_por_real, real_por_ponto,
         totem_bg_video_url, totem_bg_image_url, totem_cta_text, totem_slogan,
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
    return serverError();
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
    "taxa_entrega", "pedido_minimo", "tempo_entrega_min",
    "fidelidade_ativo", "pontos_por_real", "real_por_ponto",
    "totem_bg_video_url", "totem_bg_image_url", "totem_cta_text", "totem_slogan",
    "evolution_url", "evolution_key", "evolution_eventos",
    "n8n_url", "n8n_token", "n8n_eventos",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) return badRequest("Nenhum campo para atualizar");

  try {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values = [empresaId, ...Object.values(updates)];

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
    return serverError();
  }
}
