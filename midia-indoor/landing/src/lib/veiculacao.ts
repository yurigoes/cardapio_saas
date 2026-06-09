/**
 * Plano de veiculacao: define como o local intercala conteudo entre anuncios.
 *
 *  'publicidade'    — comportamento default: anuncios entram via Ad Campaigns,
 *                     conteudo base do local (definirConteudoBase) toca nos gaps.
 *
 *  'encarte_totem'  — encarte 1:1 estrito intercalado:
 *                     [encarte, anuncio_1, encarte, anuncio_2, encarte, anuncio_1, ...]
 *                     Master sobe o encarte em Local > "Midia Encarte" com periodo
 *                     de vigencia. Sistema regenera o layout sempre que muda algo:
 *                     novo encarte, anuncio entra/sai do ar, etc.
 *
 *  'ponta_gondola'  — cada TELA do local tem sua propria midia ponta. Anuncios
 *                     intercalam em sync entre todas. Por tela:
 *                     [ponta_da_tela, anuncio_1, ponta_da_tela, anuncio_2, ...]
 *
 * Como funciona internamente:
 *  1. Trigger: encarte/ponta atualizado, campanha lancada/encerrada
 *  2. regenerarLayoutDoLocal(localId) eh chamado
 *  3. Lista anuncios ativos cobrindo o local (campanhas no_ar com xibo_media_id)
 *  4. Monta sequencia intercalada e cria layout no Xibo via criarLayoutInterleave
 *  5. Agenda esse layout como conteudo base (substitui o anterior)
 *  6. Anuncios continuam tendo Ad Campaigns proprias — mas no plano encarte/gondola,
 *     o layout intercalado JA inclui eles, entao desativamos as Ad Campaigns delas
 *     pra evitar duplicacao. Ao encerrar, a campanha volta a ser apenas Ad Campaign.
 */

import { db, ensureSchema } from "./db";
import {
  criarLayoutInterleave, uploadMediaSimples,
  agendarLayoutNoGrupo, excluirLayout, excluirEvento, criarDisplayGroup, setDefaultLayout, listarDisplaysDoGrupo,
} from "./xibo";

const ROOT_FOLDER = Number(process.env.XIBO_ROOT_FOLDER_ID ?? 1);

interface LocalRow {
  id: string; nome: string; cidade: string | null;
  largura: number; altura: number;
  plano_veiculacao: string;
  xibo_display_group_id: number | null;
  encarte_media_id: number | null; encarte_layout_id: number | null;
  encarte_inicio: string | null; encarte_fim: string | null;
  encarte_duracao_seg: number;
  interleave_layout_id: number | null; interleave_event_id: number | null;
}

interface AnuncioAtivo {
  campanha_id: string; nome: string;
  xibo_media_id: number;
  segundos: number;
}

function encarteVigente(local: LocalRow): boolean {
  if (!local.encarte_media_id) return false;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (local.encarte_inicio && new Date(local.encarte_inicio).getTime() > hoje.getTime()) return false;
  if (local.encarte_fim && new Date(local.encarte_fim).getTime() < hoje.getTime()) return false;
  return true;
}

async function carregarLocal(localId: string): Promise<LocalRow | null> {
  const r = await db().query<LocalRow>(
    `SELECT id, nome, cidade, largura, altura, plano_veiculacao,
            xibo_display_group_id, encarte_media_id, encarte_layout_id,
            encarte_inicio::text, encarte_fim::text, encarte_duracao_seg,
            interleave_layout_id, interleave_event_id
       FROM midia_locais WHERE id = $1`, [localId]
  );
  return r.rows[0] ?? null;
}

async function listarAnunciosAtivosNoLocal(localId: string): Promise<AnuncioAtivo[]> {
  const r = await db().query<AnuncioAtivo>(
    `SELECT c.id AS campanha_id, c.nome, c.xibo_media_id, c.segundos
       FROM midia_campanhas c
       JOIN midia_campanha_locais cl ON cl.campanha_id = c.id
      WHERE cl.local_id = $1
        AND c.status = 'no_ar'
        AND c.xibo_media_id IS NOT NULL
        AND (c.data_fim IS NULL OR c.data_fim >= CURRENT_DATE)
      ORDER BY c.lancada_em ASC NULLS LAST, c.created_at ASC`,
    [localId]
  );
  return r.rows.filter(x => x.xibo_media_id != null && x.xibo_media_id > 0);
}

