/**
 * Sincronizacao de relogio das TVs (essencial pra ponta_gondola tocar anuncio
 * em sync entre todas).
 *
 * Estrategia Xibo v3:
 *  1. Garante que existe um Command "td_sync_clock" no Xibo (cria 1x)
 *  2. Atribui o command ao Display Profile (Android) dos displays do local
 *  3. Dispara o command no Display Group via API
 *
 * O command shell roda na TV: `settings put global auto_time 0; sleep 1; settings put global auto_time 1`
 * Isso desliga e religa o sync NTP nativo do Android, forcando re-pull da hora.
 * Combinado com `settings put global ntp_server pool.ntp.br` (feito no provisionamento),
 * garante drift < 1s entre TVs do mesmo local.
 */
import { xibo, collectNow } from "./xibo";

const COMMAND_CODE = "td_sync_clock";
const COMMAND_NAME = "TD Sync Clock";
// Forca re-sync via NTP nativo do Android (toggle auto_time)
const COMMAND_SHELL = "settings put global auto_time 0; sleep 1; settings put global auto_time 1";

interface XiboCommand { commandId: number; command: string; code: string; description?: string; }

async function listarCommands(): Promise<XiboCommand[]> {
  try {
    const r = await xibo<XiboCommand[]>(`/api/command`);
    return Array.isArray(r) ? r : [];
  } catch (e) { console.warn("[sync-relogio] listar commands:", (e as Error).message); return []; }
}

async function criarOuObterCommand(): Promise<number | null> {
  const existentes = await listarCommands();
  const ja = existentes.find(c => c.code === COMMAND_CODE);
  if (ja) return ja.commandId;
  try {
    const body = new URLSearchParams({
      command: COMMAND_NAME,
      code: COMMAND_CODE,
      description: "Forca re-sync NTP do Android (settings put global auto_time)",
    });
    const r = await xibo<XiboCommand | { data?: XiboCommand }>(`/api/command`, { method: "POST", body });
    const cmd = (r as { data?: XiboCommand })?.data ?? (r as XiboCommand);
    return cmd?.commandId ?? null;
  } catch (e) {
    console.error("[sync-relogio] criar command falhou:", (e as Error).message);
    return null;
  }
}

/**
 * Garante que o command td_sync_clock esta atribuido ao Display Profile
 * usado pelos displays Android. Roda 1x por chamada — idempotente.
 */
async function garantirCommandNoProfile(commandId: number): Promise<void> {
  try {
    const profiles = await xibo<Array<{ displayProfileId: number; type: string; commands?: Array<{ commandId: number; commandString?: string }> }>>(`/api/displayprofile`);
    const androidProfiles = (Array.isArray(profiles) ? profiles : []).filter(p => p.type === "android");
    for (const prof of androidProfiles) {
      const ja = (prof.commands ?? []).some(c => c.commandId === commandId);
      if (ja) continue;
      try {
        // Atualiza o profile injetando o command com o shell. API: PUT /api/displayprofile/{id}
        // Body precisa de commandKey/commandString por command — formato CMS v3.
        const body = new URLSearchParams();
        body.append(`commands[${COMMAND_CODE}][commandString]`, COMMAND_SHELL);
        body.append(`commands[${COMMAND_CODE}][validationString]`, "");
        // PUT preserva o resto via merge no Xibo
        await xibo(`/api/displayprofile/${prof.displayProfileId}`, { method: "PUT", body });
      } catch (e) {
        console.warn(`[sync-relogio] anexar command no profile ${prof.displayProfileId} falhou:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.warn("[sync-relogio] listar profiles falhou:", (e as Error).message);
  }
}

/**
 * Dispara o sync_clock em todas as TVs do display group.
 * Tambem chama collectNow logo apos pra garantir que a programacao seja
 * recolhida com hora atualizada.
 *
 * Retorna { ok, command_id, disparado, erro? }
 */
export async function sincronizarRelogioDoGrupo(displayGroupId: number): Promise<{
  ok: boolean; commandId?: number; disparado?: boolean; erro?: string;
}> {
  const commandId = await criarOuObterCommand();
  if (!commandId) return { ok: false, erro: "nao consegui criar/obter Command td_sync_clock no Xibo" };

  await garantirCommandNoProfile(commandId);

  // Dispara via API: POST /api/displaygroup/{id}/action/command
  // O Xibo v3 aceita commandId ou commandString. Mandamos ambos pra robustez.
  try {
    const body = new URLSearchParams({
      commandId: String(commandId),
      // Algumas versoes do v3 precisam de commandString direto:
      commandString: COMMAND_SHELL,
    });
    await xibo(`/api/displaygroup/${displayGroupId}/action/command`, { method: "POST", body });
  } catch (e) {
    return { ok: false, commandId, erro: `disparar command falhou: ${(e as Error).message}` };
  }

  // collectNow logo apos pra que a programacao seja revalidada com hora boa
  try { await collectNow(displayGroupId); } catch { /* best-effort */ }

  return { ok: true, commandId, disparado: true };
}

/**
 * Sincroniza relogio de TODOS os displays de um local (via xibo_display_group_id).
 */
export async function sincronizarRelogioDoLocal(localId: string): Promise<{
  ok: boolean; commandId?: number; erro?: string;
}> {
  const { db, ensureSchema } = await import("./db");
  await ensureSchema();
  const local = await db().query<{ xibo_display_group_id: number | null; nome: string }>(
    `SELECT xibo_display_group_id, nome FROM midia_locais WHERE id = $1`, [localId]
  ).then(r => r.rows[0]);
  if (!local) return { ok: false, erro: "local nao encontrado" };
  if (!local.xibo_display_group_id) return { ok: false, erro: "local sem display group no Xibo" };

  const r = await sincronizarRelogioDoGrupo(local.xibo_display_group_id);
  if (r.ok) console.log(`[sync-relogio] local '${local.nome}' (group ${local.xibo_display_group_id}): command disparado`);
  return r;
}
