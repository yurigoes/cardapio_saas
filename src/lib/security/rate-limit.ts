import { redis } from "@/lib/db/redis";
import { NextRequest } from "next/server";

export interface RateLimitConfig {
  windowMs:    number;  // janela em ms
  max:         number;  // máximo de requests
  keyPrefix?:  string;
}

export interface RateLimitResult {
  success:   boolean;
  remaining: number;
  resetAt:   number;   // timestamp ms
  total:     number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs:  parseInt(process.env.RATE_LIMIT_WINDOW_MS   || "60000"),
  max:       parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  keyPrefix: "rl",
};

export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs:  60_000,
  max:       parseInt(process.env.RATE_LIMIT_AUTH_MAX || "10"),
  keyPrefix: "rl:auth",
};

export const API_RATE_LIMIT: RateLimitConfig = {
  windowMs:  60_000,
  max:       200,
  keyPrefix: "rl:api",
};

export const WEBHOOK_RATE_LIMIT: RateLimitConfig = {
  windowMs:  60_000,
  max:       500,
  keyPrefix: "rl:webhook",
};

// Pedidos públicos (cardápio): anti-DoS — alguém spammando POST
export const PUB_PEDIDO_RATE_LIMIT: RateLimitConfig = {
  windowMs:  60_000,
  max:       parseInt(process.env.RATE_LIMIT_PUB_PEDIDO || "20"),
  keyPrefix: "rl:pub-pedido",
};

// Recuperação de senha: anti-spam de envio de SMS/email
export const RECUPERAR_RATE_LIMIT: RateLimitConfig = {
  windowMs:  300_000,    // 5 min
  max:       parseInt(process.env.RATE_LIMIT_RECUPERAR || "5"),
  keyPrefix: "rl:recuperar",
};

// 2FA setup: tentativa de força bruta no código
export const SENSIBLE_RATE_LIMIT: RateLimitConfig = {
  windowMs:  60_000,
  max:       parseInt(process.env.RATE_LIMIT_SENSIBLE || "10"),
  keyPrefix: "rl:sensible",
};

// Heartbeat da retaguarda: reporter envia 1/min, então 5/min é folgado.
// Se vazar secret e atacar, ainda assim trava o flood na tabela.
export const RETAGUARDA_HEARTBEAT_RATE_LIMIT: RateLimitConfig = {
  windowMs:  60_000,
  max:       parseInt(process.env.RATE_LIMIT_HEARTBEAT || "5"),
  keyPrefix: "rl:hb",
};

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(config.windowMs / 1000);
  const key = `${config.keyPrefix}:${identifier}`;

  try {
    const now    = Date.now();
    const window = Math.floor(now / config.windowMs);
    const windowKey = `${key}:${window}`;

    const count = await redis
      .multi()
      .incr(windowKey)
      .expire(windowKey, windowSeconds + 1)
      .exec();

    const current = (count?.[0]?.[1] as number) || 1;
    const remaining = Math.max(0, config.max - current);
    const resetAt = (window + 1) * config.windowMs;

    return {
      success:   current <= config.max,
      remaining,
      resetAt,
      total:     config.max,
    };
  } catch {
    // Se Redis falhar, permite o request (fail-open)
    return { success: true, remaining: 1, resetAt: Date.now() + config.windowMs, total: config.max };
  }
}

export async function checkRateLimitByRequest(
  req: NextRequest,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  return checkRateLimit(ip, config);
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit":     String(result.total),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset":     String(Math.ceil(result.resetAt / 1000)),
    "Retry-After":           result.success ? "0" : String(
      Math.ceil((result.resetAt - Date.now()) / 1000)
    ),
  };
}
