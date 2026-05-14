/**
 * POST /api/painel/ifood/testar-credenciais
 *
 * Testa apenas o OAuth do iFood (não faz polling). Retorna o erro REAL
 * do iFood se houver — útil pra diagnosticar 401, secret quebrado,
 * client_id errado, etc.
 *
 * Body: vazio (usa config salva)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, forbidden, serverError } from "@/lib/utils/response";
import { getIfoodConfig } from "@/lib/ifood/client";

const ALLOWED = ["master", "admin"];
const BASE = "https://merchant-api.ifood.com.br";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let cfg;
  try {
    cfg = await getIfoodConfig(empresaId);
  } catch (err) {
    return ok({
      ok:      false,
      etapa:   "decrypt_secret",
      mensagem: err instanceof Error ? err.message : "falha ao ler config",
    });
  }

  if (!cfg) {
    return ok({ ok: false, etapa: "config", mensagem: "Configuração iFood não encontrada — salve credenciais primeiro" });
  }

  if (!cfg.client_id || cfg.client_id.length < 8) {
    return ok({ ok: false, etapa: "config", mensagem: "client_id ausente ou inválido (< 8 chars)" });
  }
  if (!cfg.client_secret || cfg.client_secret.length < 8) {
    return ok({ ok: false, etapa: "config", mensagem: "client_secret ausente ou inválido (< 8 chars). Re-salve no /painel/ifood." });
  }

  // Faz request OAuth direto e captura erro completo
  const body = new URLSearchParams({
    grantType:    "client_credentials",
    clientId:     cfg.client_id,
    clientSecret: cfg.client_secret,
  });

  try {
    const r = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
      signal:  AbortSignal.timeout(15_000),
    });

    const txt = await r.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(txt); } catch {}

    if (!r.ok) {
      return ok({
        ok:        false,
        etapa:     "ifood_oauth",
        http:      r.status,
        mensagem:  `iFood retornou ${r.status}`,
        ifood_response: parsed ?? txt.slice(0, 500),
        diagnostico: r.status === 401
          ? "Credenciais não conferem. Verifique se: (1) o client_id/secret são do mesmo aplicativo (Centralizado pra cada loja, OU Distribuído pra SaaS multi-loja), (2) o secret foi colado completo (sem espaços/quebras), (3) o aplicativo está ativo no portal iFood."
          : r.status === 400
          ? "Body inválido — pode ser formato dos campos. Confira que os valores não têm caracteres especiais não-codificados."
          : "Erro genérico — confira o portal iFood pra status do app.",
      });
    }

    const tok = parsed as { accessToken?: string; expiresIn?: number; type?: string };
    return ok({
      ok:           true,
      etapa:        "completo",
      mensagem:     `✓ Token obtido com sucesso. Expira em ${tok.expiresIn ?? 0}s. Polling vai funcionar agora.`,
      access_token_preview: tok.accessToken?.slice(0, 20) + "...",
      expires_in:   tok.expiresIn,
    });
  } catch (err) {
    return ok({
      ok:        false,
      etapa:     "rede",
      mensagem:  err instanceof Error ? err.message : "falha de rede",
    });
  }
}
