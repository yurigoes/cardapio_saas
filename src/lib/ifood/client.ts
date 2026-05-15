/**
 * Cliente iFood — autenticação OAuth + chamadas básicas.
 *
 * Suporta os 2 tipos de app:
 *   - CENTRALIZADO: 1 app por loja, fluxo client_credentials (cada empresa
 *     cliente cria sua própria app no portal iFood)
 *   - DISTRIBUÍDO: 1 app do master serve TODAS empresas, fluxo userCode +
 *     authorization_code → refresh_token (escalável SaaS)
 */
import { queryOne } from "@/lib/db/client";
import { encrypt, decrypt, decryptIfNeeded } from "@/lib/security/encrypt";

const BASE = "https://merchant-api.ifood.com.br";

export interface IfoodConfig {
  id:              string;
  empresa_id:      string;
  client_id:       string;
  client_secret:   string;
  merchant_id:     string | null;
  ambiente:        "sandbox" | "producao";
  ativo:           boolean;
  polling_ativo:   boolean;
  access_token:    string | null;
  token_expira_em: string | null;
  mode:            "centralizado" | "distribuido";
  refresh_token:   string | null;
  authorized_em:   string | null;
  authorization_code_verifier: string | null;
}

export interface MasterIfoodConfig {
  client_id:     string;
  client_secret: string;
  app_nome:      string | null;
  ativo:         boolean;
}

interface TokenResponse {
  accessToken:   string;
  refreshToken?: string;
  type:          string;
  expiresIn:     number;
}

// ─── Helpers de criptografia ─────────────────────────────────────────────────

function decryptField(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("encrypted:")) {
    try { return decrypt(value.slice(10)); }
    catch (err) {
      console.error("[ifood] decrypt falhou:", err);
      return null;
    }
  }
  return decryptIfNeeded(value) ?? value;
}

export function encryptField(plain: string): string {
  return `encrypted:${encrypt(plain)}`;
}

// ─── Master config (singleton) ───────────────────────────────────────────────

export async function getMasterIfoodConfig(): Promise<MasterIfoodConfig | null> {
  // Wrapped em catch — tabela pode não existir (migration 053 pendente)
  const row = await queryOne<{
    client_id: string | null; client_secret: string | null;
    app_nome: string | null; ativo: boolean;
  }>(`SELECT client_id, client_secret, app_nome, ativo FROM saas_ifood_config WHERE id = 1`)
    .catch((err) => {
      console.warn("[ifood/master] saas_ifood_config indisponível:", err instanceof Error ? err.message : err);
      return null;
    });

  if (!row || !row.ativo || !row.client_id || !row.client_secret) return null;

  const cid = decryptField(row.client_id);
  const sec = decryptField(row.client_secret);
  if (!cid || !sec) return null;

  return { client_id: cid, client_secret: sec, app_nome: row.app_nome, ativo: row.ativo };
}

// ─── Empresa config ──────────────────────────────────────────────────────────

export async function getIfoodConfig(empresaId: string): Promise<IfoodConfig | null> {
  const row = await queryOne<IfoodConfig>(
    `SELECT id, empresa_id, client_id, client_secret, merchant_id,
            ambiente, ativo, polling_ativo,
            access_token, token_expira_em::text AS token_expira_em,
            mode, refresh_token, authorized_em::text AS authorized_em,
            authorization_code_verifier
       FROM ifood_config
      WHERE empresa_id = $1`,
    [empresaId]
  );
  if (!row) return null;

  // Descriptografa secret e refresh_token
  if (row.client_secret) {
    const dec = decryptField(row.client_secret);
    if (!dec && row.mode === "centralizado") {
      throw new Error(
        "client_secret inválido (descriptografia falhou). " +
        "Re-salve as credenciais em /painel/ifood. " +
        "Causa provável: ENCRYPTION_KEY foi alterada após salvar o secret."
      );
    }
    row.client_secret = dec ?? row.client_secret;
  }
  if (row.refresh_token) {
    const dec = decryptField(row.refresh_token);
    if (dec) row.refresh_token = dec;
  }

  return row;
}

// ─── Token: renova ou retorna válido ─────────────────────────────────────────

export async function getValidToken(cfg: IfoodConfig): Promise<string> {
  const expira = cfg.token_expira_em ? new Date(cfg.token_expira_em) : null;
  if (cfg.access_token && expira && expira.getTime() > Date.now() + 5 * 60_000) {
    return cfg.access_token;
  }
  return await renovarToken(cfg);
}

async function renovarToken(cfg: IfoodConfig): Promise<string> {
  if (cfg.mode === "distribuido") {
    if (!cfg.refresh_token) {
      throw new Error("Empresa não autorizou app distribuído ainda. Acesse /painel/ifood e clique em 'Conectar com iFood'.");
    }
    const master = await getMasterIfoodConfig();
    if (!master) {
      throw new Error("Master não configurou app iFood Distribuído. Avise o admin pra configurar em /admin/ifood.");
    }
    return await refreshAccessToken(master.client_id, master.client_secret, cfg.refresh_token, cfg.id);
  }

  return await clientCredentialsToken(cfg);
}

async function clientCredentialsToken(cfg: IfoodConfig): Promise<string> {
  const body = new URLSearchParams({
    grantType:    "client_credentials",
    clientId:     cfg.client_id,
    clientSecret: cfg.client_secret,
  });

  const r = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "accept":       "application/json",
    },
    body:    body.toString(),
    signal:  AbortSignal.timeout(15_000),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`iFood auth ${r.status}: ${txt.slice(0, 200)}`);
  }
  const tok = await r.json() as TokenResponse;
  await persistirToken(cfg.id, tok, null);
  return tok.accessToken;
}

