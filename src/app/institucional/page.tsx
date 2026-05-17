"use client";

/**
 * Site institucional servido em tthreedigital.com.br (via middleware host-based).
 * Mostra portfólio dos módulos, parceiros (logos de clientes ativos), métricas
 * reais do banco e CTA pro app.tthreedigital.com.br.
 */
import { useEffect, useState } from "react";
import {
  ShoppingBag, Smartphone, MessageCircle, Mail, Bike, ChefHat,
  Wallet, BarChart3, Crown, Sparkles, Zap, Tv2, MapPin,
  ArrowRight, Check, Star, Building2, Clock, ShieldCheck,
} from "lucide-react";

interface InstitucionalData {
  metricas: {
    total_pedidos: number;
    empresas_ativas: number;
    chamados_resolvidos: number;
    uptime_dias: number;
  };
  parceiros: { id: string; nome_fantasia: string; logo_url: string }[];
  planos:    { id: string; nome: string; preco_mensal: string; modulos: string[]; destaque: boolean }[];
}

const APP_URL = "https://app.tthreedigital.com.br";

const MODULOS_DETALHADOS = [
  { nome: "PDV / Balcão",   icon: Wallet,      desc: "Venda rápida no balcão com leitor de código, troco em PIX e impressão automática." },
  { nome: "Delivery",       icon: Bike,        desc: "Pedidos por WhatsApp/site, atribuição de motoboy com GPS, taxa por bairro ou raio." },
  { nome: "Mesas / Garçom", icon: MapPin,      desc: "Comandas individuais ou compartilhadas, divisão de conta, integração com cozinha." },
  { nome: "Cozinha KDS",    icon: ChefHat,     desc: "Tela de cozinha por categoria, alertas de tempo, painel TV pro cliente acompanhar." },
  { nome: "iFood",          icon: Zap,         desc: "Integração oficial: pedidos sincronizam, aceite automático, impressão direta." },
  { nome: "WhatsApp",       icon: MessageCircle,desc: "Bot de pedidos, notificações por evento (status, entrega, cancelamento)." },
  { nome: "Email SMTP",     icon: Mail,        desc: "Envio transacional pelos seus servidores ou pelo nosso pool — sem limite." },
  { nome: "Painel TV",      icon: Tv2,         desc: "Senha chamada, pedidos prontos, vídeo institucional rodando como anúncio." },
  { nome: "Kiosk / Totem",  icon: Smartphone,  desc: "Auto-atendimento touch screen, pagamento integrado, fila digital." },
  { nome: "Relatórios",     icon: BarChart3,   desc: "Curva ABC, ranking de produtos, ticket médio, sazonalidade, exportação Excel/PDF." },
  { nome: "CRM",            icon: Star,        desc: "Cadastro de clientes, fidelidade, cashback, vales, mala-direta segmentada." },
  { nome: "Estoque",        icon: ShoppingBag, desc: "Ficha técnica, alertas de mínimo, entrada/saída, baixa automática por venda." },
];

const INTEGRACOES = [
  { nome: "iFood",     icon: Zap,           cor: "bg-red-500" },
  { nome: "WhatsApp",  icon: MessageCircle, cor: "bg-green-500" },
  { nome: "Email SMTP", icon: Mail,         cor: "bg-blue-500" },
  { nome: "Mercado Pago", icon: Wallet,     cor: "bg-cyan-500" },
  { nome: "PIX",       icon: Wallet,        cor: "bg-emerald-500" },
];

