import type { ComponentType } from "react";
import { rodarSuites, type SuiteResultado } from "@/lib/testing/harness";
import { SUITES } from "@/lib/testing/suites";
import {
  CheckCircle2, XCircle, Clock, Activity, CreditCard,
  KeyRound, ShieldCheck, Boxes, RefreshCw,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Testes — Three Restaurantes" };

const CATEGORIA_ORDEM = ["Operação", "Pagamentos", "Autenticação e acesso", "Segurança", "Núcleo da API"];

const CAT_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  "Operação": Activity,
  "Pagamentos": CreditCard,
  "Autenticação e acesso": KeyRound,
  "Segurança": ShieldCheck,
  "Núcleo da API": Boxes,
};

function StatCard({ valor, label, cor }: { valor: string | number; label: string; cor?: string }) {
  return (
    <div className="rounded-xl bg-neutral-900 px-4 py-3 min-w-[110px]">
      <div className="text-2xl font-semibold" style={cor ? { color: cor } : undefined}>{valor}</div>
      <div className="text-xs text-neutral-400 mt-0.5">{label}</div>
    </div>
  );
}

export default async function TestesPage() {
  const inicio = Date.now();
  const resultados: SuiteResultado[] = await rodarSuites(SUITES);
  const duracaoMs = Date.now() - inicio;
  const horario = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

  const casos = resultados.flatMap((s) => s.casos);
  const passed = casos.filter((c) => c.status === "passed").length;
  const failed = casos.filter((c) => c.status === "failed").length;

  // agrupa por categoria, na ordem definida
  const porCategoria = new Map<string, SuiteResultado[]>();
  for (const s of resultados) {
    if (!porCategoria.has(s.categoria)) porCategoria.set(s.categoria, []);
    porCategoria.get(s.categoria)!.push(s);
  }
  const categorias = [...porCategoria.keys()].sort(
    (a, b) => (CATEGORIA_ORDEM.indexOf(a) + 1 || 99) - (CATEGORIA_ORDEM.indexOf(b) + 1 || 99)
  );

  return (
    <main className="mx-auto max-w-4xl p-6 text-neutral-200">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <Activity size={16} /> Painel de testes automatizados
        </div>
        <h1 className="mt-1 text-2xl font-semibold">Three Restaurantes — Testes</h1>

        <div className="mt-4 flex flex-wrap gap-3">
          <StatCard valor={casos.length} label="testes" />
          <StatCard valor={passed} label="passaram" cor="#22c55e" />
          <StatCard valor={failed} label="falharam" cor={failed ? "#ef4444" : "#6b7280"} />
          <StatCard valor={`${duracaoMs} ms`} label="duração da execução" cor="#38bdf8" />
          <StatCard valor={resultados.length} label="módulos" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-neutral-400">
          <span className="inline-flex items-center gap-1"><Clock size={14} /> Última execução: {horario}</span>
          <span className="inline-flex items-center gap-1"><RefreshCw size={14} /> Recarregue a página para rodar de novo</span>
        </div>

        <div
          className="mt-4 rounded-lg border p-3 text-sm"
          style={
            failed === 0
              ? { borderColor: "#22c55e55", background: "#22c55e14", color: "#86efac" }
              : { borderColor: "#ef444455", background: "#ef444414", color: "#fca5a5" }
          }
        >
          {failed === 0
            ? `✓ Sistema em operação: todos os ${casos.length} testes passaram.`
            : `${failed} teste(s) falhando — veja os detalhes em vermelho abaixo.`}
        </div>
      </header>

      {categorias.map((cat) => {
        const suites = porCategoria.get(cat)!;
        const Icon = CAT_ICON[cat] ?? Boxes;
        const catCasos = suites.flatMap((s) => s.casos);
        const catFail = catCasos.filter((c) => c.status === "failed").length;
        const catMs = suites.reduce((a, s) => a + s.ms, 0);

        return (
          <section key={cat} className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-neutral-200">
                <Icon size={18} />
              </span>
              <h2 className="text-lg font-medium">{cat}</h2>
              <span className="text-xs text-neutral-500">
                {catCasos.length} testes · {catMs} ms · {catFail === 0 ? "tudo ok" : `${catFail} falha(s)`}
              </span>
            </div>

            <div className="space-y-3">
              {suites.map((s, idx) => {
                const sFail = s.casos.filter((c) => c.status === "failed").length;
                const ok = sFail === 0;
                return (
                  <div key={idx} className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                    <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {ok ? <CheckCircle2 size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
                          <h3 className="font-medium">{s.nome}</h3>
                        </div>
                        <p className="mt-1 text-xs text-neutral-400">{s.descricao}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-600">{s.modulo}</p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-xs font-medium" style={{ color: ok ? "#22c55e" : "#ef4444" }}>
                          {ok ? `${s.casos.length}/${s.casos.length} ok` : `${sFail} de ${s.casos.length} falhou`}
                        </div>
                        <div className="text-[11px] text-neutral-500 inline-flex items-center gap-1 justify-end">
                          <Clock size={11} /> {s.ms} ms
                        </div>
                      </div>
                    </div>

                    <ul className="divide-y divide-neutral-800/50">
                      {s.casos.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 px-4 py-2">
                          {c.status === "passed"
                            ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
                            : <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-neutral-300">{c.nome}</p>
                            {c.erro && <p className="mt-0.5 break-words text-xs text-red-400">{c.erro}</p>}
                          </div>
                          <span className="text-[11px] text-neutral-600 whitespace-nowrap">{c.ms} ms</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
