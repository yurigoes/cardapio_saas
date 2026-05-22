import Link from "next/link";
import {
  MonitorPlay, Megaphone, CalendarClock, LayoutGrid, BarChart3,
  Smartphone, Check, ArrowRight, Tv,
} from "lucide-react";
import { formatBRL } from "@/lib/planos";
import { listarPlanosAtivos } from "@/lib/planos-db";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const PLANOS = await listarPlanosAtivos();
  return (
    <main className="min-h-screen bg-[#0a0a12] text-white">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a12]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Tv className="h-6 w-6 text-brand-light" />
            <span className="text-lg font-bold">Three Digital <span className="text-brand-light">Mídia</span></span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <a href="#planos" className="hover:text-white">Planos</a>
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/painel" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5 transition">
              Entrar
            </Link>
            <Link href="/cadastro" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark transition">
              Começar agora
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <span className="inline-block rounded-full border border-brand/40 bg-brand/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-light">
            Mídia Indoor
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
            Suas TVs viram uma <span className="text-brand-light">rede de mídia</span> que vende sozinha
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            Cardápio digital, promoções e anúncios em todas as suas telas — gerenciados
            de um painel só, atualizados em segundos, de qualquer lugar.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/cadastro" className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold hover:bg-brand-dark transition">
              Criar minha conta <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#planos" className="rounded-xl border border-white/15 px-6 py-3 font-semibold hover:bg-white/5 transition">
              Ver planos
            </a>
          </div>
        </div>
      </section>

      {/* ── Recursos ───────────────────────────────────────────────────── */}
      <section id="recursos" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Tudo que você precisa pra controlar suas telas</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { icon: MonitorPlay, t: "Conteúdo dinâmico", d: "Imagens, vídeos, páginas web, RSS, clima. Atualiza tudo em tempo real." },
            { icon: CalendarClock, t: "Agendamento inteligente", d: "Café da manhã, almoço, happy hour — cada horário com seu conteúdo." },
            { icon: LayoutGrid, t: "Layouts flexíveis", d: "Divida a tela: cardápio + promoção rolando + logo. Você desenha." },
            { icon: BarChart3, t: "Relatórios", d: "Saiba exatamente o que tocou e quando. Perfeito pra cobrar anunciantes." },
            { icon: Smartphone, t: "Qualquer TV", d: "Android, Windows, LG, Samsung. Player gratuito, instala em minutos." },
            { icon: Megaphone, t: "Multi-loja", d: "Gerencie 1 ou 100 lojas do mesmo painel. Conteúdo por região." },
          ].map((r, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <r.icon className="h-8 w-8 text-brand-light" />
              <h3 className="mt-4 text-lg font-semibold">{r.t}</h3>
              <p className="mt-2 text-sm text-slate-400">{r.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Como funciona ──────────────────────────────────────────────── */}
      <section id="como-funciona" className="border-y border-white/5 bg-white/[0.02] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold">Como funciona</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              { n: "1", t: "Você cria sua conta", d: "Escolhe o plano pelo número de telas e faz o cadastro." },
              { n: "2", t: "Conecta suas TVs", d: "Instala o app no Android/TV e aponta pro painel. Pronto em minutos." },
              { n: "3", t: "Gerencia de qualquer lugar", d: "Sobe conteúdo, agenda e acompanha tudo pelo navegador." },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand text-xl font-black">{s.n}</div>
                <h3 className="mt-4 text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planos ─────────────────────────────────────────────────────── */}
      <section id="planos" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Planos por tela</h2>
        <p className="mt-3 text-center text-slate-400">Quanto mais telas, menor o preço por tela. Cancele quando quiser.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANOS.map((p) => (
            <div key={p.id} className={`relative rounded-2xl border p-6 ${p.destaque ? "border-brand bg-brand/10" : "border-white/10 bg-white/5"}`}>
              {p.destaque && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-bold uppercase">
                  Mais popular
                </span>
              )}
              <h3 className="text-xl font-bold">{p.nome}</h3>
              <p className="mt-1 text-sm text-slate-400">{p.telas}</p>
              <div className="mt-4">
                <span className="text-4xl font-black">{formatBRL(p.preco)}</span>
                <span className="text-sm text-slate-400">/tela/mês</span>
              </div>
              <ul className="mt-6 space-y-2">
                {p.recursos.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="h-4 w-4 flex-shrink-0 text-brand-light mt-0.5" />
                    {r}
                  </li>
                ))}
              </ul>
              <Link href={`/cadastro?plano=${p.id}`} className={`mt-6 block rounded-xl py-3 text-center font-semibold transition ${p.destaque ? "bg-brand hover:bg-brand-dark" : "border border-white/15 hover:bg-white/5"}`}>
                Escolher {p.nome}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold">Pronto pra transformar suas telas?</h2>
        <p className="mt-4 text-slate-300">Comece hoje. Sem fidelidade, sem complicação.</p>
        <Link href="/cadastro" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-4 text-lg font-semibold hover:bg-brand-dark transition">
          Criar conta grátis <ArrowRight className="h-5 w-5" />
        </Link>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-8 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} Three Digital — Mídia Indoor. Todos os direitos reservados.</p>
        <p className="mt-1">tthreedigital.com.br</p>
      </footer>
    </main>
  );
}
