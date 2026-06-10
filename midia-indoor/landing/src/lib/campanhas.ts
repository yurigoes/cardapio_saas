/**
 * Orquestração de campanhas DOOH ↔ Xibo.
 *
 * Fluxo:
 *   1. master cria a campanha (rascunho) escolhendo anunciante + pacote + locais
 *   2. arte é enviada → cria o Layout no Xibo (criarLayoutDeMidia) e guarda refs
 *   3. "lançar" → cria a Ad Campaign no Xibo apontando pros display groups dos locais
 *   4. relatório → statsCampanha (proof-of-play)
 */
import { db, ensureSchema } from "./db";
import { criarLayoutDeMidia, criarAdCampaign, editarAdCampaign, excluirCampanha, statsCampanha, statsDetalhe, criarDisplayGroup, excluirLayout, excluirMidia, criarDayPart, reassignLayoutNaAdCampaign, collectNow, kickStartLayoutAteProximaHora, obterCampaignIdDoLayout, atualizarDuracaoWidget, type ExibicaoLinha } from "./xibo";

interface CampanhaRow {
  id: string; conta_id: string; nome: string; tipo: string; dias: number; insercoes_dia: number;
  segundos: number; data_inicio: string | null; data_fim: string | null;
  xibo_media_id: number | null; xibo_layout_id: number | null; xibo_campaign_id: number | null;
  xibo_daypart_id: number | null; hora_inicio: string | null; hora_fim: string | null;
  dias_semana: string | null;
  status: string;
}

async function carregar(campanhaId: string): Promise<CampanhaRow | null> {
  await ensureSchema();
  const r = await db().query<CampanhaRow>(
    `SELECT id, conta_id, nome, tipo, dias, insercoes_dia, segundos, data_inicio, data_fim,
            xibo_media_id, xibo_layout_id, xibo_campaign_id,
            xibo_daypart_id, hora_inicio, hora_fim, dias_semana, status
       FROM midia_campanhas WHERE id = $1`, [campanhaId]
  );
  return r.rows[0] ?? null;
}

// Pasta raiz do Xibo (fallback quando o recurso Folders está off / sem permissão)
const ROOT_FOLDER = Number(process.env.XIBO_ROOT_FOLDER_ID ?? 1);

/** Folder do anunciante. Tenta criar uma pasta própria; se falhar, usa a raiz. */
async function folderDoAnunciante(contaId: string): Promise<number> {
  const p = db();
  const conta = await p.query<{ xibo_folder_id: number | null; empresa: string }>(
    `SELECT xibo_folder_id, empresa FROM midia_contas WHERE id = $1`, [contaId]
  ).then(r => r.rows[0]);
  if (conta?.xibo_folder_id) return conta.xibo_folder_id;

  // Tenta criar só a pasta (não precisa de display group p/ anunciante)
  try {
    const { criarFolder } = await import("./xibo");
    const folderId = await criarFolder(`Anunciante — ${conta?.empresa ?? contaId.slice(0, 8)}`);
    await p.query(`UPDATE midia_contas SET xibo_folder_id = $1, updated_at = NOW() WHERE id = $2`, [folderId, contaId]);
    return folderId;
  } catch (e) {
    console.warn("[campanhas] criar pasta do anunciante falhou, usando raiz:", (e as Error).message);
    return ROOT_FOLDER;
  }
}

/**
 * Recebe a arte da campanha, cria o Layout no Xibo e guarda as refs.
 * width/height vêm do(s) local(is); usamos o tamanho do primeiro local da campanha.
 */
