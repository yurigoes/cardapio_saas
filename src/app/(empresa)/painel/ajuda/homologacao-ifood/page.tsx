"use client";

/**
 * /painel/ajuda/homologacao-ifood
 *
 * Guia passo-a-passo dos 5 cenários de homologação iFood.
 * Operador grava vídeo de cada um seguindo esta página.
 */
import { useState } from "react";
import {
  CheckCircle2, Video, Clock, CreditCard, ShoppingBag,
  AlertTriangle, Banknote, ChevronDown, ChevronUp, Copy,
} from "lucide-react";

interface Passo {
  texto: string;
  destaque?: boolean;
}
interface Cenario {
  id:        string;
  titulo:    string;
  icone:     React.ComponentType<{ className?: string }>;
  cor:       string;
  objetivo:  string;
  passos:    Passo[];
  validacao: string[];
  obs:       string;
}

const CENARIOS: Cenario[] = [
  {
    id: "1",
    titulo: "Cenário 1 — Pedido Agendado com Voucher",
    icone: Clock,
    cor: "amber",
    objetivo: "Receber pedido agendado iFood + voucher VOUCHER_ENTGRATIS e exibir data/hora visíveis.",
    passos: [
      { texto: "Abra OBS Studio / Loom / Vmaker e inicie a gravação da tela", destaque: true },
      { texto: "No simulador iFood (Portal iFood Developer): crie um pedido NOVO com:" },
      { texto: "  • Tipo: Delivery" },
      { texto: "  • orderTiming = SCHEDULED (entrega agendada)" },
      { texto: "  • Data: AMANHÃ, qualquer horário comercial" },
      { texto: "  • Cupom: VOUCHER_ENTGRATIS" },
      { texto: "  • Forma de pagamento: cartão online (OFFLINE/CREDIT)" },
      { texto: "Envie o pedido pelo simulador" },
      { texto: "Volte ao painel: /painel/pedidos → atualizar (botão refresh)" },
      { texto: "O pedido novo aparece na lista — clique nele pra abrir o modal" },
      { texto: "GRAVE explicitamente mostrando:", destaque: true },
      { texto: "  ⏰ TARJA AMARELA 'Pedido agendado' com data+hora" },
      { texto: "  🎟️ BLOCO VERDE 'Voucher aplicado' com código VOUCHER_ENTGRATIS" },
      { texto: "Mude status: pendente → confirmado → preparo → pronto (vai sincronizar com iFood)" },
      { texto: "PARE a gravação" },
    ],
    validacao: [
      "Tarja amarela 'Pedido agendado' aparece destacada com data e hora",
      "Bloco verde 'Voucher aplicado' mostra código VOUCHER_ENTGRATIS",
      "Status sincroniza com iFood (confirmado → /confirm, preparo → /startPreparation, etc)",
    ],
    obs: "No chamado iFood, informe o orderId do pedido criado neste cenário.",
  },
  {
    id: "2",
    titulo: "Cenário 2 — Pedido Manual com Cancelamento",
    icone: CreditCard,
    cor: "blue",
    objetivo: "Receber pedido cartão (pago entrega) e cancelar pelo nosso painel — confirma que cancelamento sai pro iFood.",
    passos: [
      { texto: "Inicie gravação", destaque: true },
      { texto: "No simulador iFood: cria pedido novo com:" },
      { texto: "  • Tipo: Delivery" },
      { texto: "  • orderTiming = IMMEDIATE" },
      { texto: "  • Forma de pagamento: OFFLINE / CREDIT CARD (cartão na entrega)" },
      { texto: "Envia pedido" },
      { texto: "Painel /painel/pedidos → abre o pedido novo" },
      { texto: "GRAVE mostrando o pedido aberto com forma 'cartao' / 'credit'" },
      { texto: "Clique 'Cancelar' (ou mude status pra 'cancelado')" },
      { texto: "Informe motivo (ex: 'Teste de homologação')" },
      { texto: "Confirme — pedido fica vermelho 'Cancelado'", destaque: true },
      { texto: "GRAVE o status mudando + atualização visual" },
      { texto: "Volte ao simulador iFood — o pedido lá deve aparecer cancelado também (sync via /requestCancellation)" },
      { texto: "PARE a gravação" },
    ],
    validacao: [
      "Pedido foi recebido com forma 'cartao' / 'credit'",
      "Cancelamento no painel disparou /requestCancellation no iFood",
      "Pedido no simulador iFood fica cancelado",
    ],
    obs: "Informe orderId no chamado.",
  },
  {
    id: "3",
    titulo: "Cenário 3 — Pedido para Retirada",
    icone: ShoppingBag,
    cor: "emerald",
    objetivo: "Receber pedido TAKEOUT, processar fluxo completo até 'pronto pra retirada'.",
    passos: [
      { texto: "Inicie gravação", destaque: true },
      { texto: "Simulador iFood: cria pedido com:" },
      { texto: "  • Tipo: TAKEOUT / RETIRADA NO LOCAL" },
      { texto: "  • Forma de pagamento: qualquer" },
      { texto: "Envia pedido" },
      { texto: "Painel /painel/pedidos → o pedido aparece com tipo 'Balcão' / 'Retirada'" },
      { texto: "GRAVE o pedido aberto mostrando 'tipo: retirada / takeout'", destaque: true },
      { texto: "Status: pendente → confirmado (gera /confirm no iFood)" },
      { texto: "Status: confirmado → preparo (gera /startPreparation)" },
      { texto: "Status: preparo → pronto (gera /readyToPickup ← específico de retirada)", destaque: true },
      { texto: "GRAVE cada transição de status + sincronização" },
      { texto: "Por fim marca como 'entregue' (cliente retirou)" },
      { texto: "PARE a gravação" },
    ],
    validacao: [
      "Pedido vem como retirada (tipo_consumo='retirada')",
      "Status 'pronto' dispara /readyToPickup (verifique log do servidor)",
      "Fluxo completo funciona sem erro",
    ],
    obs: "Informe orderId no chamado.",
  },
  {
    id: "4",
    titulo: "Cenário 4 — Cancelamento pela Plataforma iFood",
    icone: AlertTriangle,
    cor: "red",
    objetivo: "iFood cancela o pedido, nosso sistema recebe via polling /events e marca como cancelado + alerta o operador.",
    passos: [
      { texto: "Inicie gravação", destaque: true },
      { texto: "Simulador iFood: cria pedido novo (qualquer tipo)" },
      { texto: "Painel /painel/pedidos → confirma o pedido (status pendente → confirmado → preparo)" },
      { texto: "GRAVE o pedido em estado 'Em preparo' no nosso painel" },
      { texto: "Vá ao simulador iFood e CANCELE o pedido pelo lado da plataforma" },
      { texto: "Aguarde até 30s pro polling /events captar (ou clique 'Atualizar' no painel)" },
      { texto: "GRAVE o pedido no painel ficando vermelho 'Cancelado'", destaque: true },
      { texto: "Abra o modal: deve aparecer tarja vermelha PISCANDO '⚠️ Cancelamento solicitado pelo iFood'" },
      { texto: "GRAVE essa tarja visível", destaque: true },
      { texto: "Operador toma ciência (não precisa fazer ação adicional)" },
      { texto: "PARE a gravação" },
    ],
    validacao: [
      "Polling /events captou o evento de cancelamento",
      "Status do pedido virou 'cancelado' automaticamente",
      "Tarja vermelha visível alertando o operador no modal",
    ],
    obs: "Informe orderId no chamado.",
  },
  {
    id: "5",
    titulo: "Cenário 5 — Pagamento em Dinheiro com Troco",
    icone: Banknote,
    cor: "green",
    objetivo: "Receber pedido em dinheiro com troco + CPF + observação. Tudo precisa aparecer no painel.",
    passos: [
      { texto: "Inicie gravação", destaque: true },
      { texto: "Simulador iFood: cria pedido com:" },
      { texto: "  • Tipo: Delivery" },
      { texto: "  • Forma de pagamento: DINHEIRO / CASH" },
      { texto: "  • changeFor: valor > total (ex: pedido R$45, changeFor R$50)" },
      { texto: "  • customer.documentNumber: CPF (ex: 12345678901)" },
      { texto: "  • comments: 'Por favor, sem cebola. Apartamento 302.'" },
      { texto: "Envia pedido" },
      { texto: "Painel /painel/pedidos → abre o pedido novo" },
      { texto: "GRAVE explicitamente cada um dos 4 blocos:", destaque: true },
      { texto: "  💵 Bloco 'Pagamento' com forma=dinheiro + 'Cliente paga com R$50' + 'Troco: R$5'" },
      { texto: "  📄 Bloco 'CPF/CNPJ (nota fiscal)' formatado 123.456.789-01" },
      { texto: "  💬 Bloco azul 'Observação do cliente' com o texto" },
      { texto: "  📦 Lista de itens completa com preços" },
      { texto: "Confirme o pedido normalmente" },
      { texto: "PARE a gravação" },
    ],
    validacao: [
      "Forma de pagamento exibida como 'dinheiro'",
      "Valor entregue pelo cliente + troco calculado visível",
      "CPF formatado corretamente (3-3-3-2 com pontos)",
      "Observação do cliente em destaque (bloco azul)",
    ],
    obs: "Informe orderId no chamado.",
  },
];

