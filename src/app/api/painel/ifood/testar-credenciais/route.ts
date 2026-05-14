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

  // Tenta 2 formatos: camelCase (docs iFood atuais) e snake_case (algumas
  // versões antigas/distribuídas). Reporta o erro do iFood literalmente.
  const tentativas: { formato: string; body: URLSearchParams }[] = [
    {
      formato: "camelCase",
      body: new URLSearchParams({
        grantType:    "client_credentials",
        clientId:     cfg.client_id,
        clientSecret: cfg.client_secret,
      }),
    },
    {
      formato: "snake_case",
      body: new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     cfg.client_id,
        client_secret: cfg.client_secret,
      }),
    },
  ];

  const resultados: Array<{ formato: string; http: number; body: unknown }> = [];

  for (const t of tentativas) {
    try {
      const r = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    t.body.toString(),
        signal:  AbortSignal.timeout(15_000),
      });

      const txt = await r.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(txt); } catch {}

      resultados.push({ formato: t.formato, http: r.status, body: parsed ?? txt.slice(0, 500) });

      if (r.ok) {
        const tok = parsed as { accessToken?: string; expiresIn?: number };
        return ok({
          ok:                  true,
          etapa:               "completo",
          formato_usado:       t.formato,
          mensagem:            `✓ Token obtido com formato "${t.formato}". Expira em ${tok.expiresIn ?? 0}s. Polling vai funcionar agora.`,
          access_token_preview: tok.accessToken?.slice(0, 20) + "...",
          expires_in:          tok.expiresIn,
        });
      }
    } catch (err) {
      resultados.push({ formato: t.formato, http: 0, body: { error: (err as Error).message } });
    }
  }

  // Ambos formatos falharam — reporta erro detalhado
  const ultimo = resultados[resultados.length - 1];
  return ok({
    ok:        false,
    etapa:     "ifood_oauth",
    http:      ultimo.http,
    mensagem:  `iFood retornou ${ultimo.http} em ambos formatos (camelCase e snake_case)`,
    ifood_response: ultimo.body,
    tentativas: resultados,
    client_id_enviado: cfg.client_id,
    secret_chars:      cfg.client_secret.length,
    secret_preview:    cfg.client_secret.slice(0, 4) + "..." + cfg.client_secret.slice(-4),
    diagnostico: ultimo.http === 401
      ? "iFood rejeitou as credenciais. Causas comuns:\n" +
        "1. App tipo errado: Centralizado precisa estar VINCULADO ao merchant — entre no portal, app → 'Permissões' → confirme merchant ID associado\n" +
        "2. Secret vencido/regenerado: vá no iFood developer, REGENERE o secret e cole o NOVO aqui (o antigo invalida)\n" +
        "3. App não ativado: 'Aplicativo de teste' precisa estar ATIVO — confira em 'Detalhes' do app no portal\n" +
        "4. Tipo errado pra essa flow: nosso código usa client_credentials (Centralizado). Pra Distribuído precisa de userCode flow (não suportado ainda)"
      : ultimo.http === 400
      ? "Body inválido — pode ser caractere especial no secret. Tente regenerar."
      : "Erro genérico — confira o portal iFood pra status do app.",
  });
}
