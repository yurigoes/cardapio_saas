/**
 * GET /api/retaguarda/install-config?token=xxx
 *
 * Endpoint consumido pelo install.sh no mini-PC durante setup automatizado.
 * Resolve o token e devolve config (slug, subdomain, base_domain,
 * heartbeat_secret, master_url). Marca o token como consumido na primeira
 * chamada bem-sucedida — uso único.
 *
 * Continua precisando de CF API Token (esse não armazenamos em texto plano).
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";
import { getClientIp } from "@/lib/auth/middleware";
import { decrypt } from "@/lib/security/encrypt";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ ok: false, error: "token obrigatório" }, { status: 400 });

  const secret = process.env.RETAGUARDA_HEARTBEAT_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "RETAGUARDA_HEARTBEAT_SECRET não configurado" }, { status: 503 });
  }

  try {
    const row = await queryOne<{
      empresa_slug: string;
      subdomain: string;
      base_domain: string;
      expires_at: string;
      consumed_at: string | null;
    }>(
      `SELECT empresa_slug, subdomain, base_domain, expires_at, consumed_at
         FROM retaguardas_install_tokens
        WHERE token = $1`,
      [token]
    );

    if (!row) return NextResponse.json({ ok: false, error: "token inválido" }, { status: 404 });
    if (row.consumed_at) {
      return NextResponse.json({ ok: false, error: "token já foi consumido" }, { status: 410 });
    }
    if (new Date(row.expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: "token expirado" }, { status: 410 });
    }

    // Marca como consumido
    const ip = getClientIp(req);
    await queryOne(
      `UPDATE retaguardas_install_tokens
          SET consumed_at = NOW(), consumed_ip = $1
        WHERE token = $2`,
      [ip === "unknown" ? null : ip, token]
    );

    const masterUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";

    // Se master tem CF config salva, repassa pra install.sh pular prompts
    const cf = await queryOne<{ api_token: string; account_id: string; zone_id: string }>(
      `SELECT api_token, account_id, zone_id
         FROM master_cloudflare_config
        WHERE id = 1 AND ativo = TRUE
          AND api_token IS NOT NULL
          AND account_id IS NOT NULL
          AND zone_id IS NOT NULL`
    ).catch(() => null);

    let cfApiToken: string | null = null;
    if (cf?.api_token) {
      try {
        cfApiToken = cf.api_token.startsWith("encrypted:")
          ? decrypt(cf.api_token.slice("encrypted:".length))
          : cf.api_token;
      } catch (e) {
        console.warn("[install-config] falha ao decifrar CF token:", (e as Error).message);
      }
    }

    return NextResponse.json({
      ok: true,
      empresa_slug:     row.empresa_slug,
      subdomain:        row.subdomain,
      base_domain:      row.base_domain,
      retaguarda_domain: `${row.subdomain}.${row.base_domain}`,
      master_url:       masterUrl,
      heartbeat_secret: secret,  // só vai pra quem tem token válido + IP logado
      // CF creds — null se master não tem config. install.sh detecta e pula prompts.
      cf_api_token:  cfApiToken,
      cf_account_id: cf?.account_id ?? null,
      cf_zone_id:    cf?.zone_id ?? null,
    });
  } catch (err) {
    console.error("[retaguarda/install-config]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
