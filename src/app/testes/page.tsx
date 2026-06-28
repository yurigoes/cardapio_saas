"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  CheckCircle2, XCircle, Clock, Activity, CreditCard, Receipt,
  KeyRound, ShieldCheck, Boxes, RefreshCw, Lock, Loader2,
} from "lucide-react";

type CasoR = { nome: string; status: "passed" | "failed"; erro?: string; ms: number };
type SuiteR = { modulo: string; nome: string; categoria: string; descricao: string; ms: number; casos: CasoR[] };
type Hist = { horario: string; total: number; passed: number; failed: number; ms: number; por?: string | null };
type Dados = {
  resultados: SuiteR[];
  duracaoMs: number;
  horario: string;
  resumo: { total: number; passed: number; failed: number; modulos: number };
  historico: Hist[];
};

const CATEGORIA_ORDEM = ["Operação", "Pagamentos", "Faturamento", "Autenticação e acesso", "Segurança", "Núcleo da API"];
const CAT_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  "Operação": Activity,
  "Pagamentos": CreditCard,
  "Faturamento": Receipt,
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

export default function TestesPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "login" | "forbidden" | "erro">("carregando");
  const [rodando, setRodando] = useState(false);

  const carregar = useCallback(async () => {
    setRodando(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) { setEstado("login"); return; }
      const res = await fetch("/api/testes", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.status === 401) { setEstado("login"); return; }
      if (res.status === 403) { setEstado("forbidden"); return; }
      if (!res.ok) { setEstado("erro"); return; }
      const json = await res.json();
      setDados(json.data as Dados);
      setEstado("ok");
    } catch {
      setEstado("erro");
    } finally {
      setRodando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (estado === "carregando") {
    return <Centro><Loader2 className="animate-spin" /> Carregando testes…</Centro>;
  }
  if (estado === "login") {
    return <Centro><Lock size={18} /> Faça login como administrador para ver os testes.</Centro>;
  }
  if (estado === "forbidden") {
    return <Centro><Lock size={18} /> Acesso restrito a administradores.</Centro>;
  }
  if (estado === "erro" || !dados) {
    return (
      <Centro>
        <XCircle size={18} className="text-red-500" /> Não foi possível carregar os testes.
        <button onClick={carregar} className="ml-2 rounded bg-neutral-800 px-3 py-1 text-sm">Tentar de novo</button>
      </Centro>
    );
  }

  const { resultados, resumo, duracaoMs, horario, historico } = dados;

  const porCategoria = new Map<string, SuiteR[]>();
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-400"><Activity size={16} /> Painel de testes automatizados</div>
            <h1 className="mt-1 text-2xl font-semibold">Three Restaurantes — Testes</h1>
          </div>
          <button
            onClick={carregar}
            disabled={rodando}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-50"
          >
            <RefreshCw size={15} className={rodando ? "animate-spin" : ""} /> Rodar de novo
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <StatCard valor={resumo.total} label="testes" />
          <StatCard valor={resumo.passed} label="passaram" cor="#22c55e" />
          <StatCard valor={resumo.failed} label="falharam" cor={resumo.failed ? "#ef4444" : "#6b7280"} />
          <StatCard valor={`${duracaoMs} ms`} label="duração da execução" cor="#38bdf8" />
          <StatCard valor={resumo.modulos} label="módulos" />
        </div>

        <div className="mt-3 text-xs text-neutral-400 inline-flex items-center gap-1">
          <Clock size={14} /> Última execução: {new Date(horario).toLocaleString("pt-BR")}
        </div>

        <div
          className="mt-4 rounded-lg border p-3 text-sm"
          style={resumo.failed === 0
            ? { borderColor: "#22c55e55", background: "#22c55e14", color: "#86efac" }
            : { borderColor: "#ef444455", background: "#ef444414", color: "#fca5a5" }}
        >
          {resumo.failed === 0
            ? `✓ Sistema em operação: todos os ${resumo.total} testes passaram.`
            : `${resumo.failed} teste(s) falhando — veja os detalhes em vermelho abaixo.`}
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
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800"><Icon size={18} /></span>
              <h2 className="text-lg font-medium">{cat}</h2>
              <span className="text-xs text-neutral-500">{catCasos.length} testes · {catMs} ms · {catFail === 0 ? "tudo ok" : `${catFail} falha(s)`}</span>
            </div>
            <div className="space-y-3">
              {suites.map((s, idx) => {
                const sFail = s.casos.filter((c) => c.status === "failed").length;
                const okAll = sFail === 0;
                return (
                  <div key={idx} className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                    <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {okAll ? <CheckCircle2 size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
                          <h3 className="font-medium">{s.nome}</h3>
                        </div>
                        <p className="mt-1 text-xs text-neutral-400">{s.descricao}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-600">{s.modulo}</p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-xs font-medium" style={{ color: okAll ? "#22c55e" : "#ef4444" }}>
                          {okAll ? `${s.casos.length}/${s.casos.length} ok` : `${sFail} de ${s.casos.length} falhou`}
                        </div>
                        <div className="text-[11px] text-neutral-500 inline-flex items-center gap-1 justify-end"><Clock size={11} /> {s.ms} ms</div>
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

      {historico.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800"><Clock size={18} /></span>
            <h2 className="text-lg font-medium">Últimas execuções</h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-neutral-400">
                <tr>
                  <th className="px-4 py-2 text-left font-normal">Quando</th>
                  <th className="px-4 py-2 text-right font-normal">Passou</th>
                  <th className="px-4 py-2 text-right font-normal">Falhou</th>
                  <th className="px-4 py-2 text-right font-normal">Duração</th>
                  <th className="px-4 py-2 text-left font-normal">Por</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h, i) => (
                  <tr key={i} className="border-t border-neutral-800/60">
                    <td className="px-4 py-2 text-neutral-300">{new Date(h.horario).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right text-green-400">{h.passed}</td>
                    <td className="px-4 py-2 text-right" style={{ color: h.failed ? "#ef4444" : "#6b7280" }}>{h.failed}</td>
                    <td className="px-4 py-2 text-right text-sky-400">{h.ms} ms</td>
                    <td className="px-4 py-2 text-neutral-400">{h.por || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Centro({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl p-10 text-neutral-300">
      <div className="flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-8">
        {children}
      </div>
    </main>
  );
}
