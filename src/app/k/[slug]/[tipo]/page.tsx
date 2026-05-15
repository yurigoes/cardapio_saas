"use client";

/**
 * /k/[slug]/[tipo] — painéis kiosk públicos.
 *
 * Tipos: cozinha | tv | delivery
 * Sem login — auth via token kio_xxx no query string.
 *
 * Auto-refresh a cada 5s.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChefHat, Tv2, Bike, AlertTriangle, Clock } from "lucide-react";
import { KioskMirror } from "@/components/KioskMirror";

interface Pedido {
  id: string; numero: number; tipo: string; status: string;
  total: number | string;
  cliente_nome: string | null;
  observacoes: string | null;
  mesa_numero: number | null;
  tempo_espera_seg: number;
  created_at: string;
}

const TIPO_INFO: Record<string, { icon: React.ComponentType<{ className?: string }>; titulo: string; cor: string }> = {
  cozinha:  { icon: ChefHat, titulo: "Cozinha",        cor: "text-orange-400" },
  tv:       { icon: Tv2,     titulo: "Painel TV",      cor: "text-blue-400" },
  delivery: { icon: Bike,    titulo: "Delivery",       cor: "text-emerald-400" },
};

const STATUS_COR: Record<string, string> = {
  confirmado: "border-blue-500/40 bg-blue-500/10",
  preparando: "border-amber-500/40 bg-amber-500/10",
  preparo:    "border-amber-500/40 bg-amber-500/10",
  pronto:     "border-emerald-500/40 bg-emerald-500/10",
  em_rota:    "border-purple-500/40 bg-purple-500/10",
  saiu_entrega: "border-purple-500/40 bg-purple-500/10",
};

const STATUS_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  preparando: "Preparando",
  preparo:    "Preparando",
  pronto:     "Pronto",
  em_rota:    "Em rota",
  saiu_entrega: "Saiu pra entrega",
};

function formatarTempo(seg: number): string {
  const m = Math.floor(seg / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}min`;
}

export default function KioskPage() {
  const { slug, tipo } = useParams<{ slug: string; tipo: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [erro, setErro]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!token) { setErro("Token kiosk ausente. Configure em /painel/integracoes ou /admin."); return; }
    try {
      const r = await fetch(`/api/k/${slug}/${tipo}/pedidos?t=${encodeURIComponent(token)}`);
      const d = await r.json();
      if (d.ok) {
        setPedidos(d.pedidos ?? []);
        setErro(null);
      } else {
        setErro(d.error ?? "Falha");
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally { setLoading(false); }
  }, [slug, tipo, token]);

  useEffect(() => {
    carregar();
    const i = setInterval(carregar, 5000);
    return () => clearInterval(i);
  }, [carregar]);

  const info = TIPO_INFO[tipo as string];
  if (!info) return <ErroFatal mensagem={`Tipo desconhecido: ${tipo}`} />;
  if (erro)  return <ErroFatal mensagem={erro} info={info} />;

  const Icon = info.icon;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <KioskMirror />{/* envia screenshots se há agent_token salvo */}
      <header className="sticky top-0 z-10 border-b border-white/5 bg-slate-950/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl bg-white/5 p-2`}>
              <Icon className={`h-6 w-6 ${info.cor}`} />
            </div>
            <div>
              <h1 className="text-xl font-bold">{info.titulo}</h1>
              <p className="text-xs text-slate-400">/{slug}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{pedidos.length}</p>
            <p className="text-xs text-slate-500">pedido(s)</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {loading && pedidos.length === 0 ? (
          <p className="text-center text-slate-500 py-12">Carregando...</p>
        ) : pedidos.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-2xl text-slate-500">Sem pedidos</p>
            <p className="text-sm text-slate-600 mt-2">Aguardando novos pedidos...</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pedidos.map(p => (
              <div key={p.id} className={`rounded-2xl border-2 p-4 ${STATUS_COR[p.status] ?? "border-white/10 bg-white/5"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-3xl font-bold text-white">#{p.numero}</p>
                    <p className="text-xs uppercase font-bold text-slate-400 mt-0.5">
                      {STATUS_LABEL[p.status] ?? p.status}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatarTempo(p.tempo_espera_seg)}
                  </span>
                </div>
                <p className="text-sm text-slate-300">
                  {p.tipo === "mesa" && p.mesa_numero ? `Mesa ${p.mesa_numero}` : p.tipo}
                  {p.cliente_nome && ` · ${p.cliente_nome}`}
                </p>
                {p.observacoes && (
                  <p className="text-xs text-amber-300 mt-2 bg-amber-500/10 rounded p-2">
                    📝 {p.observacoes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ErroFatal({ mensagem, info }: { mensagem: string; info?: { icon: React.ComponentType<{ className?: string }>; titulo: string } }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold">{info?.titulo ?? "Painel Kiosk"}</h1>
        <p className="text-sm text-slate-400 mt-2">{mensagem}</p>
        <p className="text-xs text-slate-600 mt-4">
          Vai em <code>/painel/integracoes</code> → <em>Painéis kiosk</em> pra gerar uma URL com token.
        </p>
      </div>
    </div>
  );
}
