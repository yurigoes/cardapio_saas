import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const metadata = { title: "Testes — Three Restaurantes" };

type Test = { name: string; status: string; error?: string };
type Suite = { file: string; name: string; modulo?: string; tests: Test[] };

// Lê test-results.json e normaliza tanto o catálogo (formato próprio) quanto a
// saída nativa do Vitest (`vitest run --reporter=json`).
function carregar(): { suites: Suite[]; mode: string; generatedAt?: string } | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(process.cwd(), "test-results.json"), "utf-8");
  } catch {
    return null;
  }
  const data = JSON.parse(raw);

  // Formato Vitest (Jest-like): { testResults: [{ name, assertionResults: [...] }] }
  if (Array.isArray(data.testResults)) {
    const suitesMap = new Map<string, Suite>();
    for (const tr of data.testResults) {
      const file = path.basename(tr.name || "?");
      for (const a of tr.assertionResults || []) {
        const grupo = (a.ancestorTitles && a.ancestorTitles[0]) || file;
        const key = file + "::" + grupo;
        if (!suitesMap.has(key)) suitesMap.set(key, { file, name: grupo, tests: [] });
        suitesMap.get(key)!.tests.push({
          name: a.title,
          status: a.status === "passed" ? "passed" : a.status === "failed" ? "failed" : "pending",
          error: a.failureMessages && a.failureMessages[0],
        });
      }
    }
    return { suites: [...suitesMap.values()], mode: "vitest", generatedAt: data.startTime ? new Date(data.startTime).toISOString() : undefined };
  }

  // Formato catálogo próprio: { results: [...], summary: { mode } }
  if (Array.isArray(data.results)) {
    return { suites: data.results, mode: data.summary?.mode || "catalogo", generatedAt: data.summary?.generatedAt };
  }
  return { suites: [], mode: "desconhecido" };
}

const COR: Record<string, string> = { passed: "#16a34a", failed: "#dc2626", pending: "#6b7280" };
const LABEL: Record<string, string> = { passed: "passou", failed: "falhou", pending: "a verificar" };

function Badge({ status }: { status: string }) {
  const c = COR[status] ?? "#6b7280";
  return (
    <span style={{ background: c + "22", color: c, border: `1px solid ${c}55` }}
      className="inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      {LABEL[status] ?? status}
    </span>
  );
}

function Stat({ n, label, cor }: { n: number; label: string; cor: string }) {
  return (
    <div className="rounded-lg bg-neutral-900 px-4 py-2">
      <div className="text-xl font-medium" style={{ color: cor }}>{n}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}

export default function TestesPage() {
  const rep = carregar();

  if (!rep) {
    return (
      <main className="mx-auto max-w-3xl p-8 text-neutral-200">
        <h1 className="text-2xl font-medium">Testes</h1>
        <p className="mt-4 text-neutral-400">Nenhum resultado encontrado. Gere o relatório:</p>
        <pre className="mt-3 rounded bg-neutral-900 p-4 text-sm text-neutral-300">npm run test:report</pre>
      </main>
    );
  }

  const tests = rep.suites.flatMap((s) => s.tests);
  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const pending = tests.filter((t) => t.status === "pending").length;
  const naoExecutado = rep.mode === "catalogo" || (pending === tests.length && tests.length > 0);

  return (
    <main className="mx-auto max-w-4xl p-6 text-neutral-200">
      <header className="mb-6">
        <h1 className="text-2xl font-medium">Testes unitários — Three Restaurantes</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {rep.suites.length} módulos · {tests.length} testes
          {rep.generatedAt ? ` · ${new Date(rep.generatedAt).toLocaleString("pt-BR")}` : ""}
        </p>

        <div className="mt-4 flex gap-3">
          <Stat n={passed} label="passou" cor="#16a34a" />
          <Stat n={failed} label="falhou" cor="#dc2626" />
          {pending > 0 && <Stat n={pending} label="a verificar" cor="#6b7280" />}
        </div>

        {naoExecutado && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            Catálogo dos testes (ainda não executado). Para rodar e ver passou/falhou de todos os módulos:
            <pre className="mt-2 rounded bg-black/30 p-2 text-amber-100">npm run test:report</pre>
          </div>
        )}
      </header>

      <div className="space-y-4">
        {rep.suites.map((s, idx) => {
          const sFail = s.tests.filter((t) => t.status === "failed").length;
          const sPass = s.tests.filter((t) => t.status === "passed").length;
          return (
            <section key={idx} className="rounded-xl border border-neutral-800 bg-neutral-900/40">
              <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                <div>
                  <h2 className="font-medium">{s.name}</h2>
                  <p className="text-xs text-neutral-500">{s.modulo || s.file}</p>
                </div>
                <span className="text-xs text-neutral-400">
                  {sFail > 0 ? `${sFail} falha(s)` : sPass === s.tests.length && sPass > 0 ? "tudo ok" : `${s.tests.length} testes`}
                </span>
              </div>
              <ul className="divide-y divide-neutral-800/60">
                {s.tests.map((t, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-300">{t.name}</p>
                      {t.error && <p className="mt-1 break-words text-xs text-red-400">{t.error}</p>}
                    </div>
                    <Badge status={t.status} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
