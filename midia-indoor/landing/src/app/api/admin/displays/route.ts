/**
 * GET  /api/admin/displays — lista players (status + local vinculado)
 * POST /api/admin/displays — ações:
 *   { acao:"autorizar", displayId }
 *   { acao:"vincular",  displayId, local_id }   (autoriza + cria/garante display group do local)
 *   { acao:"desvincular", displayId, local_id }
 *   { acao:"renomear", displayId, nome }
 *   { acao:"excluir",  displayId }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import {
  listarDisplaysFull, autorizarDisplay, adicionarDisplayAoGrupo, removerDisplayDoGrupo,
  renomearDisplay, excluirDisplay, criarDisplayGroup, collectNow, setDisplayProfile, setDefaultLayout,
  wolDisplay, revertToSchedule, ultimoComandoStatus,
} from "@/lib/xibo";
import { logAudit } from "@/lib/auditoria";

// IDs dos Display Profiles do Xibo (criados uma vez no Xibo, configurados no .env)
const PROFILE_RETRATO  = Number(process.env.XIBO_PROFILE_PORTRAIT_ID  ?? 0);
const PROFILE_PAISAGEM = Number(process.env.XIBO_PROFILE_LANDSCAPE_ID ?? 0);

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const locais = await db().query<{ id: string; nome: string; xibo_display_group_id: number | null }>(
      `SELECT id, nome, xibo_display_group_id FROM midia_locais`
    ).then(r => r.rows);
    const dgToLocal = new Map(locais.filter(l => l.xibo_display_group_id).map(l => [l.xibo_display_group_id!, l]));

    const displays = await listarDisplaysFull();
    const lista = displays.map(d => {
      const grupos = d.displayGroups ?? [];
      const local = grupos.map(g => dgToLocal.get(g.displayGroupId)).find(Boolean) ?? null;
      return {
        displayId: d.displayId,
        nome: d.display,
        autorizado: (d.licensed ?? d.authorised) === 1,
        online: d.loggedIn === 1,
        ultimoAcesso: d.lastAccessed,
        clientType: d.clientType ?? "",
        hardwareKey: d.license ?? "",
        local: local ? { id: local.id, nome: local.nome } : null,
      };
    });
    return NextResponse.json({ ok: true, displays: lista, locais: locais.map(l => ({ id: l.id, nome: l.nome })) });
  } catch (err) {
    console.error("[admin/displays GET]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}

async function dgDoLocal(localId: string): Promise<number | null> {
  const p = db();
  const l = await p.query<{ nome: string; cidade: string | null; xibo_display_group_id: number | null }>(
    `SELECT nome, cidade, xibo_display_group_id FROM midia_locais WHERE id = $1`, [localId]
  ).then(r => r.rows[0]);
  if (!l) return null;
  if (l.xibo_display_group_id) return l.xibo_display_group_id;
  const dg = await criarDisplayGroup(`Local — ${l.nome}`, l.cidade ?? "");
  await p.query(`UPDATE midia_locais SET xibo_display_group_id = $1, updated_at = NOW() WHERE id = $2`, [dg, localId]);
  return dg;
}

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const b = await req.json().catch(() => null) as { acao?: string; displayId?: number; local_id?: string; nome?: string } | null;
  if (!b?.acao || !b.displayId) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });

  try {
    await ensureSchema();
    switch (b.acao) {
      case "autorizar":
        await autorizarDisplay(b.displayId);
        break;
      case "vincular": {
        if (!b.local_id) return NextResponse.json({ ok: false, error: "local_id obrigatório" }, { status: 400 });
        const dg = await dgDoLocal(b.local_id);
        if (!dg) return NextResponse.json({ ok: false, error: "local inválido" }, { status: 400 });
        // Lê orientação do local pra aplicar o Display Profile correto depois
        const localInfo = await db().query<{ orientacao: string; splash_layout_id: number | null }>(
          `SELECT orientacao, splash_layout_id FROM midia_locais WHERE id = $1`, [b.local_id]
        ).then(r => r.rows[0]);
        const profileAlvo = localInfo?.orientacao === "paisagem" ? PROFILE_PAISAGEM : PROFILE_RETRATO;
        const atual = (await listarDisplaysFull()).find(d => d.displayId === b.displayId);
        // authorise é TOGGLE — só autoriza se ainda não estiver licenciada
        const jaAutorizada = ((atual?.licensed ?? atual?.authorised) === 1);
        if (atual && !jaAutorizada) await autorizarDisplay(b.displayId);
        // 1 tela = 1 local: remove de outros grupos de LOCAL antes de vincular
        const gruposDeLocais = new Set(
          (await db().query<{ dg: number }>(`SELECT xibo_display_group_id dg FROM midia_locais WHERE xibo_display_group_id IS NOT NULL`)).rows.map(r => r.dg)
        );
        for (const g of atual?.displayGroups ?? []) {
          if (g.displayGroupId !== dg && gruposDeLocais.has(g.displayGroupId)) {
            try { await removerDisplayDoGrupo(b.displayId, g.displayGroupId); } catch (e) { console.warn("[vincular] não removeu de grupo antigo:", (e as Error).message); }
          }
        }
        await adicionarDisplayAoGrupo(b.displayId, dg);
        // Aplica o perfil de orientação certo (se as envs estão configuradas)
        if (profileAlvo > 0) {
          try { await setDisplayProfile(b.displayId, profileAlvo); }
          catch (e) { console.warn("[vincular] não atribuiu Display Profile:", (e as Error).message); }
        }
        // Aplica o splash do local como Default Layout (se houver)
        if (localInfo?.splash_layout_id) {
          try { await setDefaultLayout(b.displayId, localInfo.splash_layout_id); }
          catch (e) { console.warn("[vincular] não atribuiu splash:", (e as Error).message); }
        }
        break;
      }
      case "desvincular": {
        if (!b.local_id) return NextResponse.json({ ok: false, error: "local_id obrigatório" }, { status: 400 });
        const dg = await dgDoLocal(b.local_id);
        if (dg) await removerDisplayDoGrupo(b.displayId, dg);
        break;
      }
      case "renomear":
        if (!b.nome) return NextResponse.json({ ok: false, error: "nome obrigatório" }, { status: 400 });
        await renomearDisplay(b.displayId, b.nome);
        break;
      case "collect": {
        const disp = (await listarDisplaysFull()).find(d => d.displayId === b.displayId);
        const proprio = disp?.displayGroups?.find(g => g.isDisplaySpecific === 1) ?? disp?.displayGroups?.[0];
        if (!proprio) return NextResponse.json({ ok: false, error: "tela sem grupo" }, { status: 400 });
        const online = disp?.loggedIn === 1;
        if (!online) {
          // sem XMR ativo o comando não chega no player
          return NextResponse.json({
            ok: false,
            error: "Tela aparece OFFLINE no Xibo (XMR sem conexão). Comando não foi enviado — verifique o player.",
          }, { status: 409 });
        }
        const ret = await collectNow(proprio.displayGroupId);
        // aguarda 3s e olha o lastCommandSuccess pra confirmar entrega
        await new Promise(r => setTimeout(r, 3000));
        const st = await ultimoComandoStatus(b.displayId);
        // lastCommandSuccess: 1=ok, 0=falha, 2=nunca tentou (default)
        const sucesso = st?.sucesso === 1;
        const detalhe = st?.sucesso === 0
          ? "XMR aceitou mas o player rejeitou o comando."
          : st?.sucesso === 1
            ? "Player confirmou o recebimento ✓"
            : "Comando enfileirado — confirmação ainda pendente (status no Xibo: aguardando).";
        logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: `tela.collect`, entidade: "display", entidade_id: String(b.displayId), detalhes: { ret, lastCommandSuccess: st?.sucesso } });
        return NextResponse.json({ ok: true, confirmado: sucesso, msg: `${ret.mensagem}. ${detalhe}` });
      }
      case "wol":
        await wolDisplay(b.displayId);
        break;
      case "revert": {
        const disp = (await listarDisplaysFull()).find(d => d.displayId === b.displayId);
        const proprio = disp?.displayGroups?.find(g => g.isDisplaySpecific === 1) ?? disp?.displayGroups?.[0];
        if (!proprio) return NextResponse.json({ ok: false, error: "tela sem grupo" }, { status: 400 });
        await revertToSchedule(proprio.displayGroupId);
        break;
      }
      case "excluir":
        await excluirDisplay(b.displayId);
        break;
      default:
        return NextResponse.json({ ok: false, error: "ação desconhecida" }, { status: 400 });
    }
    logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: `tela.${b.acao}`, entidade: "display", entidade_id: String(b.displayId), detalhes: { local_id: b.local_id, nome: b.nome } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/displays POST]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
