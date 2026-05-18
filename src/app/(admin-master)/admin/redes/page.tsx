"use client";

/**
 * /admin/redes — master gerencia redes de filiais.
 */
import { useEffect, useState, useCallback } from "react";
import { Network, Plus, ChevronRight, Loader2, Building2 } from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";

interface Rede {
  id: string; nome: string; cnpj_matriz: string | null;
  fidelidade_cross_filial: boolean; cardapio_sincronizado: boolean;
  desconto_progressivo_pct: number;
  plano_nome: string | null;
  qtd_filiais: string;
  created_at: string;
}

export default function RedesPage() {
  const [list, setList] = useState<Rede[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/redes", { headers: auth() }).then(r => r.json());
      if (r.success) setList(r.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criar() {
    if (novoNome.trim().length < 2) return;
    setCriando(true);
    try {
      const r = await fetch("/api/admin/redes", {
        method: "POST", headers: auth(),
        body: JSON.stringify({ nome: novoNome.trim() }),
      });
      const d = await r.json();
      if (!d.success) {
        await alertar({ titulo: "Falha", mensagem: typeof d.error === "string" ? d.error : "?", tipo: "perigo" });
        return;
      }
      setNovoNome("");
      carregar();
    } finally { setCriando(false); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Redes de filiais</h1>
            <p className="text-xs text-slate-400">Agrupe múltiplas empresas como filiais de uma mesma rede</p>
          </div>
        </div>
      </div>

      {/* Criar nova */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-300">Nova rede</p>
        <div className="flex gap-2">
          <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
            placeholder="Nome da rede (ex: Three Burguer)"
            className="flex-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          <button onClick={criar} disabled={criando || novoNome.trim().length < 2}
            className="flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-400">
          Nenhuma rede criada ainda. Crie uma acima.
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map(r => (
            <a key={r.id} href={`/admin/redes/${r.id}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15">
                <Network className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white">{r.nome}</h3>
                <p className="text-xs text-slate-400">
                  <Building2 className="inline h-3 w-3 mr-1" />
                  {r.qtd_filiais} filiais
                  {r.plano_nome && ` · plano ${r.plano_nome}`}
                  {r.cardapio_sincronizado && " · cardápio sincronizado"}
                  {r.fidelidade_cross_filial && " · fidelidade compartilhada"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-500" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
