import { queryOne } from "@/lib/db/client";
import { decrypt } from "@/lib/security/encrypt";
import { GatewayConfig, GatewaySlug, IGateway } from "./types";
import { PixGateway } from "./pix";
import { StoneGateway } from "./stone";
import { MercadoPagoGateway } from "./mercadopago";
import { PagarmeGateway } from "./pagarme";

// ─────────────────────────────────────────────
// Registry de gateways disponíveis
// ─────────────────────────────────────────────

type GatewayFactory = (config: GatewayConfig) => IGateway;

const GATEWAY_FACTORIES: Partial<Record<GatewaySlug, GatewayFactory>> = {
  pix_bancario: (config) => new PixGateway(config),
  stone:        (config) => new StoneGateway(config),
  mercadopago:  (config) => new MercadoPagoGateway(config),
  pagarme:      (config) => new PagarmeGateway(config),
  // Novos gateways são adicionados aqui
};

interface DbGatewayConfig {
  id:             string;
  nome:           string;
  slug:           string;
  client_id:      string | null;
  client_secret:  string | null;
  api_key:        string | null;
  merchant_id:    string | null;
  terminal_id:    string | null;
  token:          string | null;
  webhook_url:    string | null;
  webhook_secret: string | null;
  ambiente:       string;
  configuracoes:  Record<string, unknown>;
  padrao:         boolean;
}

export async function getGateway(
  empresaId: string,
  gatewaySlug?: GatewaySlug
): Promise<IGateway> {
  const query = gatewaySlug
    ? `SELECT * FROM gateways_config WHERE empresa_id = $1 AND slug = $2 AND ativo = TRUE AND deleted_at IS NULL`
    : `SELECT * FROM gateways_config WHERE empresa_id = $1 AND ativo = TRUE AND padrao = TRUE AND deleted_at IS NULL`;

  const params = gatewaySlug ? [empresaId, gatewaySlug] : [empresaId];

  const dbConfig = await queryOne<DbGatewayConfig>(query, params);

  if (!dbConfig) {
    throw new Error(
      gatewaySlug
        ? `Gateway '${gatewaySlug}' não encontrado ou inativo`
        : "Nenhum gateway padrão configurado"
    );
  }

  // Descriptografa campos sensíveis
  const config: GatewayConfig = {
    nome:           dbConfig.nome,
    slug:           dbConfig.slug as GatewaySlug,
    client_id:      dbConfig.client_id    ? decrypt(dbConfig.client_id)    : undefined,
    client_secret:  dbConfig.client_secret ? decrypt(dbConfig.client_secret) : undefined,
    api_key:        dbConfig.api_key      ? decrypt(dbConfig.api_key)      : undefined,
    merchant_id:    dbConfig.merchant_id  ?? undefined,
    terminal_id:    dbConfig.terminal_id  ?? undefined,
    token:          dbConfig.token        ? decrypt(dbConfig.token)        : undefined,
    webhook_url:    dbConfig.webhook_url  ?? undefined,
    webhook_secret: dbConfig.webhook_secret ? decrypt(dbConfig.webhook_secret) : undefined,
    ambiente:       dbConfig.ambiente as "sandbox" | "producao",
    configuracoes:  dbConfig.configuracoes ?? {},
  };

  const factory = GATEWAY_FACTORIES[config.slug];

  if (!factory) {
    throw new Error(`Gateway '${config.slug}' não possui implementação registrada`);
  }

  return factory(config);
}

export function isGatewaySupported(slug: string): boolean {
  return slug in GATEWAY_FACTORIES;
}

export const GATEWAYS_INFO: Array<{
  slug:      GatewaySlug;
  nome:      string;
  descricao: string;
  logo?:     string;
}> = [
  { slug: "stone",        nome: "Stone",         descricao: "Adquirente Stone"                 },
  { slug: "cielo",        nome: "Cielo",         descricao: "Adquirente Cielo"                 },
  { slug: "rede",         nome: "Rede",          descricao: "Adquirente Rede (Itaú)"           },
  { slug: "getnet",       nome: "Getnet",        descricao: "Adquirente Getnet (Santander)"    },
  { slug: "pagseguro",    nome: "PagSeguro",     descricao: "PagSeguro (UOL)"                  },
  { slug: "mercadopago",  nome: "Mercado Pago",  descricao: "Mercado Pago"                     },
  { slug: "pagarme",      nome: "Pagar.me",      descricao: "Pagar.me (Stone)"                 },
  { slug: "asaas",        nome: "Asaas",         descricao: "Asaas Cobrança"                   },
  { slug: "stripe",       nome: "Stripe",        descricao: "Stripe International"             },
  { slug: "sumup",        nome: "SumUp",         descricao: "SumUp"                            },
  { slug: "safrapay",     nome: "SafraPay",      descricao: "SafraPay (Banco Safra)"           },
  { slug: "infinitepay",  nome: "InfinitePay",   descricao: "InfinitePay"                      },
  { slug: "bin",          nome: "Bin",           descricao: "Bin (First Data)"                 },
  { slug: "sicredi",      nome: "Sicredi",       descricao: "Sicredi PIX e TEF"               },
  { slug: "sicoob",       nome: "Sicoob",        descricao: "Sicoob PIX e TEF"               },
  { slug: "pix_bancario", nome: "PIX Bancário",  descricao: "PIX via chave ou QR Code"        },
  { slug: "tef",          nome: "TEF",           descricao: "TEF via Sitef/Pinpad"             },
];
