/**
 * POST /api/admin/retaguardas/install-token
 *
 * Master gera token de uso único pra instalação remota da retaguarda.
 * Retorna o comando curl pronto pra colar no mini-PC novo.
 *
 * Body: { empresa_slug, subdomain?, base_domain? }
 * Resp: { token, expires_at, install_command }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, badRequest, forbidden, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({
  empresa_slug: z.string().min(1),
  subdomain:    z.string().regex(/^[a-z0-9-]+$/i).optional(),
  base_domain:  z.string().regex(/^[a-z0-9.-]+$/i).default("tthreedigital.com.br"),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Acesso exclusivo master");

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const empresa = await queryOne<{ id: string }>(
      `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL`,
      [body.empresa_slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const sub = body.subdomain ?? `loja-${body.empresa_slug.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const token = crypto.randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await queryOne(
      `INSERT INTO retaguardas_install_tokens
         (token, empresa_id, empresa_slug, subdomain, base_domain, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [token, empresa.id, body.empresa_slug, sub, body.base_domain, expires.toISOString(), auth.payload.sub ?? null]
    );

    const masterUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";
    // Comando curl que o operador cola no mini-PC. Script é servido
    // direto pelo master via /install-retaguarda.sh (que lê o arquivo
    // do disco do container ou cai pro fallback GitHub).
    const install_command = `curl -fsSL ${masterUrl}/install-retaguarda.sh | sudo INSTALL_TOKEN=${token} MASTER_URL=${masterUrl} bash`;
    const install_command_github = `INSTALL_TOKEN=${token} MASTER_URL=${masterUrl} curl -fsSL https://raw.githubusercontent.com/yurigoes/cardapio_saas/main/retaguarda/install.sh | sudo -E bash`;

    return ok({
      token,
      expires_at:       expires.toISOString(),
      empresa_slug:     body.empresa_slug,
      retaguarda_domain: `${sub}.${body.base_domain}`,
      master_url:       masterUrl,
      install_command,        // recomendado (servido pelo master)
      install_command_github, // alternativa via GitHub raw
    });
  } catch (err) {
    console.error("[admin/retaguardas/install-token]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
