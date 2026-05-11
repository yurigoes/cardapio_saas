/**
 * POST /api/sync/auth
 * Autenticação simplificada do slave — usa apenas slave_key (sem CNPJ).
 * A slave_key tem 64 hex = 256 bits de entropia, seguro sem CNPJ.
 *
 * Retorna: { empresaId, slug, token }
 */
import { NextRequest } from "next/server";
import { queryOne, query } from "@/lib/db/client";
import { createSlaveJWT } from "@/lib/sync/auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/utils/response";

export async function POST(req: NextRequest) {
  let body: { slave_key?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const { slave_key } = body;

  if (!slave_key || !/^[0-9a-f]{64}$/i.test(slave_key)) {
    return unauthorized("Slave key inválida");
  }

  try {
    const empresa = await queryOne<{
      id: string; slug: string; nome_fantasia: string; modulos_ativos: string[];
    }>(
      `SELECT id, slug, nome_fantasia, modulos_ativos
       FROM empresas
       WHERE slave_key = $1
         AND deleted_at IS NULL
         AND status = 'ativo'`,
      [slave_key.toLowerCase()]
    );

    if (!empresa) return unauthorized("Slave key inválida ou empresa inativa");

    // Atualiza last sync
    await query(
      `UPDATE empresas SET slave_ativo = true, slave_ultimo_sync = NOW() WHERE id = $1`,
      [empresa.id]
    );

    const token = await createSlaveJWT(empresa.id, empresa.slug);

    return ok({
      token,
      empresaId:     empresa.id,
      slug:          empresa.slug,
      nome_fantasia: empresa.nome_fantasia,
      modulos_ativos: empresa.modulos_ativos ?? [],
    });
  } catch (err) {
    console.error("[Sync/Auth/POST]", err);
    return serverError();
  }
}
