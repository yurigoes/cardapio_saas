/**
 * Provisionamento de conta no Xibo.
 *
 * Quando uma conta é ativada (pagamento aprovado), criamos no Xibo:
 *   - 1 Folder com o nome da empresa (isola a mídia dela)
 *   - 1 Display Group (agrupa as TVs dela)
 * e salvamos os IDs na conta. Idempotente: se já provisionado, não repete.
 */
import { db, ensureSchema } from "./db";
import { criarFolder, criarDisplayGroup } from "./xibo";

export async function provisionarConta(contaId: string): Promise<{
  ok: boolean; folderId?: number; displayGroupId?: number; jaProvisionado?: boolean; erro?: string;
}> {
  await ensureSchema();
  const p = db();

  const conta = await p.query<{
    id: string; empresa: string; xibo_folder_id: number | null; xibo_display_group_id: number | null;
  }>(
    `SELECT id, empresa, xibo_folder_id, xibo_display_group_id FROM midia_contas WHERE id = $1`,
    [contaId]
  ).then(r => r.rows[0]);

  if (!conta) return { ok: false, erro: "conta não encontrada" };

  // Idempotência
  if (conta.xibo_folder_id && conta.xibo_display_group_id) {
    return { ok: true, jaProvisionado: true, folderId: conta.xibo_folder_id, displayGroupId: conta.xibo_display_group_id };
  }

  try {
    // Nome único pra evitar colisão (empresa + sufixo do id)
    const sufixo = conta.id.slice(0, 8);
    const nomeBase = `${conta.empresa} [${sufixo}]`;

    const folderId       = conta.xibo_folder_id       ?? await criarFolder(nomeBase);
    const displayGroupId = conta.xibo_display_group_id ?? await criarDisplayGroup(nomeBase, `Telas de ${conta.empresa}`);

    await p.query(
      `UPDATE midia_contas
          SET xibo_folder_id = $1, xibo_display_group_id = $2,
              provisionado_em = NOW(), status = 'ativo', updated_at = NOW()
        WHERE id = $3`,
      [folderId, displayGroupId, contaId]
    );

    return { ok: true, folderId, displayGroupId };
  } catch (err) {
    console.error("[provisionar]", err);
    return { ok: false, erro: err instanceof Error ? err.message : "erro inesperado" };
  }
}
