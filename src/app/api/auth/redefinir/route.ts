/**
 * POST /api/auth/redefinir
 * Body: { identificador, codigo, nova_senha }
 *
 * Confirma código + redefine senha. Marca o reset como usado.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, serverError } from "@/lib/utils/response";
import bcrypt from "bcryptjs";

const schema = z.object({
  identificador: z.string().min(3).max(255),
  codigo:        z.string().length(6),
  nova_senha:    z.string().min(8).max(128),
});

function ehEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const usuario = await queryOne<{ id: string }>(
    ehEmail(body.identificador)
      ? `SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`
      : `SELECT id FROM usuarios WHERE telefone = $1 AND deleted_at IS NULL`,
    [body.identificador.trim()]
  ).catch(() => null);

  if (!usuario) return badRequest("Código inválido ou expirado");

  // Pega resets recentes (não usados, não expirados)
  const resets = await query<{ id: string; codigo: string }>(
    `SELECT id, codigo FROM password_resets
      WHERE usuario_id = $1 AND usado_em IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 5`,
    [usuario.id]
  );

  let resetMatch: { id: string } | null = null;
  for (const r of resets) {
    if (await bcrypt.compare(body.codigo, r.codigo)) {
      resetMatch = { id: r.id };
      break;
    }
  }

  if (!resetMatch) return badRequest("Código inválido ou expirado");

  try {
    const novaHash = await bcrypt.hash(body.nova_senha, 12);
    await query(
      `UPDATE usuarios SET senha_hash = $1, updated_at = NOW() WHERE id = $2`,
      [novaHash, usuario.id]
    );
    await query(
      `UPDATE password_resets SET usado_em = NOW() WHERE id = $1`,
      [resetMatch.id]
    );
    // Invalida outras sessões
    await query(
      `UPDATE sessoes SET revoked_at = NOW() WHERE usuario_id = $1 AND revoked_at IS NULL`,
      [usuario.id]
    ).catch(() => {});

    return ok({ redefinido: true, mensagem: "Senha redefinida com sucesso. Faça login com a nova senha." });
  } catch (err) {
    console.error("[Redefinir]", err);
    return serverError();
  }
}
