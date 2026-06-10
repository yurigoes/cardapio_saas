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

export interface EncartePagina {
  id: string; ordem: number; xibo_media_id: number; duracao_seg: number; nome: string | null;
}

export async function listarPaginasEncarte(localId: string): Promise<EncartePagina[]> {
  const r = await db().query<EncartePagina>(
    `SELECT id, ordem, xibo_media_id, duracao_seg, nome
       FROM midia_encarte_paginas WHERE local_id = $1 ORDER BY ordem ASC, criada_em ASC`,
    [localId]
  );
  return r.rows;
}

interface AnuncioAtivo {
  campanha_id: string; nome: string;
  xibo_media_id: number;
  segundos: number;
}

function dentroDaVigencia(local: LocalRow): boolean {
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
  // Inclui campanhas apontadas DIRETAMENTE no local OU via qualquer grupo
  // do qual o local seja membro (midia_local_grupo_membros).
  const r = await db().query<AnuncioAtivo>(
    `SELECT DISTINCT c.id AS campanha_id, c.nome, c.xibo_media_id, c.segundos,
            c.lancada_em, c.created_at
       FROM midia_campanhas c
       JOIN midia_campanha_locais cl ON cl.campanha_id = c.id
      WHERE c.status = 'no_ar'
        AND c.xibo_media_id IS NOT NULL
        AND (c.data_fim IS NULL OR c.data_fim >= CURRENT_DATE)
        AND (
          cl.local_id = $1
          OR cl.local_id IN (
            SELECT grupo_id FROM midia_local_grupo_membros WHERE membro_id = $1
          )
        )
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
  if (!dentroDaVigencia(local)) {
    console.log(`[veiculacao] local ${localId} encarte fora de vigencia — pulando regen`);
    return { ok: true, regenerado: false };
  }

  // Multi-paginas (tabela midia_encarte_paginas). Fallback pra encarte_media_id legacy.
  let paginas = await listarPaginasEncarte(localId);
  if (paginas.length === 0 && local.encarte_media_id) {
    // compat: usuario tinha encarte single antes da migration multi-paginas
    paginas = [{ id: "legacy", ordem: 0, xibo_media_id: local.encarte_media_id, duracao_seg: local.encarte_duracao_seg, nome: "legacy" }];
  }
  if (paginas.length === 0) {
    console.log(`[veiculacao] local ${localId} sem paginas de encarte — pulando regen`);
    return { ok: true, regenerado: false };
  }

  // Display group do local (cria se nao tiver)
  let dg = local.xibo_display_group_id;
  if (!dg) {
    dg = await criarDisplayGroup(`Local — ${local.nome}`, local.cidade ?? "");
    await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1 WHERE id = $2`, [dg, localId]);
  }

  const anuncios = await listarAnunciosAtivosNoLocal(localId);

  // Monta sequencia: BLOCO completo de paginas entre cada anuncio.
  // [pag1, pag2, ..., pagN, ad1, pag1, pag2, ..., pagN, ad2, ...]
  // Se 0 anuncios: so o bloco em loop infinito do Xibo.
  const itens: Array<{ mediaId: number; duracaoSeg?: number }> = [];
  const bloco = paginas.map(p => ({ mediaId: p.xibo_media_id, duracaoSeg: p.duracao_seg }));
  if (anuncios.length === 0) {
    itens.push(...bloco);
  } else {
    for (const a of anuncios) {
      itens.push(...bloco);
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
 * Faz upload do encarte do local (1 ou mais paginas). REPLACE-mode: cada chamada
 * substitui TODAS as paginas anteriores (mais simples que append+reorder por ora).
 * Cada arquivo vira uma linha em midia_encarte_paginas. Tambem atualiza vigencia.
 */
export async function definirEncarteDoLocal(localId: string, opts: {
  arquivos: Array<{ arquivo: Buffer | Blob; nomeArquivo: string; mime?: string }>;
  inicio?: string | null; fim?: string | null; duracaoSeg?: number;
}): Promise<{ ok: boolean; erro?: string; paginas?: number; regenerado?: boolean }> {
  await ensureSchema();
  const p = db();
  const local = await carregarLocal(localId);
  if (!local) return { ok: false, erro: "local nao encontrado" };
  if (!opts.arquivos.length) return { ok: false, erro: "nenhum arquivo enviado" };

  // Upload cada arquivo no Xibo (mantem se algum falhar, mas registra)
  const novasPaginas: Array<{ mediaId: number; nome: string; blob: Buffer | null; mime: string | null }> = [];
  for (const a of opts.arquivos) {
    try {
      const mediaId = await uploadMediaSimples(a.arquivo, a.nomeArquivo, ROOT_FOLDER);
      const blob = Buffer.isBuffer(a.arquivo)
        ? (a.arquivo.length <= 100 * 1024 * 1024 ? a.arquivo : null)
        : (a.arquivo.size <= 100 * 1024 * 1024 ? Buffer.from(await a.arquivo.arrayBuffer()) : null);
      novasPaginas.push({ mediaId, nome: a.nomeArquivo, blob, mime: a.mime ?? null });
    } catch (e) {
      console.warn(`[veiculacao] upload encarte pagina '${a.nomeArquivo}' falhou:`, (e as Error).message);
    }
  }
  if (!novasPaginas.length) return { ok: false, erro: "todos os uploads falharam" };

  const duracao = opts.duracaoSeg && opts.duracaoSeg > 0 ? opts.duracaoSeg : (local.encarte_duracao_seg || 10);

  // REPLACE-mode: apaga paginas antigas + insere as novas (ordem = ordem do array)
  await p.query(`DELETE FROM midia_encarte_paginas WHERE local_id = $1`, [localId]);
  for (let i = 0; i < novasPaginas.length; i++) {
    const pg = novasPaginas[i];
    await p.query(
      `INSERT INTO midia_encarte_paginas (local_id, ordem, nome, xibo_media_id, duracao_seg, arquivo_bytes, arquivo_mime)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [localId, i, pg.nome, pg.mediaId, duracao, pg.blob, pg.mime]
    );
  }

  // Atualiza metadados no local (vigencia + duracao default + nome resumo) e
  // atualiza fields legacy single (compat). Marca plano = encarte_totem.
  const nomeResumo = novasPaginas.length === 1
    ? novasPaginas[0].nome
    : `${novasPaginas.length} páginas (${novasPaginas[0].nome}…)`;
  await p.query(
    `UPDATE midia_locais
        SET encarte_media_id = $1, encarte_nome = $2,
            encarte_inicio = COALESCE($3, encarte_inicio),
            encarte_fim    = COALESCE($4, encarte_fim),
            encarte_duracao_seg = $5,
            encarte_arquivo_bytes = $6, encarte_arquivo_mime = $7,
            plano_veiculacao = CASE WHEN plano_veiculacao = 'publicidade' THEN 'encarte_totem' ELSE plano_veiculacao END,
            updated_at = NOW()
      WHERE id = $8`,
    [novasPaginas[0].mediaId, nomeResumo, opts.inicio ?? null, opts.fim ?? null,
     duracao, novasPaginas[0].blob, novasPaginas[0].mime, localId]
  );

  // Dispara regeneracao imediata
  const r = await regenerarLayoutDoLocal(localId);
  return { ok: true, paginas: novasPaginas.length, regenerado: r.regenerado };
}

/**
 * APPEND-mode: adiciona paginas no final da fila do encarte (sem apagar
 * as anteriores). Util pra UI de "fila" onde o usuario acumula designs.
 */
export async function adicionarPaginasEncarte(localId: string, opts: {
  arquivos: Array<{ arquivo: Buffer | Blob; nomeArquivo: string; mime?: string }>;
  duracaoSeg?: number;
}): Promise<{ ok: boolean; erro?: string; adicionadas?: number; total?: number; regenerado?: boolean }> {
  await ensureSchema();
  const p = db();
  const local = await carregarLocal(localId);
  if (!local) return { ok: false, erro: "local nao encontrado" };
  if (!opts.arquivos.length) return { ok: false, erro: "nenhum arquivo enviado" };

  const novas: Array<{ mediaId: number; nome: string; blob: Buffer | null; mime: string | null }> = [];
  for (const a of opts.arquivos) {
    try {
      const mediaId = await uploadMediaSimples(a.arquivo, a.nomeArquivo, ROOT_FOLDER);
      const blob = Buffer.isBuffer(a.arquivo)
        ? (a.arquivo.length <= 100 * 1024 * 1024 ? a.arquivo : null)
        : (a.arquivo.size <= 100 * 1024 * 1024 ? Buffer.from(await a.arquivo.arrayBuffer()) : null);
      novas.push({ mediaId, nome: a.nomeArquivo, blob, mime: a.mime ?? null });
    } catch (e) {
      console.warn(`[veiculacao] upload encarte pagina '${a.nomeArquivo}' falhou:`, (e as Error).message);
    }
  }
  if (!novas.length) return { ok: false, erro: "todos os uploads falharam" };

  const duracao = opts.duracaoSeg && opts.duracaoSeg > 0 ? opts.duracaoSeg : (local.encarte_duracao_seg || 10);
  const maxOrdem = await p.query<{ max: number | null }>(
    `SELECT MAX(ordem) AS max FROM midia_encarte_paginas WHERE local_id = $1`, [localId]
  ).then(r => r.rows[0]?.max ?? -1);

  let ordem = (maxOrdem ?? -1) + 1;
  for (const pg of novas) {
    await p.query(
      `INSERT INTO midia_encarte_paginas (local_id, ordem, nome, xibo_media_id, duracao_seg, arquivo_bytes, arquivo_mime)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [localId, ordem++, pg.nome, pg.mediaId, duracao, pg.blob, pg.mime]
    );
  }

  // Garante plano = encarte_totem se ainda estava em publicidade + atualiza nome resumo
  const total = await p.query<{ n: string; primeiro: string | null }>(
    `SELECT COUNT(*)::text AS n, (SELECT nome FROM midia_encarte_paginas WHERE local_id = $1 ORDER BY ordem ASC LIMIT 1) AS primeiro
       FROM midia_encarte_paginas WHERE local_id = $1`, [localId]
  ).then(r => r.rows[0]);
  const nTotal = parseInt(total?.n ?? "0", 10);
  const nomeResumo = nTotal === 1 ? (total?.primeiro ?? "encarte") : `${nTotal} páginas (${total?.primeiro ?? ""}…)`;
  await p.query(
    `UPDATE midia_locais
        SET encarte_nome = $1,
            encarte_duracao_seg = COALESCE(NULLIF(encarte_duracao_seg, 0), $2),
            plano_veiculacao = CASE WHEN plano_veiculacao = 'publicidade' THEN 'encarte_totem' ELSE plano_veiculacao END,
            updated_at = NOW()
      WHERE id = $3`,
    [nomeResumo, duracao, localId]
  );

  const r = await regenerarLayoutDoLocal(localId);
  return { ok: true, adicionadas: novas.length, total: nTotal, regenerado: r.regenerado };
}

/** Remove uma pagina especifica do encarte e regenera o layout. */
export async function removerPaginaEncarte(localId: string, paginaId: string): Promise<{
  ok: boolean; erro?: string; restantes?: number; regenerado?: boolean
}> {
  await ensureSchema();
  const p = db();
  const local = await carregarLocal(localId);
  if (!local) return { ok: false, erro: "local nao encontrado" };

  const del = await p.query(`DELETE FROM midia_encarte_paginas WHERE id = $1 AND local_id = $2`, [paginaId, localId]);
  if (del.rowCount === 0) return { ok: false, erro: "pagina nao encontrada" };

  // Recompacta ordens (0..n-1) pra evitar buracos
  const rest = await p.query<{ id: string }>(
    `SELECT id FROM midia_encarte_paginas WHERE local_id = $1 ORDER BY ordem ASC, criada_em ASC`, [localId]
  ).then(r => r.rows);
  for (let i = 0; i < rest.length; i++) {
    await p.query(`UPDATE midia_encarte_paginas SET ordem = $1 WHERE id = $2`, [i, rest[i].id]);
  }

  // Atualiza nome resumo
  if (rest.length === 0) {
    await p.query(`UPDATE midia_locais SET encarte_nome = NULL, encarte_media_id = NULL, updated_at = NOW() WHERE id = $1`, [localId]);
  } else {
    const primeiro = await p.query<{ nome: string | null; xibo_media_id: number }>(
      `SELECT nome, xibo_media_id FROM midia_encarte_paginas WHERE local_id = $1 ORDER BY ordem ASC LIMIT 1`, [localId]
    ).then(r => r.rows[0]);
    const nomeResumo = rest.length === 1 ? (primeiro?.nome ?? "encarte") : `${rest.length} páginas (${primeiro?.nome ?? ""}…)`;
    await p.query(
      `UPDATE midia_locais SET encarte_nome = $1, encarte_media_id = $2, updated_at = NOW() WHERE id = $3`,
      [nomeResumo, primeiro?.xibo_media_id ?? null, localId]
    );
  }

  const r = await regenerarLayoutDoLocal(localId);
  return { ok: true, restantes: rest.length, regenerado: r.regenerado };
}

/** Reordena as paginas do encarte (array de ids na nova ordem). */
export async function reordenarPaginasEncarte(localId: string, ordemIds: string[]): Promise<{
  ok: boolean; erro?: string; regenerado?: boolean
}> {
  await ensureSchema();
  const p = db();
  if (!ordemIds.length) return { ok: false, erro: "ordem vazia" };

  // Valida que todos os ids pertencem ao local
  const existentes = await p.query<{ id: string }>(
    `SELECT id FROM midia_encarte_paginas WHERE local_id = $1`, [localId]
  ).then(r => r.rows.map(x => x.id));
  for (const id of ordemIds) {
    if (!existentes.includes(id)) return { ok: false, erro: `pagina ${id} nao pertence ao local` };
  }
  if (ordemIds.length !== existentes.length) return { ok: false, erro: "ordem incompleta (faltam ids)" };

  for (let i = 0; i < ordemIds.length; i++) {
    await p.query(`UPDATE midia_encarte_paginas SET ordem = $1 WHERE id = $2 AND local_id = $3`, [i, ordemIds[i], localId]);
  }

  const r = await regenerarLayoutDoLocal(localId);
  return { ok: true, regenerado: r.regenerado };
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

  // CRITICO PRA SYNC: usa MESMA duracao em TODAS as telas. Pega a mediana das
  // duracoes configuradas (ou 10s default) pra evitar drift por slots de
  // tamanhos diferentes. Anuncios mantem suas duracoes proprias (mas tambem
  // sao iguais entre telas porque vem da mesma midia_campanhas).
  const dursPorTela = telas.filter(t => t.gondola_media_id).map(t => t.gondola_duracao_seg || 10);
  dursPorTela.sort((a, b) => a - b);
  const duracaoComum = dursPorTela[Math.floor(dursPorTela.length / 2)] || 10;
  if (dursPorTela.some(d => d !== duracaoComum)) {
    console.warn(`[veiculacao] local ${localId}: duracoes diferentes entre telas (${dursPorTela.join(",")}s) — normalizando pra ${duracaoComum}s pra evitar drift`);
  }

  let n = 0;
  const novosLayouts: number[] = [];
  for (const tela of telas) {
    if (!tela.gondola_media_id || !tela.xibo_display_id) continue;
    const itens: Array<{ mediaId: number; duracaoSeg?: number }> = [];
    if (anuncios.length === 0) {
      itens.push({ mediaId: tela.gondola_media_id, duracaoSeg: duracaoComum });
    } else {
      for (const a of anuncios) {
        itens.push({ mediaId: tela.gondola_media_id, duracaoSeg: duracaoComum });
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
      novosLayouts.push(novo.layoutId);
      n++;
    } catch (e) {
      console.warn(`[veiculacao] tela ${tela.id} regen falhou:`, (e as Error).message);
    }
  }

  // Dispara collectNow + sync relogio em todas as TVs juntas pra alinhar inicio
  // Importa lazy pra evitar ciclo de import
  try {
    const { sincronizarRelogioDoGrupo } = await import("./sync-relogio");
    await sincronizarRelogioDoGrupo(dg);
    console.log(`[veiculacao] sync relogio + collect disparado pro grupo ${dg} (${n} telas)`);
  } catch (e) {
    console.warn("[veiculacao] sync-relogio pos-regen falhou:", (e as Error).message);
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
