"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { MapPin, Monitor, Users, ArrowRight, Mail } from "lucide-react";

interface LocalPublico { id: string; nome: string; cidade: string | null; descricao: string | null; lat: number | null; lng: number | null; passantes_dia: number | null; largura: number; altura: number; orientacao: string; }

export default function InventarioPublico() {
  const [locais, setLocais] = useState<LocalPublico[]>([]);
  const [busca, setBusca] = useState("");
  useEffect(() => { fetch("/api/publico/locais").then(r => r.json()).then(d => d.ok && setLocais(d.locais)); }, []);
  const filtrados = locais.filter(l => !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || (l.cidade ?? "").toLowerCase().includes(busca.toLowerCase()));
  const cidades = Array.from(new Set(locais.map(l => l.cidade).filter(Boolean))) as string[];
  const totalPassantes = locais.reduce((s, l) => s + (l.passantes_dia ?? 0), 0);

  return (
    <main className="min-h-screen bg-[#0a0a12] text-white">
      <header className="border-b border-white/10 bg-[#12121c]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-brand-light">Three Digital Mídia</Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">← Voltar</Link>
        </div>
      </header>

      <section className="border-b border-white/10 bg-gradient-to-b from-brand/10 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-12 text-center">
          <h1 className="text-4xl font-bold">Nossa rede de mídia indoor</h1>
          <p className="mt-3 text-slate-300">Anuncie a sua marca em pontos estratégicos. Telas certificadas, audiência mensurada, relatório transparente.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2"><Monitor className="h-5 w-5 text-brand-light" /><strong>{locais.length}</strong> telas ativas</div>
            <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-brand-light" /><strong>{cidades.length}</strong> cidades</div>
            {totalPassantes > 0 && <div className="flex items-center gap-2"><Users className="h-5 w-5 text-brand-light" /><strong>{totalPassantes.toLocaleString("pt-BR")}</strong> impactos/dia (estimativa)</div>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar local ou cidade…" className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none focus:border-brand/50" />
          <a href="mailto:contato@tthreedigital.com.br?subject=Quero anunciar na rede" className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold hover:bg-brand-dark">
            <Mail className="h-4 w-4" /> Quero anunciar
          </a>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtrados.map(l => (
            <div key={l.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/[0.07]">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-bold">{l.nome}</h3>
                <span className="rounded bg-brand/20 px-2 py-0.5 text-xs text-brand-light">{l.orientacao === "paisagem" ? "🖥️ Paisagem" : "📱 Retrato"}</span>
              </div>
              {l.cidade && <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" />{l.cidade}</p>}
              {l.descricao && <p className="mt-2 text-sm text-slate-300">{l.descricao}</p>}
              <div className="mt-3 flex gap-3 text-xs">
                <span className="text-slate-400">{l.largura}×{l.altura}px</span>
                {l.passantes_dia && l.passantes_dia > 0 && <span className="text-emerald-300">~{l.passantes_dia.toLocaleString("pt-BR")} passantes/dia</span>}
              </div>
            </div>
          ))}
          {!filtrados.length && <p className="col-span-full p-12 text-center text-slate-500">Nenhum local encontrado.</p>}
        </div>

        <div className="mt-12 rounded-2xl border border-brand/30 bg-brand/5 p-8 text-center">
          <h2 className="text-2xl font-bold text-brand-light">Quer anunciar?</h2>
          <p className="mt-2 text-slate-300">Entre em contato e montamos a campanha ideal pra sua marca.</p>
          <a href="mailto:contato@tthreedigital.com.br?subject=Quero anunciar na rede" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold hover:bg-brand-dark">
            <Mail className="h-4 w-4" /> Fale conosco <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </main>
  );
}
