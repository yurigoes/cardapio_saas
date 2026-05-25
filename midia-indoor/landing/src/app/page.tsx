import Link from "next/link";
import {
  MonitorPlay, MapPin, CalendarClock, BarChart3, Megaphone, Image as ImageIcon,
  Check, ArrowRight, Tv, Clock,
} from "lucide-react";
import { locaisVitrine, pacotesVitrine } from "@/lib/vitrine";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TIPO_LABEL: Record<string, string> = { video: "Vídeo", banner_estatico: "Banner estático", banner_eletronico: "Banner eletrônico", peca: "Peça publicitária" };

export default async function LandingPage() {
  const [locais, pacotes, marca] = await Promise.all([locaisVitrine(), pacotesVitrine(), getBranding()]);
  const cidades = Array.from(new Set(locais.map(l => l.cidade).filter(Boolean))) as string[];

  return (
    <main className="min-h-screen bg-[#0a0a12] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a12]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            {marca.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={marca.logo_url} alt={marca.nome} className="h-8 max-w-[180px] object-contain" />
              : <><Tv className="h-6 w-6 text-brand-light" /><span className="text-lg font-bold">{marca.nome}</span></>}
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#locais" className="hover:text-white">Onde anunciar</a>
            <a href="#pacotes" className="hover:text-white">Pacotes</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/painel" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5 transition">Sou anunciante</Link>
            <a href="#contato" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark transition">Anunciar agora</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <span className="inline-block rounded-full border border-brand/40 bg-brand/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-light">
            Rede de Mídia Indoor
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
            Anuncie sua marca nas <span className="text-brand-light">telas certas</span>, na hora certa
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            Sua propaganda rodando em telas espalhadas pela cidade — você escolhe os locais,
            quantas inserções por dia e por quanto tempo. A gente cuida do resto.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#contato" className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold hover:bg-brand-dark transition">
              Quero anunciar <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#pacotes" className="rounded-xl border border-white/15 px-6 py-3 font-semibold hover:bg-white/5 transition">Ver pacotes</a>
          </div>
          {(locais.length > 0 || cidades.length > 0) && (
            <div className="mt-12 flex items-center justify-center gap-8 text-center">
              <div><p className="text-3xl font-black text-brand-light">{locais.length}+</p><p className="text-xs text-slate-400">pontos de mídia</p></div>
              {cidades.length > 0 && <div><p className="text-3xl font-black text-brand-light">{cidades.length}</p><p className="text-xs text-slate-400">cidade{cidades.length > 1 ? "s" : ""}</p></div>}
            </div>
          )}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Como funciona</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-4">
          {[
            { icon: MapPin, t: "1. Escolha os locais", d: "Selecione em quais pontos da nossa rede sua marca vai aparecer." },
            { icon: ImageIcon, t: "2. Envie sua arte", d: "Mande seu vídeo, banner ou peça publicitária. Você gerencia tudo no painel." },
            { icon: CalendarClock, t: "3. Defina o plano", d: "Quantas inserções por dia, segundos por inserção e por quantos dias." },
            { icon: BarChart3, t: "4. Acompanhe", d: "Veja em tempo real quando e onde seu anúncio tocou — total transparência." },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <s.icon className="mx-auto h-8 w-8 text-brand-light" />
              <h3 className="mt-4 font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm text-slate-400">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Por que */}
      <section className="border-y border-white/5 bg-white/[0.02] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold">Por que anunciar com a gente</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: MonitorPlay, t: "Impacto visual", d: "Telas em locais de grande circulação, com sua marca em destaque." },
              { icon: BarChart3, t: "Relatório de exibições", d: "Comprovação de cada inserção: data, hora e local. Sem caixa-preta." },
              { icon: Megaphone, t: "Flexível", d: "Campanhas a partir de poucos dias. Troque a arte quando quiser." },
            ].map((r, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <r.icon className="h-8 w-8 text-brand-light" />
                <h3 className="mt-4 text-lg font-semibold">{r.t}</h3>
                <p className="mt-2 text-sm text-slate-400">{r.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Locais */}
      {locais.length > 0 && (
        <section id="locais" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold">Onde sua marca pode aparecer</h2>
          <p className="mt-3 text-center text-slate-400">Pontos da nossa rede de mídia indoor.</p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {locais.map((l, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <MapPin className="h-5 w-5 flex-shrink-0 text-brand-light" />
                <div><p className="font-medium">{l.nome}</p>{l.cidade && <p className="text-xs text-slate-400">{l.cidade}</p>}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pacotes */}
      {pacotes.length > 0 && (
        <section id="pacotes" className="border-t border-white/5 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold">Pacotes</h2>
            <p className="mt-3 text-center text-slate-400">Escolha o que faz sentido pra sua campanha. Personalizamos se precisar.</p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {pacotes.map(p => (
                <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-light">{TIPO_LABEL[p.tipo] ?? p.tipo}</span>
                  <h3 className="mt-1 text-xl font-bold">{p.nome}</h3>
                  <ul className="mt-4 space-y-2 text-sm text-slate-300">
                    <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-light" /> {p.insercoes_dia} inserções por dia</li>
                    <li className="flex items-center gap-2"><MonitorPlay className="h-4 w-4 text-brand-light" /> {p.segundos}s por inserção</li>
                    <li className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-brand-light" /> {p.dias} dias de campanha</li>
                  </ul>
                  {p.preco > 0 && <p className="mt-4 text-3xl font-black text-brand-light">{brl(p.preco)}</p>}
                  <a href="#contato" className="mt-6 block rounded-xl bg-brand py-3 text-center font-semibold hover:bg-brand-dark transition">Quero este</a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contato / CTA */}
      <section id="contato" className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold">Pronto pra colocar sua marca no ar?</h2>
        <p className="mt-4 text-slate-300">Fale com a gente. Montamos sua campanha do jeito que você precisa.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/cadastro" className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-4 text-lg font-semibold hover:bg-brand-dark transition">
            Falar com a equipe <ArrowRight className="h-5 w-5" />
          </Link>
          <Link href="/painel" className="rounded-xl border border-white/15 px-8 py-4 text-lg font-semibold hover:bg-white/5 transition">Já sou anunciante</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} {marca.nome}. Todos os direitos reservados.</p>
        <p className="mt-1">{(marca.site ?? "").replace("https://", "")} · <Link href="/guia" className="text-brand-light hover:underline">Guia de instalação</Link></p>
      </footer>
    </main>
  );
}
