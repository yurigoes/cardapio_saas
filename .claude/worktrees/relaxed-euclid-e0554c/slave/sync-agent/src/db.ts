/**
 * db.ts — Pool PostgreSQL local e funções de query
 *
 * Aponta para o PostgreSQL LOCAL do slave (não para a VPS).
 * O schema local é um subset do schema principal, contendo apenas
 * dados da empresa instalada neste slave.
 */

import { Pool, PoolClient } from "pg";
import { config } from "./config";
import { logger } from "./logger";

const pool = new Pool({
  host:                    config.db.host,
  port:                    config.db.port,
  database:                config.db.database,
  user:                    config.db.user,
  password:                config.db.password,
  max:                     10,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  logger.error("Erro inesperado no pool PostgreSQL local", { error: err.message });
});

// ─────────────────────────────────────────────────────────────────────────────
// Funções de query
// ─────────────────────────────────────────────────────────────────────────────

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  const res   = await pool.query(text, params);
  const ms    = Date.now() - start;

  if (ms > 1000) {
    logger.warn("Query lenta no DB local", { ms, query: text.slice(0, 100) });
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

// ─────────────────────────────────────────────────────────────────────────────
// Schema local do slave
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria as tabelas locais necessárias para o slave funcionar offline.
 *
 * O schema local é um subset do schema principal:
 * - empresa (singular — apenas os dados desta empresa)
 * - categorias, produtos, mesas, usuarios
 * - pedidos + pedido_itens (criados offline)
 * - sync_queue (fila de operações pendentes para push)
 */
export async function ensureSchema(): Promise<void> {
  logger.info("Verificando schema local do banco de dados...");

  await query(`
    CREATE TABLE IF NOT EXISTS empresa (
      id              UUID         NOT NULL PRIMARY KEY,
      slug            VARCHAR(100) NOT NULL,
      nome_fantasia   VARCHAR(255) NOT NULL,
      cor_primaria    VARCHAR(7)   NOT NULL DEFAULT '#10B981',
      cor_secundaria  VARCHAR(7)   NOT NULL DEFAULT '#0F172A',
      whatsapp        VARCHAR(20),
      modulos_ativos  TEXT[]       NOT NULL DEFAULT '{}',
      updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS categorias (
      id          UUID         NOT NULL PRIMARY KEY,
      nome        VARCHAR(255) NOT NULL,
      descricao   TEXT,
      ordem       INT          NOT NULL DEFAULT 0,
      ativo       BOOLEAN      NOT NULL DEFAULT true,
      imagem_url  TEXT,
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS produtos (
      id               UUID          NOT NULL PRIMARY KEY,
      categoria_id     UUID,
      nome             VARCHAR(255)  NOT NULL,
      descricao        TEXT,
      preco            NUMERIC(10,2) NOT NULL,
      preco_promocional NUMERIC(10,2),
      disponivel       BOOLEAN       NOT NULL DEFAULT true,
      imagem_url       TEXT,
      tempo_preparo    INT,
      ordem            INT           NOT NULL DEFAULT 0,
      destaque         BOOLEAN       NOT NULL DEFAULT false,
      updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS mesas (
      id              UUID         NOT NULL PRIMARY KEY,
      numero          INT          NOT NULL,
      capacidade      INT,
      status          VARCHAR(20)  NOT NULL DEFAULT 'livre',
      localizacao     VARCHAR(100),
      pedido_ativo_id UUID,
      updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id          UUID         NOT NULL PRIMARY KEY,
      nome        VARCHAR(255) NOT NULL,
      email       VARCHAR(255) NOT NULL,
      role        VARCHAR(50)  NOT NULL,
      ativo       BOOLEAN      NOT NULL DEFAULT true,
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id                 UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      tipo               VARCHAR(20)    NOT NULL DEFAULT 'balcao',
      status             VARCHAR(20)    NOT NULL DEFAULT 'pendente',
      mesa_id            UUID,
      cliente_nome       VARCHAR(255),
      cliente_telefone   VARCHAR(20),
      subtotal           NUMERIC(10,2)  NOT NULL,
      total              NUMERIC(10,2)  NOT NULL,
      observacoes        TEXT,
      origem             VARCHAR(10)    NOT NULL DEFAULT 'slave',
      slave_uuid         VARCHAR(36)    UNIQUE,
      slave_synced_at    TIMESTAMPTZ,
      created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS pedido_itens (
      id              UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      pedido_id       UUID           NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      produto_id      UUID,
      nome            VARCHAR(255)   NOT NULL,
      preco_unitario  NUMERIC(10,2)  NOT NULL,
      quantidade      INT            NOT NULL,
      subtotal        NUMERIC(10,2)  NOT NULL,
      observacoes     TEXT
    )
  `);

  // Fila de sincronização para operações offline
  await query(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id             SERIAL       PRIMARY KEY,
      tipo           VARCHAR(20)  NOT NULL,   -- 'pedido', 'mesa_evento'
      payload        JSONB        NOT NULL,
      tentativas     INT          NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      processado_at  TIMESTAMPTZ
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_pendente ON sync_queue (id) WHERE processado_at IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pedidos_nao_sync ON pedidos (id) WHERE slave_synced_at IS NULL AND origem = 'slave'`);

  logger.info("Schema local verificado com sucesso");
}

export { pool };
