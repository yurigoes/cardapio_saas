"use client";

/**
 * Card que mostra todos os links externos relevantes da empresa
 * (URL pública do cardápio, totem, etc) e do SaaS (master only).
 *
 * Cada link tem botão "copiar" e "abrir em nova aba".
 */
import { useEffect, useState } from "react";
import { ExternalLink, Copy, Check, Globe, Tv2, MapPin, Code,
         Server, MessageCircle, Database, Zap } from "lucide-react";

interface Link {
  url:        string;
  titulo:     string;
  descricao:  string;
  icon:       React.ComponentType<{ className?: string }>;
  cor:        string;
  masterOnly?: boolean;
}

interface Props {
  empresaSlug?:  string | null;
  empresaId?:    string;
  isMaster?:     boolean;
  baseUrl?:      string; // override para testes
}

export function LinksExternos({ empresaSlug: slugProp, isMaster: masterProp, baseUrl }: Props) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const [slug, setSlug]       = useState<string | null>(slugProp ?? null);
  const [isMaster, setIsMaster] = useState<boolean>(masterProp ?? false);

  // Auto-fetch /api/auth/me se não recebeu via prop
  useEffect(() => {
    if (slug != null) return; // já tem
    const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!t) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setSlug(d.data?.empresa?.slug ?? null);
          if (d.data?.usuario?.role === "master") setIsMaster(true);
        }
      })
      .catch(() => {});
  }, [slug]);

  const base = baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://app.tthreedigital.com.br");
  const empresaSlug = slug;

  // Substitui app.X por subdomain.X pros serviços
  const subdomain = (sub: string) => base.replace(/\/\/app\./, `//${sub}.`);

  const links: Link[] = [
    {
      url:       `${base}/${empresaSlug ?? "(sem-slug)"}`,
      titulo:    "Cardápio público",
      descricao: "Link pra clientes pedirem online (mande pelo WhatsApp, redes sociais, QR)",
      icon:      Globe,
      cor:       "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
    },
    {
      url:       `${base}/totem/${empresaSlug ?? "(sem-slug)"}`,
      titulo:    "Totem de autoatendimento",
      descricao: "Abra em fullscreen no totem físico do estabelecimento",
      icon:      Tv2,
      cor:       "text-purple-400 border-purple-500/30 bg-purple-500/5",
    },
    {
      url:       `${base}/rastrear`,
      titulo:    "Rastreamento de pedido",
      descricao: "Página pública pra cliente acompanhar entrega do delivery",
      icon:      MapPin,
      cor:       "text-blue-400 border-blue-500/30 bg-blue-500/5",
    },
    {
      url:       `${base}/docs/api`,
      titulo:    "Documentação da API",
      descricao: "API REST v1 pra integrações externas (Swagger UI)",
      icon:      Code,
      cor:       "text-slate-400 border-slate-500/30 bg-slate-500/5",
    },
    // Master-only
    {
      url:        `${subdomain("evolution")}/manager`,
      titulo:     "Evolution Manager",
      descricao:  "Painel WhatsApp — criar instâncias, escanear QR, ver status",
      icon:       MessageCircle,
      cor:        "text-green-400 border-green-500/30 bg-green-500/5",
      masterOnly: true,
    },
    {
      url:        subdomain("minio-console"),
      titulo:     "MinIO Console",
      descricao:  "Storage S3 — gerenciar uploads de imagens/vídeos",
      icon:       Database,
      cor:        "text-amber-400 border-amber-500/30 bg-amber-500/5",
      masterOnly: true,
    },
    {
      url:        subdomain("n8n"),
      titulo:     "n8n Automações",
      descricao:  "Workflows visuais (aniversário, fidelidade, alertas)",
      icon:       Zap,
      cor:        "text-pink-400 border-pink-500/30 bg-pink-500/5",
      masterOnly: true,
    },
    {
      url:        `${base}/admin/vps`,
      titulo:     "Painel VPS",
      descricao:  "Status, comandos, deploy, logs do servidor",
      icon:       Server,
      cor:        "text-red-400 border-red-500/30 bg-red-500/5",
      masterOnly: true,
    },
  ];

  const visiveis = links.filter(l => !l.masterOnly || isMaster);

  function copiar(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(url);
      setTimeout(() => setCopiado(null), 2000);
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
        <ExternalLink className="h-4 w-4" /> Links do sistema
      </h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {visiveis.map(l => {
          const Icon = l.icon;
          return (
            <div key={l.url} className={`rounded-xl border p-3 ${l.cor}`}>
              <div className="flex items-start gap-2 mb-1">
                <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm">{l.titulo}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{l.descricao}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <code className="flex-1 truncate text-[10px] text-slate-300 font-mono bg-slate-900/50 px-2 py-1 rounded">
                  {l.url}
                </code>
                <button onClick={() => copiar(l.url)} title="Copiar"
                  className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
                  {copiado === l.url ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a href={l.url} target="_blank" rel="noopener noreferrer" title="Abrir"
                  className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
