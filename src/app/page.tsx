"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check, ChefHat, ArrowRight, Star, Zap, Users, MessageSquare,
  ShoppingBag, Tv2, BarChart3, CreditCard, Sparkles,
} from "lucide-react";

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: string | number;
  modulos: string[];
  destaque: boolean;
}

const NOMES_MODULOS: Record<string, string> = {
  balcao:              "PDV / Balcão",
  mesa:                "Gestão de Mesas",
  delivery:            "Delivery",
  cozinha_kds:         "Cozinha (KDS)",
  totem:               "Totem Autoatendimento",
  financeiro:          "Financeiro / Caixa",
  estoque:             "Controle de Estoque",
  cupom:               "Cupons",
  crm:                 "CRM / Clientes",
  relatorios_basicos:  "Relatórios",
  ifood:               "Integração iFood",
};

const fmtBRL = (n: number | string) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function LandingPage() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pub/planos")
      .then(r => r.json())
      .then(d => { if (d.success) setPlanos(d.data ?? []); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur bg-slate-950/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500/15 p-2">
              <ChefHat className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="font-bold text-lg">Cardápio SaaS</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm text-slate-300 hover:text-white px-3 py-2"
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold px-4 py-2 rounded-xl"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300 mb-6">
          <Sparkles className="h-3 w-3" />
          14 dias grátis · sem cartão
        </span>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
          O sistema completo pro<br />
          seu <span className="text-emerald-400">restaurante</span> rodar
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
          Pedidos no balcão, mesa, delivery e iFood — tudo num lugar só.
          Cardápio digital, KDS na cozinha, totem de autoatendimento, controle
          de caixa e relatórios.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/cadastro"
            className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2"
          >
            Começar grátis <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#planos"
            className="border border-white/10 hover:bg-white/5 text-white font-bold px-6 py-3 rounded-xl flex items-center justify-center"
          >
            Ver planos
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Feature icon={ShoppingBag} titulo="PDV / Balcão" texto="Atendimento rápido, comanda fácil, fechamento de mesa." />
          <Feature icon={Tv2}         titulo="KDS Cozinha"  texto="Pedidos chegam direto na tela da cozinha, organizados por setor." />
          <Feature icon={Zap}         titulo="iFood"        texto="Receba pedidos do iFood direto no sistema, sem dupla digitação." />
          <Feature icon={Users}       titulo="CRM"          texto="Cadastre clientes, histórico de compras, vales e fidelidade." />
          <Feature icon={CreditCard}  titulo="Caixa"        texto="Controle de entrada/saída, fechamento por turno, relatórios." />
          <Feature icon={MessageSquare} titulo="WhatsApp"   texto="Avisa o cliente quando o pedido está pronto, sai pra entrega." />
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Planos pra qualquer tamanho
          </h2>
          <p className="text-slate-400">
            Escolha o seu, comece com 14 dias grátis. Sem fidelidade, cancela quando quiser.
          </p>
        </div>

        {loading ? (
          <p className="text-center text-slate-500">Carregando planos...</p>
        ) : planos.length === 0 ? (
          <p className="text-center text-slate-500">Nenhum plano cadastrado.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {planos.map(p => (
              <PlanoCard key={p.id} plano={p} />
            ))}
          </div>
        )}

        <p className="text-center text-xs text-slate-500 mt-8">
          Módulos extras à la carte — adicione qualquer um de qualquer plano por R$ 19,90 a R$ 99,90/mês.
          <br />
          Trial de 7 dias grátis pra cada módulo.
        </p>
      </section>

      {/* CTA final */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent p-12">
          <h2 className="text-3xl font-bold mb-3">Pronto pra começar?</h2>
          <p className="text-slate-400 mb-6">
            Cadastra em 2 minutos. 14 dias grátis sem cartão de crédito.
          </p>
          <Link
            href="/cadastro"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-6 py-3 rounded-xl"
          >
            Criar conta grátis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-emerald-400" />
            <span>Cardápio SaaS · {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-white">Entrar</Link>
            <Link href="/docs/api" className="hover:text-white">API</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon, titulo, texto,
}: { icon: React.ComponentType<{ className?: string }>; titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="rounded-lg bg-emerald-500/15 p-2 inline-flex mb-3">
        <Icon className="h-5 w-5 text-emerald-400" />
      </div>
      <h3 className="font-bold mb-1">{titulo}</h3>
      <p className="text-sm text-slate-400">{texto}</p>
    </div>
  );
}

function PlanoCard({ plano }: { plano: Plano }) {
  const modulos = Array.isArray(plano.modulos) ? plano.modulos : [];
  return (
    <div className={`relative rounded-2xl border p-6 flex flex-col ${
      plano.destaque
        ? "border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent ring-2 ring-emerald-500/20"
        : "border-white/10 bg-white/5"
    }`}>
      {plano.destaque && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white text-xs font-bold px-3 py-1">
          <Star className="h-3 w-3 fill-white" /> Mais escolhido
        </span>
      )}
      <h3 className="text-2xl font-bold mb-1">{plano.nome}</h3>
      <p className="text-sm text-slate-400 mb-4 min-h-[40px]">{plano.descricao}</p>
      <div className="mb-5">
        <span className="text-4xl font-bold">{fmtBRL(plano.preco_mensal)}</span>
        <span className="text-sm text-slate-400 ml-1">/mês</span>
      </div>
      <Link
        href={`/cadastro?plano=${plano.id}`}
        className={`block text-center font-bold rounded-xl py-2.5 mb-5 transition ${
          plano.destaque
            ? "bg-emerald-500 hover:bg-emerald-400 text-white"
            : "border border-white/10 hover:bg-white/5"
        }`}
      >
        Começar grátis
      </Link>
      <div className="space-y-2 text-sm text-slate-300">
        {modulos.map(m => (
          <div key={m} className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>{NOMES_MODULOS[m] ?? m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
