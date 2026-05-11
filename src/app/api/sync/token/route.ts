/**
 * POST /api/sync/token — Autenticação do slave
 *
 * Rota pública (não requer JWT de usuário).
 * O slave apresenta { cnpj, slave_key } e recebe um slaveJWT de 30 dias.
 *
 * Rate limit: 5 tentativas por IP por minuto para evitar brute-force.
 */

import { NextRequest } from "next/server";
import { queryOne, query } from "@/lib/db/client";
import { createSlaveJWT } from "@/lib/sync/auth";
import { ok, unauthorized, badRequest, tooManyRequests, serverError } from "@/lib/utils/response";
import { checkRateLimit } from "@/lib/security/rate-limit";

const SLAVE_AUTH_RATE_LIMIT = {
  windowMs:  60_000,
  max:       5,
  keyPrefix: "rl:slave-auth",
};

interface EmpresaRow {
  id:              string;
  slug:            string;
  nome_fantasia:   string;
  modulos_ativos:  string[];
}

export async function POST(req: NextRequest) {
  // Rate limit por IP
  const ip = req.headers.get("x-real-ip") ||
             req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
             "unknown";

  const rl = await checkRateLimit(ip, SLAVE_AUTH_RATE_LIMIT);
  if (!rl.success) {
    return tooManyRequests(rl);
  }

  // Parse body
  let body: { cnpj?: string; slave_key?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const { cnpj, slave_key } = body;

  if (!cnpj || !slave_key) {
    return badRequest("cnpj e slave_key são obrigatórios");
  }

  // CNPJ: apenas dígitos
  const cnpjDigits = cnpj.replace(/\D/g, "");
  if (cnpjDigits.length !== 14) {
    return badRequest("CNPJ deve ter 14 dígitos");
  }

  // slave_key: deve ter 64 caracteres hex
  if (!/^[0-9a-f]{64}$/i.test(slave_key)) {
    return unauthorized("Chave inválida ou empresa inativa");
  }

  try {
    // Busca empresa que corresponde ao CNPJ + slave_key
    const empresa = await queryOne<EmpresaRow>(
      `SELECT id, slug, nome_fantasia, modulos_ativos
       FROM empresas
       WHERE cnpj = $1
         AND slave_key = $2
         AND deleted_at IS NULL
         AND status = 'ativo'`,
      [cnpjDigits, slave_key.toLowerCase()]
    );

    if (!empresa) {
      // Não revela se o CNPJ existe ou se a chave é inválida (segurança)
      return unauthorized("Chave inválida ou empresa inativa");
    }

    // Atualiza estado do slave
    await query(
      `UPDATE empresas
       SET slave_ativo       = true,
           slave_ultimo_sync = NOW(),
           updated_at        = NOW()
       WHERE id = $1`,
      [empresa.id]
    );

    // Gera slave JWT
    const token = await createSlaveJWT(empresa.id, empresa.slug);

    return ok({
      token,
      empresa: {
        id:              empresa.id,
        slug:            empresa.slug,
        nome_fantasia:   empresa.nome_fantasia,
        modulos_ativos:  empresa.modulos_ativos ?? [],
      },
    });
  } catch (err) {
    console.error("[Sync/Token/POST]", err);
    return serverError();
  }
}