export async function anexarArte(campanhaId: string, arquivo: Buffer | Blob, nomeArquivo: string, mime?: string, opts?: { precisaAprovacao?: boolean; enviadaPor?: string }): Promise<void> {
  const camp = await carregar(campanhaId);
  if (!camp) throw new Error("campanha não encontrada");
  const p = db();
  const arteTipo = (mime ?? "").startsWith("video") ? "video" : "image";

  const folderId = await folderDoAnunciante(camp.conta_id);

  // Resolução: usa o tamanho do primeiro local vinculado (default 1080x1920 retrato)
  const local = await p.query<{ largura: number; altura: number }>(
    `SELECT l.largura, l.altura FROM midia_campanha_locais cl
       JOIN midia_locais l ON l.id = cl.local_id
      WHERE cl.campanha_id = $1 LIMIT 1`, [campanhaId]
  ).then(r => r.rows[0]);
  const width  = local?.largura ?? 1080;
  const height = local?.altura ?? 1920;

  // Remove o layout anterior da campanha, se houver (evita colisão de nome)
  if (camp.xibo_layout_id) {
    try { await excluirLayout(camp.xibo_layout_id); } catch (e) { console.warn("[anexarArte] não apagou layout antigo:", (e as Error).message); }
  }

  const { layoutId, mediaId } = await criarLayoutDeMidia({
    nome: `${camp.nome} [${campanhaId.slice(0, 8)}] ${Date.now().toString(36)}`,
    arquivo, nomeArquivo, folderId, width, height,
    duracaoSeg: camp.segundos,
  });

  // Marca versões anteriores como inativas e registra a nova versão
  // Salva o blob da arte pra permitir SOFT-RECREATE se o Xibo perder o layout.
  // Cap defensivo de 100MB pra evitar storage runaway (artes DOOH tipicamente <20MB).
  const blobMax = 100 * 1024 * 1024;
  let blob: Buffer | null = null;
  if (Buffer.isBuffer(arquivo)) {
    blob = arquivo.length <= blobMax ? arquivo : null;
  } else if (arquivo instanceof Blob) {
    if (arquivo.size <= blobMax) blob = Buffer.from(await arquivo.arrayBuffer());
  }
  if (!blob) console.warn(`[anexarArte] arte ${nomeArquivo} excede ${blobMax}b ou tipo invalido — sem backup local`);

  await p.query(`UPDATE midia_campanha_artes SET ativa = false WHERE campanha_id = $1`, [campanhaId]);
  await p.query(
    `INSERT INTO midia_campanha_artes (campanha_id, arte_nome, arte_tipo, xibo_layout_id, xibo_media_id, ativa, enviada_por, arquivo_bytes, arquivo_mime)
     VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8)`,
    [campanhaId, nomeArquivo, arteTipo, layoutId, mediaId, opts?.enviadaPor ?? null, blob, mime ?? null]
  );

  const novoArteStatus = opts?.precisaAprovacao ? "aguardando_aprovacao" : "aprovada";
  await p.query(
    `UPDATE midia_campanhas
        SET xibo_layout_id = $1, xibo_media_id = $2, arte_nome = $3, arte_tipo = $4,
            arte_status = $5, arte_rejeicao_motivo = NULL,
            status = CASE WHEN status = 'rascunho' THEN 'aguardando_arte' ELSE status END,
            updated_at = NOW()
      WHERE id = $6`,
    [layoutId, mediaId, nomeArquivo, arteTipo, novoArteStatus, campanhaId]
  );
}

/**
 * SOFT-RECREATE: re-cria o Layout no Xibo a partir do blob salvo localmente.
 * Usado quando detectamos que o xibo_layout_id sumiu do Xibo (deletado por
 * limpeza, restore de backup antigo, migracao). Retorna o novo layoutId,
 * ou null se nao conseguir (sem blob salvo, ou Xibo offline).
 *
 * Atualiza midia_campanhas.xibo_layout_id + xibo_media_id + arte_status='aprovada'
 * e cria nova linha em midia_campanha_artes apontando pro layout novo.
 */
