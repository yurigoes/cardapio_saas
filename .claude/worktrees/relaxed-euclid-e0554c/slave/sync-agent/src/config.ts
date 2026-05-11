/**
 * config.ts — Configuração centralizada do sync-agent
 *
 * Lê variáveis de ambiente e exporta objeto de configuração tipado.
 * Também gerencia persistência do JWT e do estado de sincronização.
 */

import * as fs   from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Carrega .env do diretório de trabalho
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Configuração tipada
// ─────────────────────────────────────────────────────────────────────────────

export interface Config {
  // VPS
  vpsUrl:         string;
  slaveKey:       string;
  empresaCnpj:    string;

  // PostgreSQL local
  db: {
    host:     string;
    port:     number;
    database: string;
    user:     string;
    password: string;
  };

  // Sync
  syncIntervalMs: number;

  // Print agent
  printAgentUrl:  string;

  // Caminhos de estado
  jwtFilePath:    string;
  stateFilePath:  string;
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  return value;
}

// Diretório de estado persistente
const STATE_DIR = process.env.STATE_DIR || "/var/lib/sync-agent";

// Garante que o diretório de estado existe
try {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
} catch {
  // Fallback para /tmp se não conseguir criar
}

export const config: Config = {
  vpsUrl:         process.env.VPS_URL        || "https://cardapio.yugochat.com.br",
  slaveKey:       required("SLAVE_KEY"),
  empresaCnpj:    required("EMPRESA_CNPJ"),

  db: {
    host:     process.env.DB_HOST     || "localhost",
    port:     parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME     || "cardapio_slave",
    user:     process.env.DB_USER     || "cardapio",
    password: process.env.DB_PASSWORD || "",
  },

  syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || "30000"),
  printAgentUrl:  process.env.PRINT_AGENT_URL || "http://localhost:3001",

  jwtFilePath:    path.join(STATE_DIR, "slave.jwt"),
  stateFilePath:  path.join(STATE_DIR, "state.json"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Gerenciamento do JWT persistente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Salva o JWT recebido da VPS em disco para sobreviver a restarts.
 */
export function saveJWT(token: string): void {
  fs.writeFileSync(config.jwtFilePath, token, { encoding: "utf8", mode: 0o600 });
}

/**
 * Carrega o JWT salvo em disco.
 * Retorna null se não existir ou se houver erro de leitura.
 */
export function loadJWT(): string | null {
  try {
    if (!fs.existsSync(config.jwtFilePath)) return null;
    const token = fs.readFileSync(config.jwtFilePath, "utf8").trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Remove o JWT salvo (usado ao revogar credenciais).
 */
export function clearJWT(): void {
  try {
    if (fs.existsSync(config.jwtFilePath)) {
      fs.unlinkSync(config.jwtFilePath);
    }
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de sincronização
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncState {
  lastPullAt:  string | null;   // ISO timestamp do último pull bem-sucedido
  lastPushAt:  string | null;   // ISO timestamp do último push bem-sucedido
  startedAt:   string;          // ISO timestamp de quando o agent iniciou
}

export function loadState(): SyncState {
  try {
    if (!fs.existsSync(config.stateFilePath)) {
      return { lastPullAt: null, lastPushAt: null, startedAt: new Date().toISOString() };
    }
    const raw = fs.readFileSync(config.stateFilePath, "utf8");
    return JSON.parse(raw) as SyncState;
  } catch {
    return { lastPullAt: null, lastPushAt: null, startedAt: new Date().toISOString() };
  }
}

export function saveState(state: Partial<SyncState>): void {
  try {
    const current = loadState();
    const next    = { ...current, ...state };
    fs.writeFileSync(config.stateFilePath, JSON.stringify(next, null, 2), "utf8");
  } catch { /* ignore */ }
}
