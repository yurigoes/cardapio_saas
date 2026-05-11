import { Pool, PoolClient } from "pg";

const pool = new Pool({
  host:               process.env.DB_HOST     || "localhost",
  port:               parseInt(process.env.DB_PORT || "5432"),
  database:           process.env.DB_NAME     || "cardapio_saas",
  user:               process.env.DB_USER     || "cardapio",
  password:           process.env.DB_PASSWORD,
  max:                parseInt(process.env.DB_POOL_MAX || "20"),
  idleTimeoutMillis:  30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[DB] Erro inesperado no pool:", err.message);
});

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  if (duration > 2000) {
    console.warn(`[DB] Query lenta (${duration}ms): ${text.slice(0, 120)}`);
  }

  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function queryCount(text: string, params?: unknown[]): Promise<number> {
  const rows = await query<{ count: string }>(text, params);
  return parseInt(rows[0]?.count ?? "0", 10);
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export { pool };