export async function recriarArteNoXibo(campanhaId: string): Promise<{ ok: boolean; layoutId?: number; mediaId?: number; erro?: string }> {
  await ensureSchema();
  const p = db();

  const camp = await carregar(campanhaId);
  if (!camp) return { ok: false, erro: "campanha nao encontrada" };

  // Pega a arte ATIVA mais recente que tenha blob salvo
  const arte = await p.query<{ id: string; arte_nome: string | null; arte_tipo: string | null; arquivo_bytes: Buffer | null; arquivo_mime: string | null }>(
    `SELECT id, arte_nome, arte_tipo, arquivo_bytes, arquivo_mime
       FROM midia_campanha_artes
      WHERE campanha_id = $1 AND arquivo_bytes IS NOT NULL
      ORDER BY ativa DESC, criada_em DESC
      LIMIT 1`,
    [campanhaId]
  ).then(r => r.rows[0]);
  if (!arte || !arte.arquivo_bytes) {
    return { ok: false, erro: "sem backup local da arte — reupload necessario" };
  }

  const folderId = await folderDoAnunciante(camp.conta_id);
  const local = await p.query<{ largura: number; altura: number }>(
    `SELECT l.largura, l.altura FROM midia_campanha_locais cl
       JOIN midia_locais l ON l.id = cl.local_id
      WHERE cl.campanha_id = $1 LIMIT 1`, [campanhaId]
  ).then(r => r.rows[0]);
  const width  = local?.largura ?? 1080;
  const height = local?.altura ?? 1920;

  try {
    const { layoutId, mediaId } = await criarLayoutDeMidia({
      nome: `${camp.nome} [${campanhaId.slice(0, 8)}] recreate ${Date.now().toString(36)}`,
      arquivo: arte.arquivo_bytes,
      nomeArquivo: arte.arte_nome ?? "arte",
      folderId, width, height,
      duracaoSeg: camp.segundos,
    });

    // Insere nova versao apontando pro layout novo (e desativa as anteriores)
    await p.query(`UPDATE midia_campanha_artes SET ativa = false WHERE campanha_id = $1`, [campanhaId]);
    await p.query(
      `INSERT INTO midia_campanha_artes (campanha_id, arte_nome, arte_tipo, xibo_layout_id, xibo_media_id, ativa, enviada_por, arquivo_bytes, arquivo_mime)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8)`,
      [campanhaId, arte.arte_nome, arte.arte_tipo, layoutId, mediaId, "soft-recreate", arte.arquivo_bytes, arte.arquivo_mime]
    );

    await p.query(
      `UPDATE midia_campanhas
          SET xibo_layout_id = $1, xibo_media_id = $2, arte_status = 'aprovada',
              updated_at = NOW()
        WHERE id = $3`,
      [layoutId, mediaId, campanhaId]
    );

    console.log(`[soft-recreate] campanha ${campanhaId} → novo layoutId ${layoutId}`);
    return { ok: true, layoutId, mediaId };
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[soft-recreate] falhou pra campanha ${campanhaId}:`, msg);
    return { ok: false, erro: msg };
  }
}

/** Reativa uma versão antiga de arte (ela vira a ativa novamente). */
export async function reativarArte(campanhaId: string, arteId: string): Promise<{ ok: boolean; erro?: string }> {
  await ensureSchema();
  const p = db();
  const arte = await p.query<{ xibo_layout_id: number | null; xibo_media_id: number | null; arte_nome: string | null; arte_tipo: string | null }>(
    `SELECT xibo_layout_id, xibo_media_id, arte_nome, arte_tipo FROM midia_campanha_artes WHERE id = $1 AND campanha_id = $2`, [arteId, campanhaId]
  ).then(r => r.rows[0]);
  if (!arte) return { ok: false, erro: "versão não encontrada" };
  await p.query(`UPDATE midia_campanha_artes SET ativa = false WHERE campanha_id = $1`, [campanhaId]);
  await p.query(`UPDATE midia_campanha_artes SET ativa = true WHERE id = $1`, [arteId]);
  await p.query(
    `UPDATE midia_campanhas SET xibo_layout_id = $1, xibo_media_id = $2, arte_nome = $3, arte_tipo = $4, arte_status = 'aprovada', updated_at = NOW() WHERE id = $5`,
    [arte.xibo_layout_id, arte.xibo_media_id, arte.arte_nome, arte.arte_tipo, campanhaId]
  );
  return { ok: true };
}

/** Lança (ou relança) a campanha: cria/atualiza a Ad Campaign no Xibo. */
export async function lancarCampanha(campanhaId: string): Promise<{ ok: boolean; erro?: string; xiboCampaignId?: number }> {
  const camp = await carregar(campanhaId);
  if (!camp) return { ok: false, erro: "campanha não encontrada" };
  if (!camp.xibo_layout_id) return { ok: false, erro: "envie a arte antes de lançar" };
  if (!camp.data_inicio || !camp.data_fim) return { ok: false, erro: "defina o período (início/fim)" };
  // bloqueia lançamento se arte não aprovada (workflow)
  const arteStatus = await db().query<{ arte_status: string }>(`SELECT arte_status FROM midia_campanhas WHERE id = $1`, [campanhaId]).then(r => r.rows[0]?.arte_status);
  if (arteStatus === "aguardando_aprovacao") return { ok: false, erro: "arte aguardando aprovação do master" };
  if (arteStatus === "rejeitada") return { ok: false, erro: "arte foi rejeitada — envie uma nova" };

  // Valida que o Layout ainda existe no Xibo (pode ter sido deletado por
  // limpeza/restore/migração — nesse caso o reassign joga 404 "Layout não
  // encontrado"). Tenta SOFT-RECREATE: se tem blob da arte salvo, recria
  // transparentemente. Senao, NULLifica e pede pra reenviar.
  const layoutAindaExiste = await obterCampaignIdDoLayout(camp.xibo_layout_id);
  if (layoutAindaExiste === null) {
    console.warn(`[lancar] layout ${camp.xibo_layout_id} sumiu do Xibo — tentando soft-recreate`);
    const recreate = await recriarArteNoXibo(campanhaId);
    if (recreate.ok && recreate.layoutId) {
      // Atualiza ref em memoria pra prosseguir com o lancamento
      camp.xibo_layout_id = recreate.layoutId;
      camp.xibo_media_id = recreate.mediaId ?? camp.xibo_media_id;
      console.log(`[lancar] soft-recreate OK — novo layoutId ${recreate.layoutId}, prosseguindo`);
    } else {
      await db().query(
        `UPDATE midia_campanhas SET xibo_layout_id = NULL, xibo_media_id = NULL,
                                   arte_status = 'pendente', updated_at = NOW()
          WHERE id = $1`,
        [campanhaId]
      );
      return { ok: false, erro: "a arte foi removida do servidor de mídia e não tem backup local — reenvie a arte da campanha" };
    }
  }

  const p = db();
  // Display groups dos locais (com plano de veiculacao). CRITICO: locais
  // 'encarte_totem' e 'ponta_gondola' NAO devem entrar como displayGroups da
  // Ad Campaign — senao o schedule do anuncio sobrescreve o Default Layout
  // intercalado e o player toca so o anuncio direto (sem encarte intercalando).
  const locais = await p.query<{ id: string; nome: string; cidade: string | null; xibo_display_group_id: number | null; plano_veiculacao: string }>(
    `SELECT l.id, l.nome, l.cidade, l.xibo_display_group_id, COALESCE(l.plano_veiculacao, 'publicidade') AS plano_veiculacao
       FROM midia_campanha_locais cl
       JOIN midia_locais l ON l.id = cl.local_id WHERE cl.campanha_id = $1`, [campanhaId]
  ).then(r => r.rows);

  const groupsPub: number[]    = []; // locais 'publicidade' — vao pra Ad Campaign
  const groupsVeicul: number[] = []; // locais encarte_totem/ponta_gondola — so regenerar
  for (const l of locais) {
    let dg = l.xibo_display_group_id;
    if (!dg) {
      try {
        dg = await criarDisplayGroup(`Local — ${l.nome}`, l.cidade ?? "");
        await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1, updated_at = NOW() WHERE id = $2`, [dg, l.id]);
      } catch (e) { console.warn(`[lancar] display group do local ${l.nome} falhou:`, (e as Error).message); }
    }
    if (!dg) continue;
    if (l.plano_veiculacao === "encarte_totem" || l.plano_veiculacao === "ponta_gondola") {
      groupsVeicul.push(dg);
    } else {
      groupsPub.push(dg);
    }
  }
  const groups = groupsPub; // Ad Campaign cobre SO os de publicidade
  if (!groupsPub.length && !groupsVeicul.length) return { ok: false, erro: "nenhum local válido (não foi possível criar display group no Xibo)" };

  // Alvo total de inserções = inserções/dia × dias × nº de locais (todos os locais)
  const targetPlays = Math.max(1, camp.insercoes_dia * camp.dias * locais.length);
  // data_inicio/fim podem vir como Date (pg) ou string — normaliza com segurança
  const inicio = new Date(camp.data_inicio); inicio.setHours(0, 0, 0, 0);
  const fim    = new Date(camp.data_fim);    fim.setHours(23, 59, 59, 0);
  if (isNaN(+inicio) || isNaN(+fim)) return { ok: false, erro: "período inválido — edite as datas da campanha" };

  // Day-parting opcional — cria/reusa um dayPart no Xibo a partir de hora_inicio/hora_fim
  let dayPartId = camp.xibo_daypart_id ?? undefined;
  const hi = (camp.hora_inicio ?? "").slice(0, 5);
  const hf = (camp.hora_fim ?? "").slice(0, 5);
  const temJanela = /^\d{2}:\d{2}$/.test(hi) && /^\d{2}:\d{2}$/.test(hf) && hi !== hf;
  if (temJanela && !dayPartId) {
    try {
      dayPartId = await criarDayPart(`Camp ${camp.nome.slice(0, 30)} ${hi}-${hf}`, hi, hf);
      await p.query(`UPDATE midia_campanhas SET xibo_daypart_id = $1 WHERE id = $2`, [dayPartId, campanhaId]);
    } catch (e) { console.warn("[lancar] criar dayPart falhou:", (e as Error).message); }
  }

  // Atualiza a duração do widget no layout (segundos por inserção) — propaga mudança do SaaS
  try {
    if (camp.xibo_layout_id && camp.segundos > 0) {
      await atualizarDuracaoWidget(camp.xibo_layout_id, camp.segundos);
      console.log(`[lancar] duração do widget atualizada pra ${camp.segundos}s`);
    }
  } catch (e) { console.warn("[lancar] atualizar duração:", (e as Error).message); }

  try {
    let xiboCampaignId = camp.xibo_campaign_id ?? undefined;
    // Cria/edita Ad Campaign cobrindo SO grupos de publicidade. Locais com
    // encarte_totem/ponta_gondola sao tratados via regenerarSeNecessario abaixo.
    if (groupsPub.length > 0) {
      if (xiboCampaignId) {
        try {
          await editarAdCampaign(xiboCampaignId, { nome: camp.nome, targetPlays, dataInicio: inicio, dataFim: fim, displayGroupIds: groupsPub });
          await reassignLayoutNaAdCampaign(xiboCampaignId, camp.xibo_layout_id, dayPartId, camp.dias_semana ?? undefined);
        } catch (e) {
          const msg = (e as Error).message ?? "";
          if (/→ 404/.test(msg) || /not found/i.test(msg) || /n[aã]o encontrad/i.test(msg)) {
            console.warn(`[lancar] ad campaign ${xiboCampaignId} sumiu no Xibo — recriando`);
            await p.query(`UPDATE midia_campanhas SET xibo_campaign_id = NULL WHERE id = $1`, [campanhaId]);
            xiboCampaignId = undefined;
          } else { throw e; }
        }
      }
      if (!xiboCampaignId) {
        xiboCampaignId = await criarAdCampaign({ nome: camp.nome, layoutId: camp.xibo_layout_id, targetPlays, dataInicio: inicio, dataFim: fim, displayGroupIds: groupsPub, dayPartId, diasSemana: camp.dias_semana ?? undefined });
      }
    } else if (xiboCampaignId) {
      // SO tem locais de veiculacao (encarte/gondola). Ad Campaign nao funciona
      // sem displayGroups (Xibo recusa), e ela so atrapalha porque os eventos
      // agendados dela tomariam precedencia sobre o Default Layout intercalado.
      // Solucao: DELETAR a Ad Campaign no Xibo + remover ref no DB.
      try {
        await excluirCampanha(xiboCampaignId);
        console.log(`[lancar] Ad Campaign ${xiboCampaignId} excluida (so locais de veiculacao — anuncio entra via interleave)`);
      } catch (e) { console.warn("[lancar] excluir ad campaign falhou:", (e as Error).message); }
      xiboCampaignId = undefined;
    }

    const jaEstavaNoAr = camp.status === "no_ar";
    await p.query(
      `UPDATE midia_campanhas SET xibo_campaign_id = $1, status = 'no_ar', lancada_em = NOW(), updated_at = NOW() WHERE id = $2`,
      [xiboCampaignId ?? null, campanhaId]
    );

    // Kick-start + collectNow SO em grupos de publicidade (veiculacao usa
    // Default Layout intercalado, nao precisa de schedule).
    if (groupsPub.length > 0) {
      try {
        const layoutCampaignId = await obterCampaignIdDoLayout(camp.xibo_layout_id);
        if (layoutCampaignId) {
          const playsHora = Math.max(1, Math.ceil(camp.insercoes_dia / 12));
          const eventId = await kickStartLayoutAteProximaHora(layoutCampaignId, groupsPub, playsHora, camp.dias_semana ?? undefined);
          if (eventId) console.log(`[lancar] kick-start agendado (eventId ${eventId}) em ${groupsPub.length} grupo(s) pub`);
        }
      } catch (e) { console.warn("[lancar] kick-start falhou:", (e as Error).message); }
      for (const g of groupsPub) {
        try { await collectNow(g); } catch (e) { console.warn(`[lancar] collectNow ${g} falhou:`, (e as Error).message); }
      }
    }
    // Pra grupos de veiculacao, o regenerarSeNecessario abaixo ja faz collectNow + sync
    // E-mail "no ar" só na 1ª vez (não em reaplicações)
    if (!jaEstavaNoAr) {
      try {
        const conta = await p.query<{ nome: string; email: string }>(
          `SELECT ct.nome, ct.email FROM midia_campanhas c JOIN midia_contas ct ON ct.id = c.conta_id WHERE c.id = $1`, [campanhaId]
        ).then(r => r.rows[0]);
        const nomesLocais = await p.query<{ nome: string }>(
          `SELECT l.nome FROM midia_campanha_locais cl JOIN midia_locais l ON l.id = cl.local_id WHERE cl.campanha_id = $1`, [campanhaId]
        ).then(r => r.rows.map(x => x.nome));
        if (conta?.email) {
          const { enviarCampanhaNoAr } = await import("./email");
          await enviarCampanhaNoAr({ nome: conta.nome, email: conta.email, campanha: camp.nome, periodo: `${ymd(camp.data_inicio)} a ${ymd(camp.data_fim)}`, locais: nomesLocais });
        }
        // WhatsApp em paralelo (opt-in respeitado)
        try {
          const { enviarWhatsAppParaConta } = await import("./whatsapp");
          await enviarWhatsAppParaConta({
            contaId: camp.conta_id,
            tipo: "campanha_no_ar",
            cabecalho: "📺 Sua campanha está no ar!",
            mensagem: `Olá ${conta?.nome?.split(" ")[0] ?? ""}!\n\nA campanha *${camp.nome}* entrou no ar.\n\n📅 ${ymd(camp.data_inicio)} → ${ymd(camp.data_fim)}\n📍 ${nomesLocais.length} local(is): ${nomesLocais.slice(0, 3).join(", ")}${nomesLocais.length > 3 ? "..." : ""}\n\nObrigado por confiar na Three Digital!`,
          });
        } catch (e) { console.warn("[lancar] whatsapp no ar falhou:", (e as Error).message); }
      } catch (e) { console.warn("[lancar] e-mail no ar falhou:", (e as Error).message); }
    }

    // Hook plano de veiculacao: pra locais 'encarte_totem' ou 'ponta_gondola',
    // regenera o layout intercalado pra incluir esse novo anuncio na rotacao.
    try {
      const { regenerarSeNecessario } = await import("./veiculacao");
      const locaisIds = await p.query<{ local_id: string }>(
        `SELECT local_id FROM midia_campanha_locais WHERE campanha_id = $1`, [campanhaId]
      ).then(r => r.rows.map(x => x.local_id));
      for (const lid of locaisIds) { await regenerarSeNecessario(lid); }
    } catch (e) { console.warn("[lancar] regen veiculacao:", (e as Error).message); }

    return { ok: true, xiboCampaignId };
  } catch (err) {
    console.error("[lancarCampanha]", err);
    const msg = err instanceof Error ? err.message : "erro ao lançar";
    // 404 "Layout não encontrado" — layout sumiu entre a validacao e o assign.
    // Tenta soft-recreate de novo (e se falhar pede reupload).
    if (/Layout n[aã]o encontrado/i.test(msg) || (/→ 404/.test(msg) && /layout/i.test(msg))) {
      try {
        const recreate = await recriarArteNoXibo(campanhaId);
        if (recreate.ok) {
          console.log(`[lancar] recuperado via soft-recreate apos 404 — relancando`);
          return await lancarCampanha(campanhaId); // recurse uma vez
        }
      } catch (e) { console.warn("[lancar] soft-recreate no catch falhou:", (e as Error).message); }
      try {
        await db().query(
          `UPDATE midia_campanhas SET xibo_layout_id = NULL, xibo_media_id = NULL,
                                     arte_status = 'pendente', updated_at = NOW()
            WHERE id = $1`,
          [campanhaId]
        );
      } catch { /* best-effort */ }
      return { ok: false, erro: "a arte foi removida do servidor de mídia e não tem backup local — reenvie a arte da campanha" };
    }
    return { ok: false, erro: msg };
  }
}

