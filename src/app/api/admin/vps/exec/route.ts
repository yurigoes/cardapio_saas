/**
 * POST /api/admin/vps/exec — enfileira comando + aguarda resultado (até 60s)
 *
 * Body: { comando, params? }
 * Master only. Retorna { resultado } ou { erro }.
 *
 * Usa long-poll: cria job, espera até 60s pelo agente processar.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";

// Whitelist de comandos permitidos
const COMANDOS_VALIDOS = [
  "status", "disk", "docker_ps", "docker_prune", "lista_discos",
  "error_log_tail", "speedtest", "exec_migration", "backup_db",
  "restart_container", "discos_resumo", "formatar_e_montar_disco",
];

const schema = z.object({
  comando: z.enum(COMANDOS_VALIDOS as [string, ...string[]]),
  params:  z.record(z.unknown()).optional(),
  timeout_s: z.number().int().min(1).max(300).optional(),
});

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const job = await queryOne<{ id: string }>(
      `INSERT INTO vps_jobs (comando, params, criado_por)
       VALUES ($1, $2::jsonb, $3) RETURNING id`,
      [body.comando, JSON.stringify(body.params ?? {}), auth.payload.sub]
    );
    if (!job) return serverError("Falha ao enfileirar");

    // Long-poll: 60s no max esperando o ack
    const timeout = (body.timeout_s ?? 60) * 1000;
    const inicio  = Date.now();
    while (Date.now() - inicio < timeout) {
      await sleep(500);
      const r = await queryOne<{
        status: string; resultado: unknown; erro: string | null; duracao_ms: number | null;
      }>(`SELECT status, resultado, erro, duracao_ms FROM vps_jobs WHERE id = $1`, [job.id]);
      if (r && (r.status === "sucesso" || r.status === "erro")) {
        return ok({
          job_id: job.id, status: r.status,
          resultado: r.resultado, erro: r.erro,
          duracao_ms: r.duracao_ms,
        });
      }
    }
    return ok({
      job_id: job.id, status: "timeout",
      mensagem: "Agente não respondeu em 60s. Job continua na fila — verifique se o vps-agent está rodando.",
    });
  } catch (err) {
    console.error("[VPS/Exec]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