function copy(s: string) { navigator.clipboard.writeText(s); }

export default function HomologacaoIfoodPage() {
  const [aberto, setAberto] = useState<string | null>("1");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Video className="h-6 w-6 text-brand" />
          Homologação iFood — guia dos 5 cenários
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          Cada cenário precisa de um vídeo separado da tela (use OBS, Loom, Vmaker, ou plugin
          de gravação do navegador). Siga os passos exatamente como descrito — o iFood valida
          se o sistema captura e EXIBE os dados corretamente.
        </p>
      </header>

      {/* Pré-requisitos */}
      <section className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300 mb-3">
          📋 Pré-requisitos antes de gravar
        </h2>
        <ul className="space-y-2 text-sm text-slate-300 list-disc pl-5">
          <li>iFood OAuth configurado em <code className="text-emerald-300">/painel/integracoes</code> (client_id + client_secret válidos)</li>
          <li>Polling de eventos ativo (o cron <code>/api/cron/ifood-poll</code> deve estar rodando)</li>
          <li>Acesso ao <strong>Portal Developer iFood</strong> com simulador de pedidos</li>
          <li>Ferramenta de gravação de tela testada (OBS Studio é gratuito)</li>
          <li>Caso o simulador iFood não permita cartão fictício direto, use o APP iFood pra cadastrar antes (instrução iFood)</li>
        </ul>
      </section>

      {/* Cenários accordion */}
      {CENARIOS.map(c => {
        const aberto_ = aberto === c.id;
        const Icon = c.icone;
        const corBorda = `border-${c.cor}-400/30`;
        const corBg    = `bg-${c.cor}-500/5`;
        const corText  = `text-${c.cor}-300`;
        return (
          <section key={c.id} className={`rounded-2xl border ${corBorda} ${corBg} overflow-hidden`}>
            <button
              onClick={() => setAberto(aberto_ ? null : c.id)}
              className="flex w-full items-center justify-between p-5 text-left hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-6 w-6 ${corText}`} />
                <div>
                  <h2 className="text-base font-bold text-white">{c.titulo}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{c.objetivo}</p>
                </div>
              </div>
              {aberto_ ? <ChevronUp className="h-5 w-5 text-slate-400"/> : <ChevronDown className="h-5 w-5 text-slate-400"/>}
            </button>

            {aberto_ && (
              <div className="border-t border-white/5 p-5 space-y-4">
                {/* Passo a passo */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Passo a passo</p>
                  <ol className="space-y-1 text-sm">
                    {c.passos.map((p, i) => (
                      <li
                        key={i}
                        className={`pl-7 -indent-7 ${p.destaque ? "font-semibold text-white" : "text-slate-300"}`}
                      >
                        <span className="inline-block w-7 text-slate-500">{i + 1}.</span>
                        {p.texto}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Validação */}
                <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-2">
                    ✓ Checklist de validação (o que tem que aparecer no vídeo)
                  </p>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {c.validacao.map((v, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Observação */}
                <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3">
                  <p className="text-xs text-amber-200">
                    📝 <strong>{c.obs}</strong>
                  </p>
                </div>

                {/* Botão copiar template chamado */}
                <button
                  onClick={() => copy(
                    `Cenário ${c.id} — ${c.titulo}\n` +
                    `Link vídeo: [cole aqui]\n` +
                    `orderId: [cole aqui]\n`
                  )}
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar template pro chamado iFood
                </button>
              </div>
            )}
          </section>
        );
      })}

      <footer className="rounded-xl border border-white/5 bg-white/5 p-4 text-xs text-slate-500">
        Após gravar todos 5 vídeos, envie pro chamado iFood com:
        <br />• link do vídeo (Drive, YouTube unlisted, Vimeo)
        <br />• orderId de cada cenário
        <br />• menção da versão do sistema (commit hash em /api/version)
        <br /><br />
        Specs técnicas: <a href="/painel/ajuda/especificacoes#integracoes" className="text-brand hover:underline">/painel/ajuda/especificacoes</a> seção Integrações.
      </footer>
    </div>
  );
}