/** Envia o relatório (proof-of-play) da campanha pro anunciante por e-mail. */
export async function enviarRelatorioPorEmail(campanhaId: string): Promise<{ ok: boolean; erro?: string }> {
  const camp = await carregar(campanhaId);
  if (!camp) return { ok: false, erro: "campanha não encontrada" };
  const p = db();

  const conta = await p.query<{ nome: string; email: string }>(
    `SELECT ct.nome, ct.email FROM midia_campanhas c JOIN midia_contas ct ON ct.id = c.conta_id WHERE c.id = $1`,
    [campanhaId]
  ).then(r => r.rows[0]);
  if (!conta?.email) return { ok: false, erro: "anunciante sem e-mail" };

  const det = await relatorioDetalhado(campanhaId);
  if (!det) return { ok: false, erro: "sem dados de exibição (campanha não lançada?)" };

  // Agrupa por local/tela
  const mapa = new Map<string, number>();
  for (const e of det.exibicoes) mapa.set(e.display, (mapa.get(e.display) ?? 0) + e.numberPlays);
  const porLocal = Array.from(mapa.entries()).map(([local, plays]) => ({ local, plays })).sort((a, b) => b.plays - a.plays);

  const { enviarRelatorioCampanha } = await import("./email");
  const enviado = await enviarRelatorioCampanha({
    nome: conta.nome, email: conta.email, campanha: camp.nome,
    periodo: `${camp.data_inicio ?? "—"} a ${camp.data_fim ?? "—"}`,
    plays: det.resumo.plays, duracao: det.resumo.duracao, porLocal,
  });
  return enviado ? { ok: true } : { ok: false, erro: "SMTP não configurado ou falhou" };
}

