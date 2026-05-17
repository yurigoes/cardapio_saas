/**
 * GET  /api/painel/empresa/contrato → contrato vigente (já aceito) ou template ativo
 * POST /api/painel/empresa/contrato → aceitar contrato { aceito: true, nome_assinante?, cpf_assinante? }
 *
 * Clickwrap: registra IP, user-agent, timestamp, snapshot do conteúdo e hash sha256.
 */
import { NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError, notFound } from "@/lib/utils/response";

function renderTemplate(html: string, empresa: Record<string, unknown>): string {
  return html
    .replace(/\{\{razao_social\}\}/g,  String(empresa.razao_social_full ?? empresa.razao_social ?? empresa.nome_fantasia ?? "—"))
    .replace(/\{\{nome_fantasia\}\}/g, String(empresa.nome_fantasia ?? "—"))
    .replace(/\{\{cnpj\}\}/g,          String(empresa.cnpj ?? "—"))
    .replace(/\{\{gestor_nome\}\}/g,   String(empresa.gestor_nome ?? "—"))
    .replace(/\{\{gestor_cpf\}\}/g,    String(empresa.gestor_cpf ?? "—"));
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    // Já aceito?
    const aceito = await queryOne(
      `SELECT id, versao, conteudo_html, conteudo_hash, aceito_em,
              aceito_por_nome, aceito_por_cpf, aceito_ip::text AS aceito_ip
         FROM empresa_contratos
        WHERE empresa_id = $1 AND aceito = TRUE
        ORDER BY aceito_em DESC LIMIT 1`,
      [empresaId]
    );
    if (aceito) return ok({ status: "aceito", contrato: aceito });

    // Template ativo
    const template = await queryOne<{ id: string; versao: string; titulo: string; conteudo_html: string }>(
      `SELECT id, versao, titulo, conteudo_html FROM contrato_templates
        WHERE ativo = TRUE ORDER BY created_at DESC LIMIT 1`
    );
    if (!template) return notFound("Nenhum template de contrato ativo");

    const empresa = await queryOne<Record<string, unknown>>(
      `SELECT nome_fantasia, razao_social, razao_social_full, cnpj, gestor_nome, gestor_cpf
         FROM empresas WHERE id = $1`,
      [empresaId]
    );
    const rendered = renderTemplate(template.conteudo_html, empresa ?? {});
    const hash = crypto.createHash("sha256").update(rendered).digest("hex");

    return ok({
      status: "pendente",
      template: {
        id: template.id,
        versao: template.versao,
        titulo: template.titulo,
        conteudo_html: rendered,
        conteudo_hash: hash,
      },
    });
  } catch (err) {
    console.error("[Empresa/Contrato/GET]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

const aceitarSchema = z.object({
  aceito:         z.literal(true),
  nome_assinante: z.string().min(3).max(255),
  cpf_assinante:  z.string().min(11).max(14).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof aceitarSchema>;
  try { body = aceitarSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    // Pega template ativo
    const template = await queryOne<{ id: string; versao: string; conteudo_html: string }>(
      `SELECT id, versao, conteudo_html FROM contrato_templates
        WHERE ativo = TRUE ORDER BY created_at DESC LIMIT 1`
    );
    if (!template) return notFound("Nenhum template ativo");

    const empresa = await queryOne<Record<string, unknown>>(
      `SELECT nome_fantasia, razao_social, razao_social_full, cnpj, gestor_nome, gestor_cpf
         FROM empresas WHERE id = $1`,
      [empresaId]
    );
    const rendered = renderTemplate(template.conteudo_html, empresa ?? {});
    const hash = crypto.createHash("sha256").update(rendered).digest("hex");

    const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "0.0.0.0").split(",")[0].trim();
    const ua = req.headers.get("user-agent") ?? "";

    const r = await queryOne<{ id: string }>(
      `INSERT INTO empresa_contratos
         (empresa_id, template_id, versao, conteudo_html, conteudo_hash,
          aceito, aceito_em, aceito_por_usuario_id, aceito_por_nome, aceito_por_cpf,
          aceito_ip, aceito_user_agent)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), $6, $7, $8, $9::inet, $10)
       RETURNING id`,
      [empresaId, template.id, template.versao, rendered, hash,
       sub, body.nome_assinante, body.cpf_assinante ?? null, ip, ua]
    );

    return ok({ id: r?.id, hash, aceito_em: new Date().toISOString() });
  } catch (err) {
    console.error("[Empresa/Contrato/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
