"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Hash,
  History,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
} from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

function previewSistema(empresaId: string) {
  return `${empresaId}${Date.now().toString().slice(-6)}`;
}

export default function ConfiguracoesEmpresa({ empresaId }: { empresaId: string }) {
  const [empresa, setEmpresa] = useState<any>(null);
  const [modo, setModo] = useState("sistema");
  const [numeroInicial, setNumeroInicial] = useState("1");
  const [proximoNumero, setProximoNumero] = useState("1");
  const [ultimoNumero, setUltimoNumero] = useState("0");
  const [prefixo, setPrefixo] = useState("");
  const [resetar, setResetar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const preview = useMemo(() => {
    if (modo === "sequencial") {
      return `${prefixo || ""}${Math.max(Number(proximoNumero || numeroInicial || 1), 1)}`;
    }

    return previewSistema(empresaId);
  }, [modo, prefixo, proximoNumero, numeroInicial, empresaId]);

  async function carregar() {
    try {
      setLoading(true);
      setMsg("");

      const res = await fetch(
        `${API}/api/db/empresas_cardapio?where=(Id,eq,${empresaId})&limit=1`,
        { cache: "no-store" }
      );

      const data = await res.json();
      const item = data?.list?.[0] || null;

      setEmpresa(item);
      setModo(item?.modo_numeracao_pedidos || "sistema");
      setNumeroInicial(String(item?.numero_inicial_pedido || 1));
      setProximoNumero(String(item?.proximo_numero_pedido || item?.numero_inicial_pedido || 1));
      setUltimoNumero(String(item?.ultimo_numero_pedido || 0));
      setPrefixo(String(item?.prefixo_pedido || ""));
      setResetar(false);
      setMotivo("");

      await carregarLogs();
    } catch {
      setMsg("Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarLogs() {
    try {
      const res = await fetch(
        `${API}/api/cardapio/admin/empresas/${empresaId}/numeracao-pedidos/logs`,
        { cache: "no-store" }
      );

      const data = await res.json();
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch {
      setLogs([]);
    }
  }

  useEffect(() => {
    carregar();
  }, [empresaId]);

  async function salvar(event: FormEvent) {
    event.preventDefault();

    try {
      setSalvando(true);
      setMsg("");

      const numeroInicialSeguro = Math.max(Number(numeroInicial || 1), 1);
      const proximoNumeroSeguro = Math.max(Number(proximoNumero || numeroInicialSeguro), 1);
      const ultimoNumeroSeguro = Math.max(Number(ultimoNumero || 0), 0);

      if (modo === "sequencial" && proximoNumeroSeguro <= ultimoNumeroSeguro) {
        throw new Error("O próximo número precisa ser maior que o último número usado.");
      }

      const res = await fetch(
        `${API}/api/cardapio/admin/empresas/${empresaId}/numeracao-pedidos`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            modo_numeracao_pedidos: modo,
            prefixo_pedido: prefixo.trim(),
            numero_inicial_pedido: numeroInicialSeguro,
            proximo_numero_pedido: proximoNumeroSeguro,
            ultimo_numero_pedido: ultimoNumeroSeguro,
            resetar_sequencia: resetar,
            usuario_nome: "Admin",
            motivo: motivo || "Alteração manual na numeração de pedidos",
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao salvar configuração.");
      }

      setMsg("Controle de pedidos salvo com sucesso.");
      await carregar();
    } catch (error: any) {
      setMsg(error?.message || "Erro ao salvar configuração.");
    } finally {
      setSalvando(false);
    }
  }

  function prepararReset() {
    setResetar(true);
    setProximoNumero(numeroInicial || "1");
    setUltimoNumero("0");
    setMotivo("Reset manual da sequência de pedidos");
  }

  return (
    <section className="space-y-6 text-white">
      <header>
        <h1 className="text-3xl font-black">Configurações</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Controle avançado da operação e numeração dos pedidos.
        </p>
      </header>

      {msg && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm">
          {msg}
        </div>
      )}

      <form
        onSubmit={salvar}
        className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-400 p-3 text-black">
            <Hash className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-xl font-black">Controle avançado de pedidos</h2>
            <p className="text-sm text-zinc-500">
              Escolha o padrão de numeração, veja o próximo pedido e controle a sequência.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-black/30 p-4 text-zinc-400">
            Carregando configurações...
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-bold text-zinc-400">
                Tipo de numeração
              </span>
              <select
                value={modo}
                onChange={(event) => setModo(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none"
              >
                <option value="sistema">Gerada pelo sistema</option>
                <option value="sequencial">Sequencial da empresa</option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-sm font-bold text-zinc-400">
                Prefixo opcional
              </span>
              <input
                value={prefixo}
                onChange={(event) => setPrefixo(event.target.value.toUpperCase())}
                placeholder="Ex: PED-"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-bold text-zinc-400">
                Primeiro número da sequência
              </span>
              <input
                type="number"
                min={1}
                value={numeroInicial}
                onChange={(event) => {
                  setNumeroInicial(event.target.value);

                  if (!empresa?.ultimo_numero_pedido || Number(empresa?.ultimo_numero_pedido) <= 0) {
                    setProximoNumero(event.target.value);
                  }
                }}
                disabled={modo !== "sequencial"}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none disabled:opacity-50"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-bold text-zinc-400">
                Próximo número que será usado
              </span>
              <input
                type="number"
                min={1}
                value={proximoNumero}
                onChange={(event) => setProximoNumero(event.target.value)}
                disabled={modo !== "sequencial"}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none disabled:opacity-50"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-bold text-zinc-400">
                Último número usado
              </span>
              <input
                type="number"
                min={0}
                value={ultimoNumero}
                onChange={(event) => setUltimoNumero(event.target.value)}
                disabled={modo !== "sequencial"}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none disabled:opacity-50"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-bold text-zinc-400">
                Motivo da alteração
              </span>
              <input
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Ex: ajustando sequência inicial"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
              />
            </label>
          </div>
        )}

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <p className="text-sm text-emerald-100/70">Prévia do próximo pedido</p>
            <p className="mt-2 text-3xl font-black text-emerald-200">{preview}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-sm text-white/50">Modo atual</p>
            <p className="mt-2 text-xl font-black">
              {modo === "sequencial" ? "Sequencial" : "Sistema"}
            </p>
          </div>

          <button
            type="button"
            onClick={prepararReset}
            disabled={modo !== "sequencial"}
            className="flex items-center justify-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 font-black text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-40"
          >
            <RotateCcw className="h-5 w-5" />
            Resetar sequência
          </button>
        </div>

        {resetar && (
          <div className="mt-5 flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>
              O próximo pedido voltará para o número inicial informado. Salve apenas se tiver certeza
              que não haverá conflito com pedidos já emitidos.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={salvando || loading}
          className="mt-6 flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 font-black text-black transition hover:bg-emerald-300 disabled:opacity-60"
        >
          {salvando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {salvando ? "Salvando..." : "Salvar controle de pedidos"}
        </button>
      </form>

      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <div className="mb-5 flex items-center gap-3">
          <History className="h-5 w-5 text-emerald-300" />
          <h2 className="text-xl font-black">Histórico de alterações</h2>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-2xl bg-black/30 p-4 text-sm text-zinc-500">
            Nenhum histórico registrado ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.Id} className="rounded-2xl bg-black/30 p-4">
                <div className="flex items-center gap-2 text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  <strong>{log.titulo || "Numeração alterada"}</strong>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{log.descricao}</p>
                <p className="mt-2 text-xs text-zinc-600">{log.criado_em}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {[
          ["Pagamentos", "Dinheiro, Pix, cartão/pinpad e Mercado Pago."],
          ["Integrações externas", "Consumer, iFood, Anota AI e API pública."],
          ["Impressão", "Setores, impressoras, agente local e fila."],
          ["Operação", "Horários, mesas, retirada, delivery e loja."],
        ].map(([title, desc]) => (
          <div key={title} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <Settings className="h-5 w-5 text-emerald-300" />
            <h2 className="mt-4 text-xl font-black">{title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{desc}</p>
            <button
              type="button"
              className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white"
            >
              Em breve
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
