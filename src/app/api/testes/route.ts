import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { forbidden, ok } from "@/lib/utils/response";
import { rodarSuites } from "@/lib/testing/harness";
import { SUITES } from "@/lib/testing/suites";
import { redis } from "@/lib/db/redis";

export const dynamic = "force-dynamic";

const HIST_KEY = "testes:historico";

/**
 * GET /api/testes — executa os testes unitários em processo e devolve o
 * resultado + histórico das últimas execuções. Restrito a master/admin.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "admin") {
    return forbidden("Apenas administradores podem acessar os testes");
  }

  const inicio = Date.now();
  const resultados = await rodarSuites(SUITES);
  const duracaoMs = Date.now() - inicio;
  const horario = new Date().toISOString();

  const casos = resultados.flatMap((s) => s.casos);
  const passed = casos.filter((c) => c.status === "passed").length;
  const failed = casos.filter((c) => c.status === "failed").length;

  // Histórico das últimas 20 execuções (best-effort; sem Redis segue vazio)
  let historico: unknown[] = [];
  try {
    const entry = JSON.stringify({
      horario, total: casos.length, passed, failed, ms: duracaoMs,
      por: auth.payload.nome ?? null,
    });
    await redis.lpush(HIST_KEY, entry);
    await redis.ltrim(HIST_KEY, 0, 19);
    historico = (await redis.lrange(HIST_KEY, 0, 19)).map((r) => JSON.parse(r));
  } catch {
    /* Redis offline — sem histórico, não bloqueia */
  }

  return ok({
    resultados,
    duracaoMs,
    horario,
    resumo: { total: casos.length, passed, failed, modulos: resultados.length },
    historico,
  });
}
