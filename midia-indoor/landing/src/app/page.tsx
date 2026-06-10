import Link from "next/link";
import {
  MonitorPlay, MapPin, CalendarClock, BarChart3, Megaphone, Image as ImageIcon,
  ArrowRight, Tv, Clock,
} from "lucide-react";
import { locaisVitrine, pacotesVitrine, cidadesVitrine } from "@/lib/vitrine";
import { getBranding } from "@/lib/branding";
import { LoginDropdown } from "@/components/LoginDropdown";

export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TIPO_LABEL: Record<string, string> = { video: "Vídeo", banner_estatico: "Banner estático", banner_eletronico: "Banner eletrônico", peca: "Peça publicitária" };

export default async function LandingPage() {
  const [locais, pacotes, marca, cidadesAgrupadas] = await Promise.all([locaisVitrine(), pacotesVitrine(), getBranding(), cidadesVitrine()]);
  const cidades = Array.from(new Set(locais.map(l => l.cidade).filter(Boolean))) as string[];
  const totalTelas = cidadesAgrupadas.reduce((s, c) => s + c.n_telas, 0);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#05060f] text-white">
      {/* ===== Fundo elaborado (3 camadas) ===== */}
      {/* 1. Gradiente radial roxo/azul */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,#2d1b69_0%,#1a0a4a_25%,#05060f_70%)]" />
      {/* 2. Grid sutil */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        style={{
          backgroundImage: "linear-gradient(rgba(124,58,237,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.08) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* 3. Curvas/glow SVG */}
      <svg className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-60" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
          <filter id="blur1"><feGaussianBlur stdDeviation="30" /></filter>
        </defs>
        <path d="M -200 600 Q 480 300 960 540 T 2120 480" stroke="url(#g1)" strokeWidth="3" fill="none" filter="url(#blur1)" />
        <path d="M -200 900 Q 480 600 960 800 T 2120 750" stroke="url(#g2)" strokeWidth="2" fill="none" filter="url(#blur1)" />
        <path d="M -200 750 Q 800 400 1200 650 T 2200 500" stroke="url(#g1)" strokeWidth="1.5" fill="none" opacity="0.7" />
        {/* glow blobs */}
        <circle cx="200" cy="300" r="180" fill="#7c3aed" opacity="0.15" filter="url(#blur1)" />
        <circle cx="1700" cy="200" r="220" fill="#06b6d4" opacity="0.12" filter="url(#blur1)" />
        <circle cx="1500" cy="800" r="200" fill="#3b82f6" opacity="0.15" filter="url(#blur1)" />
      </svg>
      {/* 4. Pontilhado decorativo */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* ===== Conteúdo ===== */}
      <div className="relative z-10">
        {/* Header glass */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-white/[0.03] backdrop-blur-2xl backdrop-saturate-150">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2">
              {marca.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={marca.logo_url} alt={marca.nome} className="h-9 max-w-[180px] object-contain" />
                : <><Tv className="h-6 w-6 text-brand-light" /><span className="text-lg font-bold">{marca.nome}</span></>}
            </div>
            <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
              <a href="#como-funciona" className="transition hover:text-white">Como funciona</a>
              <a href="#locais" className="transition hover:text-white">Onde anunciar</a>
              <a href="#pacotes" className="transition hover:text-white">Pacotes</a>
            </nav>
            <div className="flex items-center gap-3">
              <LoginDropdown />
              <a href="#contato" className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold shadow-lg shadow-brand/30 transition hover:shadow-brand/50">Anunciar agora</a>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative">
          <div className="mx-auto max-w-6xl px-6 py-24 text-center">
            <span className="inline-block rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-light backdrop-blur-md">
              ✨ Rede de Mídia Indoor
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
              Anuncie sua marca nas{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-400 bg-clip-text text-transparent">telas certas</span>
              , na hora certa
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
              Sua propaganda rodando em telas espalhadas pela cidade — você escolhe os locais,
              quantas inserções por dia e por quanto tempo. A gente cuida do resto.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="#contato" className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand to-brand-dark px-6 py-3 font-semibold shadow-lg shadow-brand/40 transition hover:shadow-brand/60">
                Quero anunciar <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#pacotes" className="rounded-xl border border-white/20 bg-white/5 px-6 py-3 font-semibold backdrop-blur-md transition hover:bg-white/10">Ver pacotes</a>
            </div>
            {(locais.length > 0 || cidades.length > 0) && (
              <div className="mt-14 flex items-center justify-center gap-12 text-center">
                <Stat n={`${locais.length}+`} lbl="pontos de mídia" />
                {cidades.length > 0 && <Stat n={cidades.length.toString()} lbl={`cidade${cidades.length > 1 ? "s" : ""}`} />}
              </div>
            )}
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold">Como funciona</h2>
          <p className="mt-3 text-center text-slate-400">Do briefing ao relatório, todo o ciclo em quatro passos.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              { icon: MapPin, t: "1. Escolha os locais", d: "Selecione em quais pontos da nossa rede sua marca vai aparecer." },
              { icon: ImageIcon, t: "2. Envie sua arte", d: "Mande seu vídeo, banner ou peça publicitária. Você gerencia tudo no painel." },
              { icon: CalendarClock, t: "3. Defina o plano", d: "Quantas inserções por dia, segundos por inserção e por quantos dias." },
              { icon: BarChart3, t: "4. Acompanhe", d: "Veja em tempo real quando e onde seu anúncio tocou — total transparência." },
            ].map((s, i) => <GlassCard key={i} icon={<s.icon className="h-7 w-7 text-brand-light" />} title={s.t} desc={s.d} />)}
          </div>
        </section>

        {/* Por que */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold">Por que anunciar com a gente</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: MonitorPlay, t: "Impacto visual", d: "Telas em locais de grande circulação, com sua marca em destaque." },
              { icon: BarChart3, t: "Relatório de exibições", d: "Comprovação de cada inserção: data, hora e local. Sem caixa-preta." },
              { icon: Megaphone, t: "Flexível", d: "Campanhas a partir de poucos dias. Troque a arte quando quiser." },
            ].map((r, i) => <GlassCard key={i} icon={<r.icon className="h-7 w-7 text-brand-light" />} title={r.t} desc={r.d} />)}
          </div>
        </section>

        {/* Cidades — agrupa locais por cidade pra nao expor lista nominal */}
        {cidadesAgrupadas.length > 0 && (
          <section id="locais" className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center text-3xl font-bold">Onde sua marca pode aparecer</h2>
            <p className="mt-3 text-center text-slate-400">
              Nossa rede tem <strong className="text-brand-light">{totalTelas} telas</strong> em {cidadesAgrupadas.length} {cidadesAgrupadas.length === 1 ? "cidade" : "cidades"}.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {cidadesAgrupadas.map(c => (
                <div key={c.cidade} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition hover:border-brand/40 hover:bg-white/10">
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand/15 blur-2xl transition group-hover:bg-brand/25" />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <MapPin className="h-6 w-6 text-brand-light transition group-hover:scale-110" />
                      <p className="mt-2 text-xl font-bold">{c.cidade}</p>
                      <p className="text-xs text-slate-400">
                        {c.n_locais} {c.n_locais === 1 ? "ponto de mídia" : "pontos de mídia"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-brand-light leading-none">{c.n_telas}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">{c.n_telas === 1 ? "tela" : "telas"}</p>
                    </div>
                  </div>
                  {c.orientacoes.length > 0 && (
                    <div className="relative mt-3 flex flex-wrap gap-1">
                      {c.orientacoes.map(o => (
                        <span key={o} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                          {o === "paisagem" ? "🖥️" : "📱"} {o}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pacotes */}
        {pacotes.length > 0 && (
          <section id="pacotes" className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center text-3xl font-bold">Pacotes</h2>
            <p className="mt-3 text-center text-slate-400">Escolha o que faz sentido pra sua campanha. Personalizamos se precisar.</p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {pacotes.map(p => (
                <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition hover:border-brand/50 hover:bg-white/10">
                  <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand/20 blur-3xl transition group-hover:bg-brand/30" />
                  <span className="relative text-xs font-semibold uppercase tracking-wide text-brand-light">{TIPO_LABEL[p.tipo] ?? p.tipo}</span>
                  <h3 className="relative mt-1 text-xl font-bold">{p.nome}</h3>
                  <ul className="relative mt-4 space-y-2 text-sm text-slate-300">
                    <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-light" /> {p.insercoes_dia} inserções por dia</li>
                    <li className="flex items-center gap-2"><MonitorPlay className="h-4 w-4 text-brand-light" /> {p.segundos}s por inserção</li>
                    <li className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-brand-light" /> {p.dias} dias de campanha</li>
                  </ul>
                  {p.preco > 0 && <p className="relative mt-4 bg-gradient-to-r from-cyan-300 to-brand-light bg-clip-text text-3xl font-black text-transparent">{brl(p.preco)}</p>}
                  <a href="#contato" className="relative mt-6 block rounded-xl bg-gradient-to-br from-brand to-brand-dark py-3 text-center font-semibold shadow-lg shadow-brand/30 transition hover:shadow-brand/60">Quero este</a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contato / CTA */}
        <section id="contato" className="mx-auto max-w-4xl px-6 py-24 text-center">
          <div className="rounded-3xl border border-white/15 bg-white/[0.07] p-12 shadow-[0_8px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
            <h2 className="text-3xl font-bold md:text-4xl">Pronto pra colocar sua marca no ar?</h2>
            <p className="mt-4 text-slate-300">Fale com a gente. Montamos sua campanha do jeito que você precisa.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/cadastro" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand to-brand-dark px-8 py-4 text-lg font-semibold shadow-lg shadow-brand/40 transition hover:shadow-brand/60">
                Falar com a equipe <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/painel" className="rounded-xl border border-white/20 bg-white/5 px-8 py-4 text-lg font-semibold backdrop-blur-md transition hover:bg-white/10">Já sou anunciante</Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-white/[0.02] py-8 text-center text-sm text-slate-400 backdrop-blur-md">
          <p>© {new Date().getFullYear()} {marca.nome}. Todos os direitos reservados.</p>
          <p className="mt-1">
            {(marca.site ?? "").replace("https://", "")} · <Link href="/guia" className="text-brand-light hover:underline">Guia de instalação</Link>
            {marca.player_apk_url && <> · <a href={marca.player_apk_url} download className="text-brand-light hover:underline">Baixar Player Android</a></>}
          </p>
        </footer>
      </div>
    </main>
  );
}

function Stat({ n, lbl }: { n: string; lbl: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3 backdrop-blur-md">
      <p className="bg-gradient-to-r from-cyan-300 to-brand-light bg-clip-text text-3xl font-black text-transparent">{n}</p>
      <p className="text-xs uppercase tracking-wide text-slate-400">{lbl}</p>
    </div>
  );
}

function GlassCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-2xl transition hover:border-brand/40 hover:bg-white/[0.08]">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand/10 blur-2xl transition group-hover:bg-brand/20" />
      <div className="relative">
        <div className="mb-4 inline-flex rounded-xl bg-brand/15 p-3 ring-1 ring-brand/30">{icon}</div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">{desc}</p>
      </div>
    </div>
  );
}
