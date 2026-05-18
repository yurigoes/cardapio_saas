/**
 * Resolve motoboy_id por usuario_id+empresa_id.
 * Se não encontrar e role='motoboy', AUTO-CRIA usando dados do usuarios row.
 *
 * Resolve o problema comum: admin cria usuário com role=motoboy mas esquece
 * de criar entrada em motoboys ou vincular usuario_id.
 */
import { queryOne } from "@/lib/db/client";

export async function resolveMotoboyId(
  usuarioId: string,
  empresaId: string,
  role: string,
): Promise<string | null> {
  const m = await queryOne<{ id: string }>(
    `SELECT id FROM motoboys WHERE usuario_id = $1 AND empresa_id = $2`,
    [usuarioId, empresaId]
  );
  if (m) return m.id;

  // Tenta achar motoboy SEM usuario_id vinculado mas com mesmo telefone (cenário:
  // admin criou usuário separado do motoboy → linka pelo telefone)
  const usr = await queryOne<{ nome: string; telefone: string | null }>(
    `SELECT nome, telefone FROM usuarios WHERE id = $1 AND empresa_id = $2`,
    [usuarioId, empresaId]
  );
  if (!usr) return null;

  if (usr.telefone) {
    const link = await queryOne<{ id: string }>(
      `UPDATE motoboys
          SET usuario_id = $1, updated_at = NOW()
        WHERE empresa_id = $2
          AND usuario_id IS NULL
          AND REGEXP_REPLACE(COALESCE(telefone, ''), '[^0-9]', '', 'g') =
              REGEXP_REPLACE($3, '[^0-9]', '', 'g')
        RETURNING id`,
      [usuarioId, empresaId, usr.telefone]
    ).catch(() => null);
    if (link) {
      console.info(`[resolveMotoboy] linkou motoboy ${link.id} ao usuario ${usuarioId} pelo telefone`);
      return link.id;
    }
  }

  // Auto-cria se role for motoboy
  if (role !== "motoboy") return null;

  const novo = await queryOne<{ id: string }>(
    `INSERT INTO motoboys (empresa_id, nome, telefone, status, ativo, usuario_id)
     VALUES ($1, $2, $3, 'disponivel', TRUE, $4)
     RETURNING id`,
    [empresaId, usr.nome, usr.telefone, usuarioId]
  ).catch(err => {
    console.error("[resolveMotoboy] auto-create falhou:", err);
    return null;
  });

  if (novo) {
    console.info(`[resolveMotoboy] auto-criou motoboy ${novo.id} pro usuario ${usuarioId}`);
    return novo.id;
  }
  return null;
}