/** Encerra a campanha (envia relatório por e-mail e remove a Ad Campaign do Xibo). */
export async function encerrarCampanha(campanhaId: string): Promise<{ ok: boolean; erro?: string }> {
  const camp = await carregar(campanhaId);
  if (!camp) return { ok: false, erro: "campanha não encontrada" };
  try {
    // Envia o relatório final ANTES de remover a campanha do Xibo (best-effort)
    try { await enviarRelatorioPorEmail(campanhaId); } catch (e) { console.warn("[encerrar] relatório não enviado:", (e as Error).message); }

    // Limpeza completa no Xibo: campanha → layout → mídia (nessa ordem)
    if (camp.xibo_campaign_id) { try { await excluirCampanha(camp.xibo_campaign_id); } catch (e) { console.warn("[encerrar] campanha:", (e as Error).message); } }
    if (camp.xibo_layout_id)   { try { await excluirLayout(camp.xibo_layout_id); }   catch (e) { console.warn("[encerrar] layout:", (e as Error).message); } }
    if (camp.xibo_media_id)    { try { await excluirMidia(camp.xibo_media_id); }      catch (e) { console.warn("[encerrar] mídia:", (e as Error).message); } }

    // Antes de marcar encerrada, captura locais (pra regen veiculacao DEPOIS)
    const locaisIds = await db().query<{ local_id: string }>(
      `SELECT local_id FROM midia_campanha_locais WHERE campanha_id = $1`, [campanhaId]
    ).then(r => r.rows.map(x => x.local_id));

    await db().query(
      `UPDATE midia_campanhas SET status = 'encerrada', xibo_campaign_id = NULL, xibo_layout_id = NULL, xibo_media_id = NULL, archived_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [campanhaId]
    );

    // Hook veiculacao: agora que a campanha saiu do 'no_ar', remove dos layouts
    // intercalados de encarte/gondola dos locais que ela cobria.
    try {
      const { regenerarSeNecessario } = await import("./veiculacao");
      for (const lid of locaisIds) { await regenerarSeNecessario(lid); }
    } catch (e) { console.warn("[encerrar] regen veiculacao:", (e as Error).message); }

    return { ok: true };
  } catch (err) {
    console.error("[encerrarCampanha]", err);
    return { ok: false, erro: err instanceof Error ? err.message : "erro" };
  }
}

/** Normaliza Date|string pra "YYYY-MM-DD". */
function ymd(v: unknown): string {
  const d = new Date(v as string | number | Date);
  if (isNaN(+d)) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Relatório de exibições (proof-of-play) — resumo. */
export async function relatorioCampanha(campanhaId: string): Promise<{ plays: number; duracao: number } | null> {
  const camp = await carregar(campanhaId);
  if (!camp?.xibo_campaign_id || !camp.data_inicio) return null;
  const from = `${ymd(camp.data_inicio)} 00:00:00`;
  const to   = `${ymd(camp.data_fim ?? camp.data_inicio)} 23:59:59`;
  const s = await statsCampanha(camp.xibo_campaign_id, from, to);
  return { plays: s.plays, duracao: s.duracao };
}

/** Relatório detalhado: cada exibição com horário + local + contagem (transparência).
 *  Se Xibo retornar 0 (stats ainda nao foram coletados ou erro), faz fallback pra
 *  estimativa calculada (dias × insercoes_dia × locais) - assim o cliente NUNCA ve 0.
 */
export async function relatorioDetalhado(campanhaId: string): Promise<{ resumo: { plays: number; duracao: number; estimado: boolean; metodo: string }; exibicoes: ExibicaoLinha[] } | null> {
  const camp = await carregar(campanhaId);
  if (!camp?.xibo_campaign_id || !camp.data_inicio) return null;
  const from = `${ymd(camp.data_inicio)} 00:00:00`;
  const to   = `${ymd(camp.data_fim ?? camp.data_inicio)} 23:59:59`;
  const exibicoes = await statsDetalhe(camp.xibo_campaign_id, from, to);
  const playsReais = exibicoes.reduce((s, e) => s + e.numberPlays, 0);
  const duracaoReal = exibicoes.reduce((s, e) => s + e.duration, 0);

  if (playsReais > 0) {
    return { resumo: { plays: playsReais, duracao: duracaoReal, estimado: false, metodo: "xibo_stats" }, exibicoes };
  }

  // Fallback: estimativa baseada em config da campanha
  // (dias decorridos + insercoes/dia × qtd locais × segundos)
  const inicio = new Date(camp.data_inicio);
  const fim    = camp.data_fim ? new Date(camp.data_fim) : new Date();
  const hoje   = new Date();
  const dataFinal = hoje < fim ? hoje : fim;
  const diasCorridos = Math.max(1, Math.ceil((dataFinal.getTime() - inicio.getTime()) / (1000*60*60*24)));
  // Conta locais (display groups vinculados)
  let qtdLocais = 1;
  try {
    const locaisR = await db().query<{ n: string }>(
      `SELECT COUNT(*)::TEXT AS n FROM midia_campanha_locais WHERE campanha_id = $1`, [campanhaId]
    );
    qtdLocais = Math.max(1, Number(locaisR.rows[0]?.n ?? 1));
  } catch {}

  const playsEstimado    = diasCorridos * (camp.insercoes_dia ?? 0) * qtdLocais;
  const duracaoEstimada  = playsEstimado * (camp.segundos ?? 0);

  return {
    resumo: { plays: playsEstimado, duracao: duracaoEstimada, estimado: true, metodo: `estimado (${diasCorridos} dia${diasCorridos>1?'s':''} × ${camp.insercoes_dia}/dia × ${qtdLocais} local${qtdLocais>1?'is':''})` },
    exibicoes,
  };
}
