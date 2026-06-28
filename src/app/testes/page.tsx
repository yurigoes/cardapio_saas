import { rodarSuites, type SuiteResultado } from "@/lib/testing/harness";
import { SUITES } from "@/lib/testing/suites";

export const dynamic = "force-dynamic";
export const metadata = { title: "Testes — Three Restaurantes" };

const COR: Record<string, string> = { passed: "#16a34a", failed: "#dc2626" };
const LABEL: Record<string, string> = { passed: "passou", failed: "falhou" };

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

export default async function TestesPage() {
  const resultados: SuiteResultado[] = await rodarSuites(SUITES);

  const casos = resultados.flatMap((s) => s.casos);
  const passed = casos.filter((c) => c.status === "passed").length;
  const failed = casos.filter((c) => c.status === "failed").length;

  return (
    <main className="mx-auto max-w-4xl p-6 text-neutral-200">
      <header className="mb-6">
        <h1 className="text-2xl font-medium">Testes unitários — Three Restaurantes</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {resultados.length} módulos · {casos.length} testes · executados ao vivo no servidor
        </p>
        <div className="mt-4 flex gap-3">
          <Stat n={passed} label="passou" cor="#16a34a" />
          <Stat n={failed} label="falhou" cor="#dc2626" />
        </div>
        {failed === 0 ? (
          <div className="mt-4 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">
            Todos os {casos.length} testes passaram. ✓
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {failed} teste(s) falhando — detalhes em vermelho abaixo.
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-500">Recarregue a página para rodar de novo.</p>
      </header>

      <div className="space-y-4">
        {resultados.map((s, idx) => {
          const sFail = s.casos.filter((c) => c.status === "failed").length;
          const sPass = s.casos.length - sFail;
          return (
            <section key={idx} className="rounded-xl border border-neutral-800 bg-neutral-900/40">
              <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                <div>
                  <h2 className="font-medium">{s.nome}</h2>
                  <p className="text-xs text-neutral-500">{s.modulo}</p>
                </div>
                <span className="text-xs" style={{ color: sFail > 0 ? "#dc2626" : "#16a34a" }}>
                  {sFail > 0 ? `${sFail} falha(s)` : `${sPass} ok`}
                </span>
              </div>
              <ul className="divide-y divide-neutral-800/60">
                {s.casos.map((c, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-300">{c.nome}</p>
                      {c.erro && <p className="mt-1 break-words text-xs text-red-400">{c.erro}</p>}
                    </div>
                    <Badge status={c.status} />
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
