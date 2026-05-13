/**
 * POST /api/cron/manutencao-noturna
 *
 * Disparado todo dia às 02h (configurar via cloudflared/external cron).
 *
 * Header: x-cron-secret = $CRON_SECRET
 *
 * Fluxo:
 *   1. Avisa via WhatsApp 6h antes (rodar 20h também — variar por hora atual)
 *   2. Ativa modo manutenção
 *   3. Roda diagnóstico completo
 *   4. Roda docker prune (limpeza)
 *   5. Backup banco
 *   6. Desativa manutenção
 *   7. Manda relatório no WhatsApp
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";
import { invalidarCacheManutencao } from "@/lib/security/manutencao";
import { enviarAlertaWhatsApp } from "@/lib/security/alertas";

interface JobResult { status: string; resultado: unknown; erro: string | null }

async function execComando(comando: string, params: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<JobResult> {
  const job = await queryOne<{ id: string }>(
    `INSERT INTO vps_jobs (comando, params) VALUES ($1, $2::jsonb) RETURNING id`,
    [comando, JSON.stringify(params)]
  );
  if (!job) return { status: "erro", resultado: null, erro: "falha enfileirar" };
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    await new Promise(r => setTimeout(r, 1000));
    const r = await queryOne<JobResult>(
      `SELECT status, resultado, erro FROM vps_jobs WHERE id = $1`, [job.id]
    );
    if (r && (r.status === "sucesso" || r.status === "erro")) return r;
  }
  return { status: "timeout", resultado: null, erro: "timeout" };
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    // 1. Ativa manutenção
    await queryOne(
      `UPDATE settings SET valor = jsonb_set(valor, '{ativo}', 'true'::jsonb), updated_at = NOW()
        WHERE chave = 'manutencao'`
    );
    invalidarCacheManutencao();

    // 2. Diagnóstico
    const [statusR, diskR] = await Promise.all([
      execComando("status"),
      execComando("disk"),
    ]);

    // 3. Limpeza docker (prune sem volumes pra não apagar dados)
    const pruneR = await execComando("docker_prune", { volumes: false }, 120_000);

    // 4. Backup
    const backupR = await execComando("backup_db", {}, 300_000);

    // 5. Desativa manutenção
    await queryOne(
      `UPDATE settings SET valor = jsonb_set(valor, '{ativo}', 'false'::jsonb), updated_at = NOW()
        WHERE chave = 'manutencao'`
    );
    invalidarCacheManutencao();

    const resumo = [
      `🌙 Manutenção noturna concluída`,
      `Status: ${statusR.status}`,
      `Disco: ${diskR.status}`,
      `Limpeza Docker: ${pruneR.status}${pruneR.status === "sucesso" ? "" : " - " + pruneR.erro}`,
      `Backup: ${backupR.status}${backupR.status === "sucesso" ? "" : " - " + backupR.erro}`,
    ].join("\n");

    // 6. Salva no histórico
    await queryOne(
      `INSERT INTO vps_diagnosticos (origem, resultado, resumo, detalhes)
       VALUES ('agendado', $1, $2, $3::jsonb)`,
      [
        [statusR, diskR, pruneR, backupR].some(x => x.status === "erro") ? "warn" : "ok",
        resumo,
        JSON.stringify({ statusR, diskR, pruneR, backupR }),
      ]
    );

    // 7. Notifica WhatsApp
    await enviarAlertaWhatsApp(resumo).catch(e => console.warn("[manutencao] alerta:", e.message));

    return NextResponse.json({ ok: true, resumo });
  } catch (err) {
    console.error("[Cron/ManutencaoNoturna]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "manutencao-noturna" });
}
