/**
 * GET   /api/painel/agentes/[id]/rustdesk
 *   Devolve config pro instalador do agente RustDesk:
 *     { relay_host, public_key, agent_id?, password? }
 *   Password vem em texto SOMENTE se ?revelar=1 e foi gerado nesta sessão
 *   (na prática: cliente faz POST primeiro pra gerar e mostra no modal).
 *
 * POST  /api/painel/agentes/[id]/rustdesk
 *   Gera/reseta password permanente do agente. Retorna password EM TEXTO
 *   uma única vez (depois fica cifrada no banco).
 *   Body opcional: { rustdesk_id?: string, auto_aceite?: boolean }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";
import { encryptField } from "@/lib/ifood/client";

const ALLOWED = ["master", "admin"];

function relayInfo() {
  return {
    relay_host: process.env.RUSTDESK_RELAY_HOST ?? null,
    public_key: process.env.RUSTDESK_PUBLIC_KEY ?? null,
  };
}

function gerarSenhaForte(len = 16): string {
  // ~96 bits, alfanumérico
  return randomBytes(Math.ceil(len * 0.75)).toString("base64url").slice(0, len);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const a = await queryOne<{
      id: string; nome: string; tipo: string;
      rustdesk_id: string | null;
      rustdesk_password: string | null;
      rustdesk_auto_aceite: boolean;
      rustdesk_registrado_em: string | null;
    }>(
      `SELECT id, nome, tipo, rustdesk_id, rustdesk_password,
              rustdesk_auto_aceite, rustdesk_registrado_em::text
         FROM agentes
        WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!a) return notFound("Agente não encontrado");

    const relay = relayInfo();
    if (!relay.relay_host || !relay.public_key) {
      return badRequest(
        "RustDesk Server não configurado na VPS. " +
        "Rode: sudo bash scripts/install-rustdesk-server.sh"
      );
    }

    return ok({
      relay_host:           relay.relay_host,
      public_key:           relay.public_key,
      agent:                { id: a.id, nome: a.nome, tipo: a.tipo },
      rustdesk_id:          a.rustdesk_id,
      tem_senha:            !!a.rustdesk_password,
      auto_aceite:          a.rustdesk_auto_aceite,
      registrado_em:        a.rustdesk_registrado_em,
    });
  } catch (err) {
    console.error("[Agentes/Rustdesk/GET]", err);
    return serverError();
  }
}

const postSchema = z.object({
  rustdesk_id:  z.string().min(4).max(20).optional(),
  auto_aceite:  z.boolean().optional(),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof postSchema> = {};
  try { body = postSchema.parse(await req.json().catch(() => ({}))); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const a = await queryOne<{ id: string }>(
      `SELECT id FROM agentes
        WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!a) return notFound("Agente não encontrado");

    const senhaPlain = gerarSenhaForte(16);
    const senhaCifrada = encryptField(senhaPlain);

    await queryOne(
      `UPDATE agentes
          SET rustdesk_password      = $1,
              rustdesk_id            = COALESCE($2, rustdesk_id),
              rustdesk_auto_aceite   = COALESCE($3, rustdesk_auto_aceite),
              rustdesk_registrado_em = COALESCE(rustdesk_registrado_em, NOW()),
              updated_at             = NOW()
        WHERE id = $4`,
      [senhaCifrada, body.rustdesk_id ?? null, body.auto_aceite ?? null, params.id]
    );

    const relay = relayInfo();

    return ok({
      password:    senhaPlain,        // ÚNICA vez em cleartext
      rustdesk_id: body.rustdesk_id ?? null,
      auto_aceite: body.auto_aceite ?? false,
      relay_host:  relay.relay_host,
      public_key:  relay.public_key,
      aviso:       "Anote esta senha agora — depois fica cifrada no banco.",
    });
  } catch (err) {
    console.error("[Agentes/Rustdesk/POST]", err);
    return serverError();
  }
}