async function refreshAccessToken(
  masterClientId: string,
  masterClientSecret: string,
  refreshToken: string,
  cfgId: string,
): Promise<string> {
  const body = new URLSearchParams({
    grantType:    "refresh_token",
    clientId:     masterClientId,
    clientSecret: masterClientSecret,
    refreshToken: refreshToken,
  });

  const r = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "accept":       "application/json",
    },
    body:    body.toString(),
    signal:  AbortSignal.timeout(15_000),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`iFood refresh ${r.status}: ${txt.slice(0, 200)}`);
  }
  const tok = await r.json() as TokenResponse;
  await persistirToken(cfgId, tok, tok.refreshToken ?? refreshToken);
  return tok.accessToken;
}

async function persistirToken(
  cfgId: string, tok: TokenResponse, novoRefreshToken: string | null
): Promise<void> {
  const expira = new Date(Date.now() + (tok.expiresIn ?? 10800) * 1000);
  await queryOne(
    `UPDATE ifood_config
        SET access_token    = $1,
            token_expira_em = $2,
            refresh_token   = COALESCE($3, refresh_token),
            ultimo_erro     = NULL,
            ultimo_erro_em  = NULL,
            updated_at      = NOW()
      WHERE id = $4`,
    [
      tok.accessToken,
      expira.toISOString(),
      novoRefreshToken ? encryptField(novoRefreshToken) : null,
      cfgId,
    ]
  );
}

// ─── Distribuído: userCode flow (helpers chamados pelos endpoints) ──────────

export interface UserCodeResponse {
  userCode:                  string;
  authorizationCodeVerifier: string;
  verificationUrl:           string;
  verificationUrlComplete:   string;
  expiresIn:                 number;
}

export async function requestUserCode(masterClientId: string): Promise<UserCodeResponse> {
  const body = new URLSearchParams({ clientId: masterClientId });

  const r = await fetch(`${BASE}/authentication/v1.0/oauth/userCode`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "accept":       "application/json",
    },
    body:    body.toString(),
    signal:  AbortSignal.timeout(15_000),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`iFood userCode ${r.status}: ${txt.slice(0, 200)}`);
  }
  return await r.json() as UserCodeResponse;
}

export async function exchangeAuthorizationCode(
  masterClientId: string,
  masterClientSecret: string,
  authorizationCode: string,
  authorizationCodeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grantType:                 "authorization_code",
    clientId:                  masterClientId,
    clientSecret:              masterClientSecret,
    authorizationCode:         authorizationCode,
    authorizationCodeVerifier: authorizationCodeVerifier,
  });

  const r = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "accept":       "application/json",
    },
    body:    body.toString(),
    signal:  AbortSignal.timeout(15_000),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`iFood exchange ${r.status}: ${txt.slice(0, 300)}`);
  }
  return await r.json() as TokenResponse;
}

// ─── Polling + ack + getOrderDetail ──────────────────────────────────────────

export interface IfoodEvent {
  id:               string;
  code:             string;
  fullCode?:        string;
  orderId:          string;
  createdAt:        string;
  merchantId?:      string;
  metadata?:        Record<string, unknown>;
}

export async function pollEvents(cfg: IfoodConfig): Promise<IfoodEvent[]> {
  const token = await getValidToken(cfg);
  const r = await fetch(`${BASE}/events/v1.0/events:polling`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(35_000),
  });

  if (r.status === 204) return [];
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`iFood polling ${r.status}: ${txt.slice(0, 200)}`);
  }
  const events = await r.json() as IfoodEvent[];
  return Array.isArray(events) ? events : [];
}

export async function ackEvents(cfg: IfoodConfig, eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const token = await getValidToken(cfg);
  await fetch(`${BASE}/events/v1.0/events/acknowledgment`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body:    JSON.stringify(eventIds.map(id => ({ id }))),
    signal:  AbortSignal.timeout(15_000),
  }).catch(() => {});
}

export interface IfoodOrderDetail {
  id:                string;
  displayId:         string;
  customer?:         { name?: string; phone?: string };
  items?:            Array<{ name: string; quantity: number; unitPrice: { value: number } }>;
  total?:            { orderAmount?: { value: number } };
  delivery?:         { mode?: string; deliveredBy?: string };
  takeout?:          { mode?: string };
  [key: string]:     unknown;
}

export async function getOrderDetail(cfg: IfoodConfig, orderId: string): Promise<IfoodOrderDetail | null> {
  const token = await getValidToken(cfg);
  const r = await fetch(`${BASE}/order/v1.0/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!r.ok) return null;
  return await r.json() as IfoodOrderDetail;
}

export async function confirmOrder(cfg: IfoodConfig, orderId: string): Promise<boolean> {
  const token = await getValidToken(cfg);
  const r = await fetch(`${BASE}/order/v1.0/orders/${orderId}/confirm`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(15_000),
  });
  return r.ok;
}

/**
 * Cancela pedido no iFood. Códigos comuns:
 *   501 - "ITEM_UNAVAILABLE"        (item indisponível)
 *   801 - "PROBLEM_AT_RESTAURANT"   (problema no restaurante)
 *   902 - "INVALID_ADDRESS"         (endereço inválido)
 *   908 - "OUT_OF_DELIVERY_AREA"    (fora da área)
 */
export async function cancelOrder(
  cfg: IfoodConfig,
  orderId: string,
  reason: string,
  cancellationCode = "801",
): Promise<boolean> {
  const token = await getValidToken(cfg);
  const r = await fetch(`${BASE}/order/v1.0/orders/${orderId}/requestCancellation`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason, cancellationCode }),
    signal:  AbortSignal.timeout(15_000),
  });
  return r.ok;
}