export default function SiteInstitucional() {
  const [data, setData] = useState<InstitucionalData | null>(null);

  useEffect(() => {
    fetch("/api/pub/institucional")
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {});
  }, []);

  const m = data?.metricas;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20">
              <ChefHat className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-lg font-bold">Three Digital</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
            <a href="#modulos" className="hover:text-white">Módulos</a>
            <a href="#integracoes" className="hover:text-white">Integrações</a>
            <a href="#planos" className="hover:text-white">Planos</a>
            <a href="#parceiros" className="hover:text-white">Parceiros</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href={`${APP_URL}/login`}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:border-white/20 hover:text-white">
              Entrar
            </a>
            <a href={`${APP_URL}/cadastro`}
              className="hidden sm:inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400">
              Começar grátis <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/10" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" /> Sistema completo pra restaurantes
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl sm:text-6xl font-extrabold leading-tight tracking-tight">
            Tudo que seu restaurante precisa,
            <span className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent"> num só lugar.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            PDV, delivery, cardápio digital, iFood, WhatsApp, mesas, kiosk e mais —
            integrados, sem mensalidades escondidas.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <a href={`${APP_URL}/cadastro`}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-400">
              Começar agora — 14 dias grátis <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#modulos" className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-slate-300 hover:border-white/20">
              Ver módulos
            </a>
          </div>

          {/* Métricas */}
          {m && (
            <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
              <Stat valor={fmt(m.total_pedidos)}      label="Pedidos processados" />
              <Stat valor={fmt(m.empresas_ativas)}    label="Restaurantes ativos" />
              <Stat valor={`${m.uptime_dias}d`}       label="Dias em operação" icon={Clock} />
              <Stat valor={fmt(m.chamados_resolvidos)} label="Chamados resolvidos" icon={ShieldCheck} />
            </div>
          )}
        </div>
      </section>

      {/* Módulos */}
      <section id="modulos" className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold">Tudo que você precisa</h2>
          <p className="mt-3 text-slate-400">Módulos pensados pro dia-a-dia de quem opera restaurante.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS_DETALHADOS.map(mod => {
            const Icon = mod.icon;
            return (
              <div key={mod.nome} className="group rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-emerald-500/30 hover:bg-emerald-500/5">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/25">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white">{mod.nome}</h3>
                <p className="mt-1 text-sm text-slate-400 leading-relaxed">{mod.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Integrações */}
      <section id="integracoes" className="border-y border-white/5 bg-white/[0.02] py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold">Integrações nativas</h2>
            <p className="mt-3 text-slate-400">Conectado com as ferramentas que você já usa.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {INTEGRACOES.map(i => {
              const Icon = i.icon;
              return (
                <div key={i.nome} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900 px-5 py-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${i.cor}`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-bold">{i.nome}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Planos */}
      {data?.planos && data.planos.length > 0 && (
        <section id="planos" className="mx-auto max-w-7xl px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold">Planos pra cada tamanho</h2>
            <p className="mt-3 text-slate-400">Comece simples e ative módulos extras à medida que cresce.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {data.planos.slice(0, 3).map(p => (
              <div key={p.id} className={`rounded-2xl border p-6 ${
                p.destaque ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 bg-white/5"
              }`}>
                {p.destaque && (
                  <span className="mb-3 inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Mais popular
                  </span>
                )}
                <h3 className="text-xl font-bold">{p.nome}</h3>
                <p className="mt-2 text-3xl font-bold">
                  R$ {Number(p.preco_mensal ?? 0).toFixed(0)}
                  <span className="text-sm font-normal text-slate-400">/mês</span>
                </p>
                <ul className="mt-5 space-y-2 text-sm text-slate-300">
                  {(p.modulos ?? []).slice(0, 6).map(m => (
                    <li key={m} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" /> {m}
                    </li>
                  ))}
                </ul>
                <a href={`${APP_URL}/cadastro?plano=${p.id}`}
                  className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
                    p.destaque ? "bg-emerald-500 text-white hover:bg-emerald-400"
                               : "border border-white/10 text-white hover:bg-white/10"
                  }`}>
                  Contratar <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Parceiros */}
      {data?.parceiros && data.parceiros.length > 0 && (
        <section id="parceiros" className="border-y border-white/5 bg-white/[0.02] py-16 overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold">Restaurantes que confiam na gente</h2>
            <p className="mt-2 text-sm text-slate-400">{data.parceiros.length} marcas ativas no sistema</p>
          </div>
          {/* Marquee infinito */}
          <div className="relative">
            <div className="flex gap-12 animate-marquee whitespace-nowrap">
              {[...data.parceiros, ...data.parceiros].map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${p.id}-${i}`} src={p.logo_url} alt={p.nome_fantasia} title={p.nome_fantasia}
                  className="h-14 w-auto max-w-[140px] object-contain opacity-60 hover:opacity-100 grayscale hover:grayscale-0 transition" />
              ))}
            </div>
          </div>
          <style jsx>{`
            @keyframes marquee {
              from { transform: translateX(0); }
              to   { transform: translateX(-50%); }
            }
            .animate-marquee { animation: marquee 40s linear infinite; }
          `}</style>
        </section>
      )}

      {/* CTA final */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold">Pronto pra começar?</h2>
        <p className="mt-3 text-slate-400">14 dias grátis. Sem cartão de crédito. Suporte humano 7 dias na semana.</p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a href={`${APP_URL}/cadastro`}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-400">
            Criar minha conta <ArrowRight className="h-4 w-4" />
          </a>
          <a href={`${APP_URL}/login`}
            className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-slate-300 hover:border-white/20">
            Já tenho conta
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-950">
        <div className="mx-auto max-w-7xl px-6 py-10 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Three Digital. Todos os direitos reservados.
          {" · "}<a href={`${APP_URL}/termos`} className="hover:text-white">Termos</a>
          {" · "}<a href={`${APP_URL}/privacidade`} className="hover:text-white">Privacidade</a>
        </div>
      </footer>
    </div>
  );
}

function Stat({ valor, label, icon: Icon }: { valor: string; label: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2 justify-center">
        {Icon && <Icon className="h-5 w-5 text-emerald-400" />}
        {valor}
      </p>
      <p className="mt-1 text-xs text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}
