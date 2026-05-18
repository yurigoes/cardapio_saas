/**
 * Idempotency keys — proteção contra duplicação de POST.
 *
 * Cliente (totem, retaguarda worker) envia header `Idempotency-Key: {uuid}`.
 * Backend processa só uma vez por key e, em chamadas repetidas, devolve
 * a mesma resposta cacheada por 24h.
 *
 * Quando usar:
 *  - POST /api/pub/pedidos        — pra retry seguro do worker offline
 *  - POST /api/pub/cliente        — cadastro de cliente
 *  - POST /api/pub/cliente/.../resgatar
 *  - POST /api/pub/cliente/.../trocar-pontos
 *
 * Padrão:
 *   const idem = await idempotencyEnter(req, "pedido");
 *   if (idem.cached) return idem.cached;  // retorna resposta anterior
 *   // ... processa pedido ...
 *   await idem.save(responseBody, 200);
 *   return ok(responseBody);
 */
import { NextRequest, NextResponse } from "next/server";
import { redisGet, redisSet } from "@/lib/db/redis";

const TTL_SEC = 24 * 60 * 60; // 24 horas

interface IdempotencySaved {
  status: number;
  body:   unknown;
  at:     string;
}

export interface IdempotencyGuard {
  /** Key extraída do header (ou null se cliente não mandou) */
  key: string | null;
  /** Resposta cacheada se já processada antes; senão null */
  cached: NextResponse | null;
  /** Grava a resposta no cache pra próximas tentativas. */
  save: (body: unknown, status?: number) => Promise<void>;
}

/**
 * Lê o header Idempotency-Key. Se já existe resposta cacheada, retorna.
 * Caso contrário devolve um guard com `.save(body)` pra gravar ao final.
 *
 * @param namespace — sufixo da chave Redis (ex: "pedido", "cliente"). Evita
 *                    colisão se 2 endpoints diferentes receberem a mesma key.
 */
export async function idempotencyEnter(
  req: NextRequest,
  namespace: string,
): Promise<IdempotencyGuard> {
  const key = req.headers.get("idempotency-key");
  if (!key) {
    // Cliente não usa idempotency — segue normal, sem cache
    return {
      key:    null,
      cached: null,
      save:   async () => {},
    };
  }

  const cacheKey = `idem:${namespace}:${key}`;
  const prev = await redisGet<IdempotencySaved>(cacheKey).catch(() => null);
  if (prev) {
    return {
      key,
      cached: NextResponse.json(prev.body, { status: prev.status }),
      save:   async () => {}, // já tem, não sobrescreve
    };
  }

  return {
    key,
    cached: null,
    save: async (body: unknown, status = 200) => {
      await redisSet(cacheKey, { status, body, at: new Date().toISOString() }, TTL_SEC);
    },
  };
}
