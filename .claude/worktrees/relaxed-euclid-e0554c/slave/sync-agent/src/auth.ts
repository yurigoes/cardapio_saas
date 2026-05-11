/**
 * auth.ts — Autenticação do slave com a VPS
 *
 * Responsabilidades:
 * - Autenticar com a VPS usando CNPJ + slave_key
 * - Armazenar o JWT retornado
 * - Assinar requests com HMAC-SHA256
 */

import crypto  from "crypto";
import axios   from "axios";
import { config, saveJWT, loadJWT } from "./config";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Estado em memória
// ─────────────────────────────────────────────────────────────────────────────

let currentJWT: string | null = loadJWT();

export function getJWT(): string | null {
  return currentJWT;
}

export function setJWT(token: string): void {
  currentJWT = token;
  saveJWT(token);
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC-SHA256
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assina um payload com HMAC-SHA256 usando a slave_key configurada.
 * Para requests GET, body = "" (string vazia).
 */
export function signRequest(body: string): string {
  return crypto
    .createHmac("sha256", config.slaveKey)
    .update(body, "utf8")
    .digest("hex");
}

/**
 * Retorna os headers padrão para requests autenticados ao VPS.
 */
export function authHeaders(body = ""): Record<string, string> {
  const jwt = getJWT();
  if (!jwt) throw new Error("JWT não disponível. Execute authenticateWithVPS() primeiro.");

  return {
    "Authorization": `Bearer ${jwt}`,
    "X-Slave-Sig":   signRequest(body),
    "Content-Type":  "application/json",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Autenticação com a VPS
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthResult {
  token:   string;
  empresa: {
    id:             string;
    slug:           string;
    nome_fantasia:  string;
    modulos_ativos: string[];
  };
}

/**
 * Autentica o slave com a VPS.
 * Envia CNPJ + slave_key e recebe um JWT de 30 dias.
 * Lança erro se a autenticação falhar.
 */
export async function authenticateWithVPS(): Promise<AuthResult> {
  logger.info("Autenticando com a VPS...", { url: config.vpsUrl });

  const response = await axios.post<{ success: boolean; data: AuthResult; error?: string }>(
    `${config.vpsUrl}/api/sync/token`,
    {
      cnpj:      config.empresaCnpj,
      slave_key: config.slaveKey,
    },
    {
      timeout:         10_000,
      validateStatus:  () => true,   // não lança em 4xx/5xx
    }
  );

  if (!response.data.success) {
    throw new Error(
      `Autenticação falhou [${response.status}]: ${response.data.error ?? "Erro desconhecido"}`
    );
  }

  const result = response.data.data;
  setJWT(result.token);

  logger.info("Autenticado com sucesso", {
    empresa:  result.empresa.nome_fantasia,
    slug:     result.empresa.slug,
    modulos:  result.empresa.modulos_ativos.length,
  });

  return result;
}

/**
 * Tenta reutilizar o JWT existente ou re-autentica se necessário.
 * Chamado no início de cada ciclo de sync.
 */
export async function ensureAuthenticated(): Promise<void> {
  if (currentJWT) {
    // JWT em memória — assume válido (expira em 30d, loop é a cada 30s)
    return;
  }

  // Tenta carregar do disco
  const stored = loadJWT();
  if (stored) {
    currentJWT = stored;
    logger.info("JWT carregado do disco");
    return;
  }

  // Precisa autenticar
  await authenticateWithVPS();
}
