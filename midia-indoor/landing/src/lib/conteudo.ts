/**
 * Conteúdo base do local (template "Tela cheia"): a mídia de preenchimento
 * que toca em loop entre os anúncios. Cria um layout fullscreen no Xibo e
 * agenda no display group do local.
 */
import { db, ensureSchema } from "./db";
import { criarLayoutLoop, agendarLayoutNoGrupo, criarDisplayGroup, excluirLayout, excluirEvento, setDefaultLayout, listarDisplaysDoGrupo } from "./xibo";

const ROOT_FOLDER = Number(process.env.XIBO_ROOT_FOLDER_ID ?? 1);

/** Define o conteúdo base do local com 1+ arquivos em loop. */
export async function definirConteudoBase(localId: string, arquivos: { arquivo: Buffer | Blob; nomeArquivo: string }[]): Promise<{ ok: boolean; erro?: string; enviados?: number }> {
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

    const { layoutId, campaignId, enviados } = await criarLayoutLoop({
      nome: `Conteúdo — ${local.nome} ${Date.now().toString(36)}`,
      arquivos, folderId: ROOT_FOLDER,
      width: local.largura, height: local.altura,
    });

    // Agenda o layout no grupo do local (sempre ativo). Os anúncios interleiam por cima.
    let eventId: number | undefined;
    if (campaignId) eventId = await agendarLayoutNoGrupo(campaignId, dg);

    const nomeResumo = arquivos.length === 1 ? arquivos[0].nomeArquivo : `${arquivos.length} arquivos`;
    await p.query(
      `UPDATE midia_locais SET conteudo_layout_id = $1, conteudo_nome = $2, conteudo_event_id = $3, updated_at = NOW() WHERE id = $4`,
      [layoutId, nomeResumo, eventId ?? null, localId]
    );
    return { ok: true, enviados };
  } catch (err) {
    console.error("[definirConteudoBase]", err);
    return { ok: false, erro: err instanceof Error ? err.message : "erro" };
  }
}

/**
 * Define o SPLASH do local — uma imagem/vídeo que toca como Default Layout
 * (exibido quando não há agendamento ativo). Aplica em todas as telas do local.
 */
export async function definirSplashLocal(localId: string, arquivos: { arquivo: Buffer | Blob; nomeArquivo: string }[]): Promise<{ ok: boolean; erro?: string; telas_atualizadas?: number }> {
  await ensureSchema();
  const p = db();
  const local = await p.query<{ nome: string; cidade: string | null; largura: number; altura: number; xibo_display_group_id: number | null; splash_layout_id: number | null }>(
    `SELECT nome, cidade, largura, altura, xibo_display_group_id, splash_layout_id FROM midia_locais WHERE id = $1`, [localId]
  ).then(r => r.rows[0]);
  if (!local) return { ok: false, erro: "local não encontrado" };

  try {
    let dg = local.xibo_display_group_id;
    if (!dg) {
      dg = await criarDisplayGroup(`Local — ${local.nome}`, local.cidade ?? "");
      await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1 WHERE id = $2`, [dg, localId]);
    }

    // Remove splash anterior
    if (local.splash_layout_id) {
      try { await excluirLayout(local.splash_layout_id); } catch (e) { console.warn("[splash] layout antigo:", (e as Error).message); }
    }

    const { layoutId } = await criarLayoutLoop({
      nome: `Splash — ${local.nome} ${Date.now().toString(36)}`,
      arquivos, folderId: ROOT_FOLDER,
      width: local.largura, height: local.altura,
    });

    // Atribui como Default Layout em todas as telas do grupo do local
    const displays = await listarDisplaysDoGrupo(dg);
    let aplicadas = 0;
    for (const d of displays) {
      try { await setDefaultLayout(d.displayId, layoutId); aplicadas++; }
      catch (e) { console.warn(`[splash] display ${d.displayId}:`, (e as Error).message); }
    }

    const nomeResumo = arquivos.length === 1 ? arquivos[0].nomeArquivo : `${arquivos.length} arquivos`;
    await p.query(`UPDATE midia_locais SET splash_layout_id = $1, splash_nome = $2, updated_at = NOW() WHERE id = $3`, [layoutId, nomeResumo, localId]);
    return { ok: true, telas_atualizadas: aplicadas };
  } catch (err) {
    console.error("[definirSplashLocal]", err);
    return { ok: false, erro: err instanceof Error ? err.message : "erro" };
  }
}
