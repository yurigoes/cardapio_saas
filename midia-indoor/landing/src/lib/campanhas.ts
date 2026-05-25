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
import { criarLayoutDeMidia, criarAdCampaign, editarAdCampaign, excluirCampanha, statsCampanha, statsDetalhe, criarDisplayGroup, excluirLayout, type ExibicaoLinha } from "./xibo";

interface CampanhaRow {
  id: string; conta_id: string; nome: string; tipo: string; dias: number; insercoes_dia: number;
  segundos: number; data_inicio: string | null; data_fim: string | null;
  xibo_media_id: number | null; xibo_layout_id: number | null; xibo_campaign_id: number | null;
  status: string;
}

async function carregar(campanhaId: string): Promise<CampanhaRow | null> {
  await ensureSchema();
  const r = await db().query<CampanhaRow>(
    `SELECT id, conta_id, nome, tipo, dias, insercoes_dia, segundos, data_inicio, data_fim,
            xibo_media_id, xibo_layout_id, xibo_campaign_id, status
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
export async function anexarArte(campanhaId: string, arquivo: Buffer | Blob, nomeArquivo: string, mime?: string): Promise<void> {
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

  await p.query(
    `UPDATE midia_campanhas
        SET xibo_layout_id = $1, xibo_media_id = $2, arte_nome = $3, arte_tipo = $4,
            status = CASE WHEN status = 'rascunho' THEN 'aguardando_arte' ELSE status END,
            updated_at = NOW()
      WHERE id = $5`,
    [layoutId, mediaId, nomeArquivo, arteTipo, campanhaId]
  );
}

/** Lança (ou relança) a campanha: cria/atualiza a Ad Campaign no Xibo. */
export async function lancarCampanha(campanhaId: string): Promise<{ ok: boolean; erro?: string; xiboCampaignId?: number }> {
  const camp = await carregar(campanhaId);
  if (!camp) return { ok: false, erro: "campanha não encontrada" };
  if (!camp.xibo_layout_id) return { ok: false, erro: "envie a arte antes de lançar" };
  if (!camp.data_inicio || !camp.data_fim) return { ok: false, erro: "defina o período (início/fim)" };

  const p = db();
  // Display groups dos locais — cria na hora os que ainda não têm (ex: local
  // cadastrado quando a auth do Xibo estava off).
  const locais = await p.query<{ id: string; nome: string; cidade: string | null; xibo_display_group_id: number | null }>(
    `SELECT l.id, l.nome, l.cidade, l.xibo_display_group_id FROM midia_campanha_locais cl
       JOIN midia_locais l ON l.id = cl.local_id WHERE cl.campanha_id = $1`, [campanhaId]
  ).then(r => r.rows);

  const groups: number[] = [];
  for (const l of locais) {
    let dg = l.xibo_display_group_id;
    if (!dg) {
      try {
        dg = await criarDisplayGroup(`Local — ${l.nome}`, l.cidade ?? "");
        await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1, updated_at = NOW() WHERE id = $2`, [dg, l.id]);
      } catch (e) { console.warn(`[lancar] display group do local ${l.nome} falhou:`, (e as Error).message); }
    }
    if (dg) groups.push(dg);
  }
  if (!groups.length) return { ok: false, erro: "nenhum local válido (não foi possível criar display group no Xibo)" };

  // Alvo total de inserções = inserções/dia × dias × nº de locais
  const targetPlays = camp.insercoes_dia * camp.dias * groups.length;
  // data_inicio/fim podem vir como Date (pg) ou string — normaliza com segurança
  const inicio = new Date(camp.data_inicio); inicio.setHours(0, 0, 0, 0);
  const fim    = new Date(camp.data_fim);    fim.setHours(23, 59, 59, 0);
  if (isNaN(+inicio) || isNaN(+fim)) return { ok: false, erro: "período inválido — edite as datas da campanha" };

  try {
    let xiboCampaignId = camp.xibo_campaign_id ?? undefined;
    if (xiboCampaignId) {
      await editarAdCampaign(xiboCampaignId, { nome: camp.nome, targetPlays, dataInicio: inicio, dataFim: fim, displayGroupIds: groups });
    } else {
      xiboCampaignId = await criarAdCampaign({ nome: camp.nome, layoutId: camp.xibo_layout_id, targetPlays, dataInicio: inicio, dataFim: fim, displayGroupIds: groups });
    }
    const jaEstavaNoAr = camp.status === "no_ar";
    await p.query(
      `UPDATE midia_campanhas SET xibo_campaign_id = $1, status = 'no_ar', lancada_em = NOW(), updated_at = NOW() WHERE id = $2`,
      [xiboCampaignId, campanhaId]
    );
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
      } catch (e) { console.warn("[lancar] e-mail no ar falhou:", (e as Error).message); }
    }
    return { ok: true, xiboCampaignId };
  } catch (err) {
    console.error("[lancarCampanha]", err);
    return { ok: false, erro: err instanceof Error ? err.message : "erro ao lançar" };
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

    if (camp.xibo_campaign_id) await excluirCampanha(camp.xibo_campaign_id);
    await db().query(
      `UPDATE midia_campanhas SET status = 'encerrada', xibo_campaign_id = NULL, updated_at = NOW() WHERE id = $1`,
      [campanhaId]
    );
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

/** Relatório detalhado: cada exibição com horário + local + contagem (transparência). */
export async function relatorioDetalhado(campanhaId: string): Promise<{ resumo: { plays: number; duracao: number }; exibicoes: ExibicaoLinha[] } | null> {
  const camp = await carregar(campanhaId);
  if (!camp?.xibo_campaign_id || !camp.data_inicio) return null;
  const from = `${ymd(camp.data_inicio)} 00:00:00`;
  const to   = `${ymd(camp.data_fim ?? camp.data_inicio)} 23:59:59`;
  const exibicoes = await statsDetalhe(camp.xibo_campaign_id, from, to);
  const plays = exibicoes.reduce((s, e) => s + e.numberPlays, 0);
  const duracao = exibicoes.reduce((s, e) => s + e.duration, 0);
  return { resumo: { plays, duracao }, exibicoes };
}
