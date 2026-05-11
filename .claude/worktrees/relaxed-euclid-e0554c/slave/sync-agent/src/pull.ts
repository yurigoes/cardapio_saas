/**
 * pull.ts — Sincronização de dados da VPS para o slave (pull)
 *
 * Busca categorias, produtos, mesas, usuários e dados da empresa da VPS
 * e faz UPSERT no PostgreSQL local.
 *
 * Suporta pull incremental usando o parâmetro ?since= para minimizar
 * a quantidade de dados trafegados.
 */

import axios   from "axios";
import { config, saveState } from "./config";
import { authHeaders }        from "./auth";
import { query, transaction } from "./db";
import { logger }             from "./logger";
import { PoolClient }         from "pg";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos retornados pela VPS
// ─────────────────────────────────────────────────────────────────────────────

interface PullResponse {
  empresa: {
    id:             string;
    slug:           string;
    nome_fantasia:  string;
    cor_primaria:   string;
    cor_secundaria: string;
    whatsapp:       string | null;
    modulos_ativos: string[];
  };
  categorias:  Record<string, unknown>[];
  produtos:    Record<string, unknown>[];
  mesas:       Record<string, unknown>[];
  usuarios:    Record<string, unknown>[];
  timestamp:   string;
  incremental: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funções de UPSERT
// ─────────────────────────────────────────────────────────────────────────────

async function upsertEmpresa(client: PoolClient, empresa: PullResponse["empresa"]): Promise<void> {
  await client.query(
    `INSERT INTO empresa (id, slug, nome_fantasia, cor_primaria, cor_secundaria, whatsapp, modulos_ativos, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (id) DO UPDATE SET
       slug           = EXCLUDED.slug,
       nome_fantasia  = EXCLUDED.nome_fantasia,
       cor_primaria   = EXCLUDED.cor_primaria,
       cor_secundaria = EXCLUDED.cor_secundaria,
       whatsapp       = EXCLUDED.whatsapp,
       modulos_ativos = EXCLUDED.modulos_ativos,
       updated_at     = NOW()`,
    [
      empresa.id,
      empresa.slug,
      empresa.nome_fantasia,
      empresa.cor_primaria,
      empresa.cor_secundaria,
      empresa.whatsapp,
      empresa.modulos_ativos,
    ]
  );
}

async function upsertCategorias(client: PoolClient, categorias: Record<string, unknown>[]): Promise<void> {
  for (const cat of categorias) {
    await client.query(
      `INSERT INTO categorias (id, nome, descricao, ordem, ativo, imagem_url, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         nome       = EXCLUDED.nome,
         descricao  = EXCLUDED.descricao,
         ordem      = EXCLUDED.ordem,
         ativo      = EXCLUDED.ativo,
         imagem_url = EXCLUDED.imagem_url,
         updated_at = EXCLUDED.updated_at`,
      [
        cat.id,
        cat.nome,
        cat.descricao ?? null,
        cat.ordem ?? 0,
        cat.ativo ?? true,
        cat.imagem_url ?? null,
        cat.updated_at ?? new Date().toISOString(),
      ]
    );
  }
}

async function upsertProdutos(client: PoolClient, produtos: Record<string, unknown>[]): Promise<void> {
  for (const prod of produtos) {
    await client.query(
      `INSERT INTO produtos
         (id, categoria_id, nome, descricao, preco, preco_promocional,
          disponivel, imagem_url, tempo_preparo, ordem, destaque, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         categoria_id      = EXCLUDED.categoria_id,
         nome              = EXCLUDED.nome,
         descricao         = EXCLUDED.descricao,
         preco             = EXCLUDED.preco,
         preco_promocional = EXCLUDED.preco_promocional,
         disponivel        = EXCLUDED.disponivel,
         imagem_url        = EXCLUDED.imagem_url,
         tempo_preparo     = EXCLUDED.tempo_preparo,
         ordem             = EXCLUDED.ordem,
         destaque          = EXCLUDED.destaque,
         updated_at        = EXCLUDED.updated_at`,
      [
        prod.id,
        prod.categoria_id ?? null,
        prod.nome,
        prod.descricao ?? null,
        prod.preco,
        prod.preco_promocional ?? null,
        prod.disponivel ?? true,
        prod.imagem_url ?? null,
        prod.tempo_preparo ?? null,
        prod.ordem ?? 0,
        prod.destaque ?? false,
        prod.updated_at ?? new Date().toISOString(),
      ]
    );
  }
}

async function upsertMesas(client: PoolClient, mesas: Record<string, unknown>[]): Promise<void> {
  for (const mesa of mesas) {
    await client.query(
      `INSERT INTO mesas (id, numero, capacidade, status, localizacao, pedido_ativo_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         numero          = EXCLUDED.numero,
         capacidade      = EXCLUDED.capacidade,
         status          = EXCLUDED.status,
         localizacao     = EXCLUDED.localizacao,
         pedido_ativo_id = EXCLUDED.pedido_ativo_id,
         updated_at      = EXCLUDED.updated_at`,
      [
        mesa.id,
        mesa.numero,
        mesa.capacidade ?? null,
        mesa.status ?? "livre",
        mesa.localizacao ?? null,
        mesa.pedido_ativo_id ?? null,
        mesa.updated_at ?? new Date().toISOString(),
      ]
    );
  }
}

async function upsertUsuarios(client: PoolClient, usuarios: Record<string, unknown>[]): Promise<void> {
  for (const user of usuarios) {
    await client.query(
      `INSERT INTO usuarios (id, nome, email, role, ativo, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         nome       = EXCLUDED.nome,
         email      = EXCLUDED.email,
         role       = EXCLUDED.role,
         ativo      = EXCLUDED.ativo,
         updated_at = EXCLUDED.updated_at`,
      [
        user.id,
        user.nome,
        user.email,
        user.role,
        user.ativo ?? true,
        user.updated_at ?? new Date().toISOString(),
      ]
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pull principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa um pull da VPS.
 *
 * @param since ISO timestamp para pull incremental. Se omitido, faz pull completo.
 * @returns ISO timestamp do pull (usar como next 'since')
 */
export async function pullFromVPS(since?: string): Promise<string> {
  const url = since
    ? `${config.vpsUrl}/api/sync/pull?since=${encodeURIComponent(since)}`
    : `${config.vpsUrl}/api/sync/pull`;

  logger.info("Iniciando pull da VPS", { incremental: !!since, since: since ?? "completo" });

  const response = await axios.get<{ success: boolean; data: PullResponse; error?: string }>(
    url,
    {
      headers:        authHeaders(""),   // GET → body vazio para HMAC
      timeout:        30_000,
      validateStatus: () => true,
    }
  );

  if (!response.data.success) {
    throw new Error(
      `Pull falhou [${response.status}]: ${response.data.error ?? "Erro desconhecido"}`
    );
  }

  const data = response.data.data;

  // Aplica os dados no banco local em uma transação
  await transaction(async (client) => {
    await upsertEmpresa(client, data.empresa);
    await upsertCategorias(client, data.categorias);
    await upsertProdutos(client, data.produtos);
    await upsertMesas(client, data.mesas);
    await upsertUsuarios(client, data.usuarios);
  });

  // Salva timestamp do pull para uso incremental
  saveState({ lastPullAt: data.timestamp });

  const total = data.categorias.length + data.produtos.length +
                data.mesas.length + data.usuarios.length;

  logger.info("Pull concluído com sucesso", {
    registros:  total,
    incremental: data.incremental,
    timestamp:  data.timestamp,
  });

  return data.timestamp;
}
