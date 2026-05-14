/**
 * Cliente iFood — autenticação OAuth + chamadas básicas.
 *
 * Endpoints:
 *   /authentication/v1.0/oauth/token   → client_credentials
 *   /events/v1.0/events:polling         → long-poll 30s
 *   /events/v1.0/acknowledgment         → ack dos eventos lidos
 *   /order/v1.0/orders/{orderId}        → detalhes do pedido
 *
 * Token expira em 3h, mas cache no DB (ifood_config.access_token).
 * Reutiliza enquanto válido — só renova se faltar < 5min.
 */
import { queryOne } from "@/lib/db/client";
import { decrypt } from "@/lib/security/encrypt";

const BASE_PROD    = "https://merchant-api.ifood.com.br";
const BASE_SANDBOX = "https://merchant-api.ifood.com.br";   // iFood usa mesma URL pra sandbox; ambiente vem em scope

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
}

interface TokenResponse {
  accessToken: string;
  type:        string;
  expiresIn:   number;
}

/** Lê config descriptografando secrets */
export async function getIfoodConfig(empresaId: string): Promise<IfoodConfig | null> {
  const row = await queryOne<IfoodConfig>(
    `SELECT id, empresa_id, client_id, client_secret, merchant_id,
            ambiente, ativo, polling_ativo,
            access_token, token_expira_em::text AS token_expira_em
       FROM ifood_config
      WHERE empresa_id = $1`,
    [empresaId]
  );
  if (!row) return null;
  // Descriptografa secret se encrypted (formato 'encrypted:...')
  if (row.client_secret?.startsWith("encrypted:")) {
    try {
      row.client_secret = decrypt(row.client_secret.slice(10));
    } catch (err) {
      // Decrypt falhou — provavelmente ENCRYPTION_KEY mudou ou secret
      // foi salvo com chave diferente. NÃO podemos usar o blob cifrado
      // como secret (vai dar 401). Lança erro claro.
      console.error("[ifood] decrypt client_secret falhou:", err);
      throw new Error(
        "client_secret inválido (descriptografia falhou). " +
        "Re-salve as credenciais em /painel/ifood. " +
        "Causa provável: ENCRYPTION_KEY foi alterada após salvar o secret."
      );
    }
  }
  return row;
}

/** Renova token se necessário e retorna o atual válido. */
export async function getValidToken(cfg: IfoodConfig): Promise<string> {
  const expira = cfg.token_expira_em ? new Date(cfg.token_expira_em) : null;
  // 5min de margem antes da expiração
  if (cfg.access_token && expira && expira.getTime() > Date.now() + 5 * 60_000) {
    return cfg.access_token;
  }
  return await renovarToken(cfg);
}

async function renovarToken(cfg: IfoodConfig): Promise<string> {
  const base = cfg.ambiente === "sandbox" ? BASE_SANDBOX : BASE_PROD;
  const body = new URLSearchParams({
    grantType:    "client_credentials",
    clientId:     cfg.client_id,
    clientSecret: cfg.client_secret,
  });

  const r = await fetch(`${base}/authentication/v1.0/oauth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
    signal:  AbortSignal.timeout(15_000),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`iFood auth ${r.status}: ${txt.slice(0, 200)}`);
  }
  const tok = await r.json() as TokenResponse;
  const expira = new Date(Date.now() + (tok.expiresIn ?? 10800) * 1000);

  await queryOne(
    `UPDATE ifood_config
        SET access_token    = $1,
            token_expira_em = $2,
            ultimo_erro     = NULL,
            ultimo_erro_em  = NULL,
            updated_at      = NOW()
      WHERE id = $3`,
    [tok.accessToken, expira.toISOString(), cfg.id]
  );

  return tok.accessToken;
}

export interface IfoodEvent {
  id:               string;       // event ID
  code:             string;       // PLACED, CONFIRMED, CANCELLED, ...
  fullCode?:        string;
  orderId:          string;       // order ID do iFood
  createdAt:        string;
  merchantId?:      string;
  metadata?:        Record<string, unknown>;
}

/** Long-poll de eventos (timeout 30s no iFood). */
export async function pollEvents(cfg: IfoodConfig): Promise<IfoodEvent[]> {
  const token = await getValidToken(cfg);
  const base  = cfg.ambiente === "sandbox" ? BASE_SANDBOX : BASE_PROD;
  const r = await fetch(`${base}/events/v1.0/events:polling`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(35_000),
  });

  // 204 = sem eventos (esperado em long-poll)
  if (r.status === 204) return [];
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`iFood polling ${r.status}: ${txt.slice(0, 200)}`);
  }
  const events = await r.json() as IfoodEvent[];
  return Array.isArray(events) ? events : [];
}

/** Ack obrigatório — iFood reenvia eventos não confirmados em 1 min. */
export async function ackEvents(cfg: IfoodConfig, eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const token = await getValidToken(cfg);
  const base  = cfg.ambiente === "sandbox" ? BASE_SANDBOX : BASE_PROD;
  await fetch(`${base}/events/v1.0/events/acknowledgment`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body:    JSON.stringify(eventIds.map(id => ({ id }))),
    signal:  AbortSignal.timeout(15_000),
  }).catch(() => {});
}

/** Detalhes do pedido (chamado no evento PLACED). */
export interface IfoodOrderDetail {
  id:                string;
  displayId:         string;
  customer?:         { name?: string; phone?: string };
  items?:            Array<{ name: string; quantity: number; unitPrice: { value: number } }>;
  total?:            { orderAmount?: { value: number } };
  delivery?:         { mode?: string; deliveredBy?: string };
  takeout?:          { mode?: string };
  // ... muitos campos; capturamos os essenciais
  [key: string]:     unknown;
}

export async function getOrderDetail(cfg: IfoodConfig, orderId: string): Promise<IfoodOrderDetail | null> {
  const token = await getValidToken(cfg);
  const base  = cfg.ambiente === "sandbox" ? BASE_SANDBOX : BASE_PROD;
  const r = await fetch(`${base}/order/v1.0/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!r.ok) return null;
  return await r.json() as IfoodOrderDetail;
}

/** Confirma pedido no iFood (ESTÁGIO obrigatório após PLACED). */
export async function confirmOrder(cfg: IfoodConfig, orderId: string): Promise<boolean> {
  const token = await getValidToken(cfg);
  const base  = cfg.ambiente === "sandbox" ? BASE_SANDBOX : BASE_PROD;
  const r = await fetch(`${base}/order/v1.0/orders/${orderId}/confirm`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(15_000),
  });
  return r.ok;
}
