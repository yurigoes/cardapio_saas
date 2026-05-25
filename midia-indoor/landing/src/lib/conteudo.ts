/**
 * Conteúdo base do local (template "Tela cheia"): a mídia de preenchimento
 * que toca em loop entre os anúncios. Cria um layout fullscreen no Xibo e
 * agenda no display group do local.
 */
import { db, ensureSchema } from "./db";
import { criarLayoutDeMidia, agendarLayoutNoGrupo, criarDisplayGroup, excluirLayout, excluirEvento } from "./xibo";

const ROOT_FOLDER = Number(process.env.XIBO_ROOT_FOLDER_ID ?? 1);

export async function definirConteudoBase(localId: string, arquivo: Buffer | Blob, nomeArquivo: string, mime?: string): Promise<{ ok: boolean; erro?: string }> {
  await ensureSchema();
  const p = db();
  const local = await p.query<{ nome: string; cidade: string | null; largura: number; altura: number; xibo_display_group_id: number | null; conteudo_layout_id: number | null; conteudo_event_id: number | null }>(
    `SELECT nome, cidade, largura, altura, xibo_display_group_id, conteudo_layout_id, conteudo_event_id FROM midia_locais WHERE id = $1`, [localId]
  ).then(r => r.rows[0]);
  if (!local) return { ok: false, erro: "local não encontrado" };

  try {
    // Garante display group do local
    let dg = local.xibo_display_group_id;
    if (!dg) {
      dg = await criarDisplayGroup(`Local — ${local.nome}`, local.cidade ?? "");
      await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1 WHERE id = $2`, [dg, localId]);
    }

    // Remove o conteúdo anterior: agendamento + layout (evita conteúdo velho persistir)
    if (local.conteudo_event_id) {
      try { await excluirEvento(local.conteudo_event_id); } catch (e) { console.warn("[conteudo] não apagou evento antigo:", (e as Error).message); }
    }
    if (local.conteudo_layout_id) {
      try { await excluirLayout(local.conteudo_layout_id); } catch (e) { console.warn("[conteudo] não apagou layout antigo:", (e as Error).message); }
    }

    const { layoutId, campaignId } = await criarLayoutDeMidia({
      nome: `Conteúdo — ${local.nome} ${Date.now().toString(36)}`,
      arquivo, nomeArquivo, folderId: ROOT_FOLDER,
      width: local.largura, height: local.altura,
      duracaoSeg: (mime ?? "").startsWith("video") ? undefined : 10,
    });

    // Agenda o layout no grupo do local (sempre ativo). Os anúncios interleiam por cima.
    let eventId: number | undefined;
    if (campaignId) eventId = await agendarLayoutNoGrupo(campaignId, dg);

    await p.query(
      `UPDATE midia_locais SET conteudo_layout_id = $1, conteudo_nome = $2, conteudo_event_id = $3, updated_at = NOW() WHERE id = $4`,
      [layoutId, nomeArquivo, eventId ?? null, localId]
    );
    return { ok: true };
  } catch (err) {
    console.error("[definirConteudoBase]", err);
    return { ok: false, erro: err instanceof Error ? err.message : "erro" };
  }
}
