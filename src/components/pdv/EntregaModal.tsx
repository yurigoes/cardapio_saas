"use client";

/**
 * EntregaModal — coleta endereço + taxa de entrega antes de finalizar pedido
 * de delivery no PDV/balcão.
 *
 * Pré-preenche com endereço cadastrado do cliente (se houver) e taxa padrão
 * da empresa. Operador pode ajustar manualmente.
 */
import { useEffect, useState } from "react";
import { Bike, X, MapPin, DollarSign, User, Loader2 } from "lucide-react";

export interface EnderecoEntrega {
  rua:         string;
  numero:      string;
  complemento: string;
  bairro:      string;
  cidade:      string;
  cep:         string;
  referencia:  string;
}

export interface EntregaResult {
  endereco:     EnderecoEntrega;
  taxa_entrega: number;
}

interface Props {
  open:        boolean;
  cliente?:    { nome: string | null; telefone: string | null } | null;
  enderecoCadastrado?: Partial<EnderecoEntrega> | null;
  taxaPadrao?: number;
  onClose:     () => void;
  onConfirm:   (r: EntregaResult) => void;
}

export function EntregaModal({
  open, cliente, enderecoCadastrado, taxaPadrao, onClose, onConfirm,
}: Props) {
  const [end, setEnd] = useState<EnderecoEntrega>({
    rua: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "", referencia: "",
  });
  const [taxa, setTaxa] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  // Re-popula quando abre
  useEffect(() => {
    if (!open) return;
    setEnd({
      rua:         enderecoCadastrado?.rua         ?? "",
      numero:      enderecoCadastrado?.numero      ?? "",
      complemento: enderecoCadastrado?.complemento ?? "",
      bairro:      enderecoCadastrado?.bairro      ?? "",
      cidade:      enderecoCadastrado?.cidade      ?? "",
      cep:         enderecoCadastrado?.cep         ?? "",
      referencia:  enderecoCadastrado?.referencia  ?? "",
    });
    setTaxa(taxaPadrao != null ? String(taxaPadrao) : "");
  }, [open, enderecoCadastrado, taxaPadrao]);

  if (!open) return null;

  function confirmar() {
    if (!end.rua.trim() || !end.numero.trim()) {
      // validação mínima
      return;
    }
    const taxaNum = Number(taxa.replace(",", "."));
    setSalvando(true);
    onConfirm({
      endereco: end,
      taxa_entrega: Number.isFinite(taxaNum) ? taxaNum : 0,
    });
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
         onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 shadow-2xl my-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <div className="flex items-center gap-2">
            <Bike className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Endereço de entrega</h2>
          </div>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {cliente && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300 flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span>{cliente.nome ?? "Cliente"} · {cliente.telefone ?? "—"}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">Rua *</span>
              <input value={end.rua} onChange={e => setEnd({ ...end, rua: e.target.value })}
                placeholder="Av. Brasil"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">Número *</span>
              <input value={end.numero} onChange={e => setEnd({ ...end, numero: e.target.value })}
                placeholder="123"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">Complemento</span>
              <input value={end.complemento} onChange={e => setEnd({ ...end, complemento: e.target.value })}
                placeholder="Apto 101"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">Bairro</span>
              <input value={end.bairro} onChange={e => setEnd({ ...end, bairro: e.target.value })}
                placeholder="Centro"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">Cidade</span>
              <input value={end.cidade} onChange={e => setEnd({ ...end, cidade: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400 mb-1 block">CEP</span>
              <input value={end.cep} onChange={e => setEnd({ ...end, cep: e.target.value })}
                placeholder="00000-000"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-400 mb-1 block">Ponto de referência</span>
            <input value={end.referencia} onChange={e => setEnd({ ...end, referencia: e.target.value })}
              placeholder="Próximo ao mercado"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <label className="block">
              <span className="text-xs font-bold text-amber-300 mb-1 flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                Taxa de entrega (R$)
              </span>
              <input type="text" inputMode="decimal" value={taxa}
                onChange={e => setTaxa(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-amber-500/30 bg-slate-900 px-3 py-2 text-sm text-white font-bold" />
              <p className="mt-1 text-[10px] text-amber-200/80">
                {taxaPadrao != null
                  ? `Taxa padrão da empresa: R$ ${taxaPadrao.toFixed(2).replace(".", ",")}. Edite se necessário.`
                  : "Edite conforme distância/zona."}
              </p>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 p-4 gap-2">
          <button onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            Cancelar
          </button>
          <button onClick={confirmar}
            disabled={salvando || !end.rua.trim() || !end.numero.trim()}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Confirmar e criar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