/**
 * Regenera o layout intercalado do local. Idempotente.
 * Retorna { ok, layoutId, anuncios, regenerado } ou erro.
 *
 * No-op (retorna ok=true regenerado=false) quando:
 *  - plano_veiculacao = 'publicidade' (comportamento legado, nada a fazer)
 *  - plano = 'encarte_totem' mas encarte_media_id ausente OU fora de vigencia
 *  - nao ha anuncios ativos no local (sem nada pra intercalar — so deixar encarte)
 *    NESSE CASO: ainda cria layout so com encarte (toca encarte fullscreen)
 */
export async function regenerarLayoutDoLocal(localId: string): Promise<{
  ok: boolean; regenerado: boolean; erro?: string;
  layoutId?: number; eventId?: number; anuncios?: number;
}> {
  await ensureSchema();
  const p = db();
  const local = await carregarLocal(localId);
  if (!local) return { ok: false, regenerado: false, erro: "local nao encontrado" };

  if (local.plano_veiculacao === "publicidade") {
    return { ok: true, regenerado: false };
  }

  // Por enquanto: ponta_gondola eh similar ao encarte (so muda fonte do encarte
  // pra ser por tela). Implementado em regenerarLayoutDaTelaGondola separado.
  if (local.plano_veiculacao === "ponta_gondola") {
    return { ok: true, regenerado: false, erro: "use regenerarLayoutDasTelasGondola pra ponta_gondola" };
  }

  if (local.plano_veiculacao !== "encarte_totem") {
    return { ok: false, regenerado: false, erro: `plano '${local.plano_veiculacao}' desconhecido` };
  }

  // ENCARTE_TOTEM
  if (!encarteVigente(local)) {
    console.log(`[veiculacao] local ${localId} encarte fora de vigencia ou ausente — pulando regen`);
    return { ok: true, regenerado: false };
  }

  // Display group do local (cria se nao tiver)
  let dg = local.xibo_display_group_id;
  if (!dg) {
    dg = await criarDisplayGroup(`Local — ${local.nome}`, local.cidade ?? "");
    await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1 WHERE id = $2`, [dg, localId]);
  }

  const anuncios = await listarAnunciosAtivosNoLocal(localId);

  // Monta sequencia: [encarte, ad1, encarte, ad2, encarte, ad3, ...]
  // Se 0 anuncios: [encarte] (so encarte rodando)
  const itens: Array<{ mediaId: number; duracaoSeg?: number }> = [];
  if (anuncios.length === 0) {
    itens.push({ mediaId: local.encarte_media_id!, duracaoSeg: local.encarte_duracao_seg });
  } else {
    for (const a of anuncios) {
      itens.push({ mediaId: local.encarte_media_id!, duracaoSeg: local.encarte_duracao_seg });
      itens.push({ mediaId: a.xibo_media_id, duracaoSeg: a.segundos > 0 ? a.segundos : 10 });
    }
  }

  // Cria novo layout intercalado
  const nomeNovo = `Encarte ${local.nome} ${Date.now().toString(36)}`;
  let novo;
  try {
    novo = await criarLayoutInterleave({
      nome: nomeNovo, folderId: ROOT_FOLDER,
      width: local.largura, height: local.altura,
      itens,
    });
  } catch (e) {
    return { ok: false, regenerado: false, erro: `criar layout falhou: ${(e as Error).message}` };
  }

  // Agenda no grupo do local — substitui o anterior. O agendamento eh
  // "fallback" se Ad Campaigns nao cobrirem; ESSENCIAL pra player ter algo
  // pra tocar enquanto Xibo CampaignSchedulerTask nao roda.
  if (local.interleave_event_id) {
    try { await excluirEvento(local.interleave_event_id); } catch { /* ignore */ }
  }
  let eventId: number | undefined;
  if (novo.campaignId) {
    try { eventId = await agendarLayoutNoGrupo(novo.campaignId, dg); }
    catch (e) { console.warn(`[veiculacao] agendar layout falhou:`, (e as Error).message); }
  }

  // CRITICO: seta layout intercalado como DEFAULT LAYOUT de cada display do grupo.
  // Sem isso, splash continua ativo nos gaps de evento, e o player alterna
  // entre splash e encarte (sintoma reportado). Com Default Layout = intercalado,
  // ele roda continuamente sempre que nao houver Ad Campaign mais prioritaria.
  try {
    const displays = await listarDisplaysDoGrupo(dg);
    for (const d of displays) {
      try {
        await setDefaultLayout(d.displayId, novo.layoutId);
        console.log(`[veiculacao] display ${d.displayId}: Default Layout = ${novo.layoutId}`);
      } catch (e) {
        console.warn(`[veiculacao] setDefaultLayout(${d.displayId}) falhou:`, (e as Error).message);
      }
    }
  } catch (e) { console.warn(`[veiculacao] listarDisplaysDoGrupo(${dg}) falhou:`, (e as Error).message); }

  // Apaga layout intercalado anterior (limpa lixo no Xibo)
  if (local.interleave_layout_id) {
    try { await excluirLayout(local.interleave_layout_id); } catch { /* ignore */ }
  }

  // Persiste refs no DB
  await p.query(
    `UPDATE midia_locais SET interleave_layout_id = $1, interleave_event_id = $2, updated_at = NOW() WHERE id = $3`,
    [novo.layoutId, eventId ?? null, localId]
  );

  console.log(`[veiculacao] local ${localId} (${local.nome}): layout encarte ${novo.layoutId} com ${anuncios.length} anuncios`);
  return { ok: true, regenerado: true, layoutId: novo.layoutId, eventId, anuncios: anuncios.length };
}

/**
 * Faz upload do encarte do local. Salva blob (pra soft-recreate igual aos anuncios)
 * + cria media no Xibo + dispara regenerar layout intercalado.
 */
export async function definirEncarteDoLocal(localId: string, opts: {
  arquivo: Buffer | Blob; nomeArquivo: string; mime?: string;
  inicio?: string | null; fim?: string | null; duracaoSeg?: number;
}): Promise<{ ok: boolean; erro?: string; mediaId?: number; regenerado?: boolean }> {
  await ensureSchema();
  const p = db();
  const local = await carregarLocal(localId);
  if (!local) return { ok: false, erro: "local nao encontrado" };

  // Upload na library do Xibo
  let mediaId: number;
  try {
    mediaId = await uploadMediaSimples(opts.arquivo, opts.nomeArquivo, ROOT_FOLDER);
  } catch (e) {
    return { ok: false, erro: `upload Xibo falhou: ${(e as Error).message}` };
  }

  // Blob no DB pra soft-recreate
  const blob = Buffer.isBuffer(opts.arquivo)
    ? (opts.arquivo.length <= 100 * 1024 * 1024 ? opts.arquivo : null)
    : (opts.arquivo.size <= 100 * 1024 * 1024 ? Buffer.from(await opts.arquivo.arrayBuffer()) : null);

  await p.query(
    `UPDATE midia_locais
        SET encarte_media_id = $1, encarte_nome = $2,
            encarte_inicio = $3, encarte_fim = $4,
            encarte_duracao_seg = COALESCE($5, encarte_duracao_seg),
            encarte_arquivo_bytes = $6, encarte_arquivo_mime = $7,
            plano_veiculacao = CASE WHEN plano_veiculacao = 'publicidade' THEN 'encarte_totem' ELSE plano_veiculacao END,
            updated_at = NOW()
      WHERE id = $8`,
    [mediaId, opts.nomeArquivo, opts.inicio ?? null, opts.fim ?? null,
     opts.duracaoSeg ?? null, blob, opts.mime ?? null, localId]
  );

  // Dispara regeneracao imediata se vigente
  const r = await regenerarLayoutDoLocal(localId);
  return { ok: true, mediaId, regenerado: r.regenerado };
}

/** Faz upload da midia ponta de uma TELA (gondola). */
export async function definirPontaGondola(telaId: string, opts: {
  arquivo: Buffer | Blob; nomeArquivo: string; mime?: string; duracaoSeg?: number;
}): Promise<{ ok: boolean; erro?: string; mediaId?: number }> {
  await ensureSchema();
  const p = db();
  const tela = await p.query<{ id: string; local_id: string | null; xibo_display_id: number | null }>(
    `SELECT id, local_id, xibo_display_id FROM midia_telas WHERE id = $1`, [telaId]
  ).then(r => r.rows[0]);
  if (!tela) return { ok: false, erro: "tela nao encontrada" };

  let mediaId: number;
  try {
    mediaId = await uploadMediaSimples(opts.arquivo, opts.nomeArquivo, ROOT_FOLDER);
  } catch (e) {
    return { ok: false, erro: `upload Xibo falhou: ${(e as Error).message}` };
  }

  const blob = Buffer.isBuffer(opts.arquivo)
    ? (opts.arquivo.length <= 100 * 1024 * 1024 ? opts.arquivo : null)
    : (opts.arquivo.size <= 100 * 1024 * 1024 ? Buffer.from(await opts.arquivo.arrayBuffer()) : null);

  await p.query(
    `UPDATE midia_telas
        SET gondola_media_id = $1, gondola_nome = $2,
            gondola_duracao_seg = COALESCE($3, gondola_duracao_seg),
            gondola_arquivo_bytes = $4, gondola_arquivo_mime = $5,
            updated_at = NOW()
      WHERE id = $6`,
    [mediaId, opts.nomeArquivo, opts.duracaoSeg ?? null, blob, opts.mime ?? null, telaId]
  );

  // Marca local como ponta_gondola se ainda nao for
  if (tela.local_id) {
    await p.query(
      `UPDATE midia_locais SET plano_veiculacao = 'ponta_gondola'
        WHERE id = $1 AND plano_veiculacao = 'publicidade'`,
      [tela.local_id]
    );
    await regenerarLayoutDasTelasGondola(tela.local_id);
  }

  return { ok: true, mediaId };
}

/**
 * Pra ponta_gondola: regenera o layout DE CADA TELA do local com sua propria
 * midia ponta + anuncios intercalados. Cada tela vira independente nesse modo
 * (Default Layout setado por tela).
 *
 * LIMITACAO: SYNC entre TVs durante o slot de anuncio precisaria de Xibo Sync
 * Group (experimental em CMS 4.x). Por ora, cada tela roda no proprio tempo —
 * podem ficar 1-2s defasadas. Pra sync perfeito, futura iteracao.
 */
export async function regenerarLayoutDasTelasGondola(localId: string): Promise<{
  ok: boolean; telas_regeneradas: number; erro?: string;
}> {
  await ensureSchema();
  const p = db();
  const local = await carregarLocal(localId);
  if (!local) return { ok: false, telas_regeneradas: 0, erro: "local nao encontrado" };
  if (local.plano_veiculacao !== "ponta_gondola") {
    return { ok: false, telas_regeneradas: 0, erro: "local nao eh ponta_gondola" };
  }

  // Garante display group do local
  let dg = local.xibo_display_group_id;
  if (!dg) {
    dg = await criarDisplayGroup(`Local — ${local.nome}`, local.cidade ?? "");
    await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1 WHERE id = $2`, [dg, localId]);
  }

  const anuncios = await listarAnunciosAtivosNoLocal(localId);

  const telas = await p.query<{ id: string; nome: string | null; xibo_display_id: number | null; gondola_media_id: number | null; gondola_duracao_seg: number; gondola_layout_id: number | null }>(
    `SELECT id, nome, xibo_display_id, gondola_media_id, gondola_duracao_seg, gondola_layout_id
       FROM midia_telas WHERE local_id = $1 AND xibo_display_id IS NOT NULL`, [localId]
  ).then(r => r.rows);

  let n = 0;
  for (const tela of telas) {
    if (!tela.gondola_media_id || !tela.xibo_display_id) continue;
    const itens: Array<{ mediaId: number; duracaoSeg?: number }> = [];
    if (anuncios.length === 0) {
      itens.push({ mediaId: tela.gondola_media_id, duracaoSeg: tela.gondola_duracao_seg });
    } else {
      for (const a of anuncios) {
        itens.push({ mediaId: tela.gondola_media_id, duracaoSeg: tela.gondola_duracao_seg });
        itens.push({ mediaId: a.xibo_media_id, duracaoSeg: a.segundos > 0 ? a.segundos : 10 });
      }
    }
    try {
      const novo = await criarLayoutInterleave({
        nome: `Gondola ${tela.nome ?? tela.id.slice(0, 8)} ${Date.now().toString(36)}`,
        folderId: ROOT_FOLDER, width: local.largura, height: local.altura, itens,
      });
      // Set como Default Layout da tela (toca sem schedule, sempre)
      await setDefaultLayout(tela.xibo_display_id, novo.layoutId);
      if (tela.gondola_layout_id) {
        try { await excluirLayout(tela.gondola_layout_id); } catch { /* ignore */ }
      }
      await p.query(`UPDATE midia_telas SET gondola_layout_id = $1, updated_at = NOW() WHERE id = $2`, [novo.layoutId, tela.id]);
      n++;
    } catch (e) {
      console.warn(`[veiculacao] tela ${tela.id} regen falhou:`, (e as Error).message);
    }
  }

  return { ok: true, telas_regeneradas: n };
}

/**
 * Hook chamado por lancarCampanha / encerrarCampanha pra cada local da campanha.
 * Decide qual regenerar baseado no plano_veiculacao do local.
 */
export async function regenerarSeNecessario(localId: string): Promise<void> {
  try {
    const local = await carregarLocal(localId);
    if (!local) return;
    if (local.plano_veiculacao === "encarte_totem") {
      await regenerarLayoutDoLocal(localId);
    } else if (local.plano_veiculacao === "ponta_gondola") {
      await regenerarLayoutDasTelasGondola(localId);
    }
  } catch (e) {
    console.warn(`[veiculacao] regen ${localId} falhou:`, (e as Error).message);
  }
}
