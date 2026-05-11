import Redis from "ioredis";

let redisInstance: Redis | null = null;

function getRedis(): Redis {
  if (!redisInstance) {
    const isBuild = process.env.NEXT_PHASE === "phase-production-build";

    redisInstance = new Redis({
      host:     process.env.REDIS_HOST     || "localhost",
      port:     parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      db:       parseInt(process.env.REDIS_DB   || "0"),
      maxRetriesPerRequest: isBuild ? 0 : 3,
      lazyConnect:          true,
      enableReadyCheck:     !isBuild,
      enableOfflineQueue:   false,
      retryStrategy(times) {
        if (isBuild)    return null;  // não tenta reconectar durante build
        if (times > 5)  return null;  // desiste após 5 tentativas
        return Math.min(times * 500, 3000);
      },
      reconnectOnError: (err) => {
        return err.message.includes("READONLY");
      },
    });

    redisInstance.on("error", (err) => {
      console.error("[Redis] Erro de conexão:", err.message);
    });
  }

  return redisInstance;
}

export const redis = getRedis();

export async function redisGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const val = await redis.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

export async function redisSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.set(key, serialized, "EX", ttlSeconds);
    } else {
      await redis.set(key, serialized);
    }
  } catch (err) {
    console.error("[Redis] Erro ao gravar:", err);
  }
}

export async function redisDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    console.error("[Redis] Erro ao deletar:", err);
  }
}

export async function redisIncr(key: string, ttlSeconds?: number): Promise<number> {
  try {
    const value = await redis.incr(key);
    if (ttlSeconds && value === 1) {
      await redis.expire(key, ttlSeconds);
    }
    return value;
  } catch {
    return 0;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
