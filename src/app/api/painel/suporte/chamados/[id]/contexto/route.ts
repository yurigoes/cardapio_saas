/**
 * GET /api/painel/suporte/chamados/[id]/contexto
 *
 * Retorna TODAS as variáveis auto-preenchíveis pra templates de email/WhatsApp.
 * UI usa isso pra (a) substituir no preview e (b) NÃO mostrar campos
 * de input pras vars que já têm valor automático.
 *
 * Categorias:
 *   - Chamado:  cliente, operador, cargo, assunto, numero, link, email, telefone
 *   - SaaS:     saas_nome, saas_logo, saas_site, saas_whatsapp, saas_email, saas_ano,
 *               painel_url, app_url, login_url
 *   - Empresa:  empresa, empresa_cnpj, empresa_endereco, empresa_cidade, empresa_uf,
 *               empresa_telefone, empresa_email, empresa_logo
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, notFound, serverError } from "@/lib/utils/response";
import { getSaasBranding } from "@/lib/branding/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const ctx = await queryOne<{
      assunto:           string;
      numero:            number | null;
      empresa_id:        string | null;
      empresa_nome:      string | null;
      empresa_cnpj:      string | null;
      empresa_logradouro: string | null;
      empresa_numero:    string | null;
      empresa_bairro:    string | null;
      empresa_cidade:    string | null;
      empresa_uf:        string | null;
      empresa_telefone:  string | null;
      empresa_email:     string | null;
      empresa_logo:      string | null;
      usuario_nome:      string | null;
      usuario_email:     string | null;
      usuario_telefone:  string | null;
    }>(
      `SELECT c.assunto,
              (ROW_NUMBER() OVER (ORDER BY c.criado_em))::int AS numero,
              c.empresa_id,
              e.nome_fantasia       AS empresa_nome,
              e.cnpj                AS empresa_cnpj,
              e.endereco_logradouro AS empresa_logradouro,
              e.endereco_numero     AS empresa_numero,
              e.endereco_bairro     AS empresa_bairro,
              e.endereco_cidade     AS empresa_cidade,
              e.endereco_uf         AS empresa_uf,
              e.telefone            AS empresa_telefone,
              e.email               AS empresa_email,
              e.logo_url            AS empresa_logo,
              u.nome                AS usuario_nome,
              u.email               AS usuario_email,
              u.telefone            AS usuario_telefone
         FROM suporte_chamados c
         LEFT JOIN empresas e ON e.id = c.empresa_id
         LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.id = $1`,
      [params.id]
    );
    if (!ctx) return notFound("chamado não encontrado");

    const operador = await queryOne<{ nome: string; email: string; cargo: string | null }>(
      `SELECT nome, email, cargo FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    );

    const branding = await getSaasBranding();
    const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";

    const enderecoCompleto = [
      ctx.empresa_logradouro,
      ctx.empresa_numero,
      ctx.empresa_bairro,
      ctx.empresa_cidade && ctx.empresa_uf
        ? `${ctx.empresa_cidade}/${ctx.empresa_uf}`
        : (ctx.empresa_cidade ?? ctx.empresa_uf ?? ""),
    ].filter(Boolean).join(", ");

    const variaveis: Record<string, string> = {
      // ── Chamado / pessoas ────────────────────────────────────
      cliente:    ctx.usuario_nome ?? "Cliente",
      operador:   operador?.nome   ?? "Suporte",
      cargo:      operador?.cargo  ?? "",
      assunto:    ctx.assunto,
      numero:     String(ctx.numero ?? params.id.slice(0, 8)),
      link:       `${appUrl}/painel/suporte/chamados/${params.id}`,
      email:      ctx.usuario_email    ?? "",
      telefone:   ctx.usuario_telefone ?? "",

      // ── SaaS (dono do sistema) ───────────────────────────────
      saas_nome:     branding.nome ?? "Three Digital",
      saas_logo:     branding.logo_url ?? "",
      saas_site:     branding.site ?? "https://tthreedigital.com.br",
      saas_whatsapp: branding.whatsapp ?? "",
      saas_email:    branding.email ?? "",
      saas_ano:      String(new Date().getFullYear()),
      app_url:       appUrl,
      painel_url:    `${appUrl}/painel`,
      login_url:     `${appUrl}/login`,

      // ── Empresa (cliente do SaaS) ────────────────────────────
      empresa:           ctx.empresa_nome     ?? "",
      empresa_cnpj:      ctx.empresa_cnpj     ?? "",
      empresa_endereco:  enderecoCompleto,
      empresa_cidade:    ctx.empresa_cidade   ?? "",
      empresa_uf:        ctx.empresa_uf       ?? "",
      empresa_telefone:  ctx.empresa_telefone ?? "",
      empresa_email:     ctx.empresa_email    ?? "",
      empresa_logo:      ctx.empresa_logo     ?? "",
    };

    return ok({ variaveis });
  } catch (err) {
    console.error("[Chamados/contexto]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
