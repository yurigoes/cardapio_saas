/**
 * GET /api/admin/locais/[id]/capacidade — calcula CAPACIDADE REAL do local.
 *
 * Pra um anunciante saber quantos anuncios cabem antes da grade encher.
 *
 * Variaveis:
 *   - hora_abertura..hora_fechamento: janela de exibicao (default 06:00-22:00)
 *   - plano_veiculacao: 'publicidade' | 'encarte_totem' | 'ponta_gondola'
 *   - encarte_duracao_seg + paginas: quanto tempo o BLOCO de encarte ocupa
 *   - campanhas no_ar deste local: insercoes/dia × segundos
 *
 * Calculo:
 *   janela_seg_dia = (hora_fechamento - hora_abertura) * 3600
 *
 *   PUBLICIDADE:
 *     segundos_ocupados = sum(insercoes_dia × segundos) das campanhas
 *     capacidade_restante_seg = janela_seg_dia - segundos_ocupados
 *
 *   ENCARTE_TOTEM:
 *     A cada anuncio toca o BLOCO de encarte antes. Encarte é parte fixa.
 *     tempo_encarte_loop = paginas × duracao_encarte
 *     Por inserção: tempo_anuncio + tempo_encarte_loop (1:1)
 *     segundos_ocupados = sum(insercoes × (segundos + tempo_encarte_loop))
 *     OBS: o tempo do encarte sozinho (sem anuncio) e CONTINUO, nao soma
 *
 *   PONTA_GONDOLA: similar — a midia da gondola entra antes de cada anuncio
 *     tempo_gondola = duracao_gondola_seg
 *     Por insercao: tempo_anuncio + tempo_gondola (1:1)
 *
 *   Retorna tambem insercoes_restantes_padrao (segundos padrao = 10s) — quantas
 *   inseroes de 10s ainda cabem.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";
import { autenticar } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CapacidadeResult {
  ok: boolean;
  local: { id: string; nome: string; cidade: string | null; plano: string; abre: string; fecha: string };
  janela_horas: number;
  janela_segundos_dia: number;
  segundos_ocupados_dia: number;
  segundos_disponiveis_dia: number;
  ocupacao_pct: number;
  insercoes_restantes_padrao: { segundos: 10 | 15 | 30; quantas: number }[];
  campanhas_ativas: Array<{
    id: string; nome: string; insercoes_dia: number; segundos: number; segundos_total_dia: number;
  }>;
  detalhes: {
    encarte_paginas: number;
    encarte_duracao_seg: number;
    tempo_encarte_por_insercao_seg: number;
    gondola_duracao_seg: number | null;
  };
}

async function handle(req: NextRequest, { params }: { params: { id: string } }) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const viaKey = cronSecret && key === cronSecret;
  // Aceita: ?key=CRON_SECRET | admin cookie | master | anunciante JWT
  // (anunciante precisa ver capacidade pra escolher locais na campanha)
  const isAdmin = await autenticarAdmin(req).catch(() => false);
  const isAnunciante = !isAdmin && Boolean(await autenticar(req).catch(() => null));
  if (!viaKey && !isAdmin && !isAnunciante) {
    return NextResponse.json({ ok: false, error: "nao autenticado" }, { status: 401 });
  }
  await ensureSchema();

  const local = await db().query<{
    id: string; nome: string; cidade: string | null;
    plano_veiculacao: string; encarte_duracao_seg: number;
    hora_abertura: string; hora_fechamento: string;
  }>(
    `SELECT id, nome, cidade, COALESCE(plano_veiculacao, 'publicidade') AS plano_veiculacao,
            COALESCE(encarte_duracao_seg, 10) AS encarte_duracao_seg,
            COALESCE(hora_abertura, '06:00') AS hora_abertura,
            COALESCE(hora_fechamento, '22:00') AS hora_fechamento
       FROM midia_locais WHERE id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!local) return NextResponse.json({ ok: false, error: "local nao encontrado" }, { status: 404 });

  // Janela em segundos
  const parseHora = (s: string): number => {
    const [h, m] = s.split(":").map(n => parseInt(n, 10));
    return (h || 0) * 3600 + (m || 0) * 60;
  };
  const abreSeg  = parseHora(local.hora_abertura);
  const fechaSeg = parseHora(local.hora_fechamento);
  let janelaSeg = fechaSeg - abreSeg;
  if (janelaSeg <= 0) janelaSeg = 24 * 3600 + janelaSeg; // cobre 22:00 → 02:00 etc

  // Paginas de encarte cadastradas (se encarte_totem)
  const nPaginas = local.plano_veiculacao === "encarte_totem"
    ? await db().query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM midia_encarte_paginas WHERE local_id = $1`, [params.id]
      ).then(r => r.rows[0]?.n ?? 0)
    : 0;
  const tempoEncarteLoop = nPaginas > 0 ? nPaginas * local.encarte_duracao_seg : 0;

  // Duracao gondola (se ponta_gondola — usa MAX das telas, conservador)
  const gondolaDur = local.plano_veiculacao === "ponta_gondola"
    ? await db().query<{ d: number | null }>(
        `SELECT MAX(gondola_duracao_seg) AS d FROM midia_telas WHERE local_id = $1`, [params.id]
      ).then(r => r.rows[0]?.d ?? 10)
    : null;

  // Campanhas no_ar deste local
  const camps = await db().query<{ id: string; nome: string; insercoes_dia: number; segundos: number }>(
    `SELECT c.id, c.nome, c.insercoes_dia, c.segundos
       FROM midia_campanhas c
       JOIN midia_campanha_locais cl ON cl.campanha_id = c.id
      WHERE cl.local_id = $1 AND c.status = 'no_ar'`, [params.id]
  ).then(r => r.rows);

  // Tempo "extra" por insercao (encarte loop ou gondola)
  const tempoExtraPorInsercao = local.plano_veiculacao === "encarte_totem"
    ? tempoEncarteLoop
    : local.plano_veiculacao === "ponta_gondola"
    ? (gondolaDur ?? 0)
    : 0;

  const campanhasComTempo = camps.map(c => {
    const seg = c.segundos > 0 ? c.segundos : 10;
    const segTotalDia = c.insercoes_dia * (seg + tempoExtraPorInsercao);
    return { id: c.id, nome: c.nome, insercoes_dia: c.insercoes_dia, segundos: seg, segundos_total_dia: segTotalDia };
  });
  const segundosOcupados = campanhasComTempo.reduce((s, c) => s + c.segundos_total_dia, 0);
  const segundosDisponiveis = Math.max(0, janelaSeg - segundosOcupados);
  const ocupacao = janelaSeg > 0 ? Math.round((segundosOcupados / janelaSeg) * 100) : 0;

  // Pra cada duracao padrao (10/15/30s), quantas inseroes ainda cabem?
  const padroes: Array<10 | 15 | 30> = [10, 15, 30];
  const insercoesRestantes = padroes.map(s => ({
    segundos: s,
    quantas: Math.floor(segundosDisponiveis / (s + tempoExtraPorInsercao)),
  }));

  const out: CapacidadeResult = {
    ok: true,
    local: {
      id: local.id, nome: local.nome, cidade: local.cidade,
      plano: local.plano_veiculacao,
      abre: local.hora_abertura, fecha: local.hora_fechamento,
    },
    janela_horas: Math.round((janelaSeg / 3600) * 10) / 10,
    janela_segundos_dia: janelaSeg,
    segundos_ocupados_dia: Math.round(segundosOcupados),
    segundos_disponiveis_dia: Math.round(segundosDisponiveis),
    ocupacao_pct: ocupacao,
    insercoes_restantes_padrao: insercoesRestantes,
    campanhas_ativas: campanhasComTempo,
    detalhes: {
      encarte_paginas: nPaginas,
      encarte_duracao_seg: local.encarte_duracao_seg,
      tempo_encarte_por_insercao_seg: tempoEncarteLoop,
      gondola_duracao_seg: gondolaDur,
    },
  };
  return NextResponse.json(out);
}

export const GET = handle;
