import Link from "next/link";
import { ChefHat, ArrowLeft } from "lucide-react";
import { getSaasBranding } from "@/lib/branding/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const b = await getSaasBranding();
  return { title: `Termos de Uso · ${b.nome}` };
}

export default async function TermosPage() {
  const b = await getSaasBranding();
  const contatoEmail = b.email ?? "contato";
  const razao = b.razao_social ?? b.nome;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {b.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo_url} alt={b.nome} className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <>
                <ChefHat className="h-5 w-5 text-emerald-400" />
                <span className="font-bold">{b.nome}</span>
              </>
            )}
          </Link>
          <Link href="/" className="flex items-center gap-1 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 prose prose-invert prose-slate">
        <h1 className="text-3xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-sm text-slate-400 mb-8">Última atualização: maio de 2026</p>

        <Section titulo="1. Aceitação dos Termos">
          Ao se cadastrar e utilizar o sistema {b.nome} (&ldquo;Serviço&rdquo;),
          você (&ldquo;Cliente&rdquo;) concorda integralmente com estes Termos de Uso
          e com a <Link href="/privacidade" className="text-emerald-400 underline">Política de Privacidade</Link>.
          Se não concordar, não utilize o Serviço.
        </Section>

        <Section titulo="2. Descrição do Serviço">
          <p>O {b.nome} é uma plataforma SaaS (Software as a Service) para gestão
          de restaurantes que oferece, entre outros:</p>
          <ul>
            <li>Cardápio digital online e impressão de pedidos</li>
            <li>PDV/balcão, gestão de mesas, delivery</li>
            <li>Cozinha (KDS), totem de autoatendimento</li>
            <li>Caixa, financeiro, controle de estoque</li>
            <li>CRM, cupons, vales, relatórios</li>
            <li>Integrações com WhatsApp e marketplaces (iFood)</li>
          </ul>
          <p>Os módulos disponíveis variam conforme o plano contratado.</p>
        </Section>

        <Section titulo="3. Cadastro e Conta">
          <ul>
            <li>O Cliente deve fornecer dados verdadeiros e mantê-los atualizados</li>
            <li>É vedado o compartilhamento de credenciais entre múltiplos estabelecimentos</li>
            <li>O Cliente é responsável por toda atividade realizada em sua conta</li>
            <li>O acesso pode ser suspenso em caso de violação destes Termos</li>
          </ul>
        </Section>

        <Section titulo="4. Período de Teste e Pagamento">
          <ul>
            <li>Novos cadastros recebem <strong>14 dias de teste gratuito</strong> sem necessidade de cartão de crédito</li>
            <li>Após o trial, é necessário ativar uma assinatura para continuar usando</li>
            <li>Pagamentos são processados via gateways terceiros (Mercado Pago, Stripe)</li>
            <li>Cobrança é mensal recorrente; cancelamento pode ser feito a qualquer momento</li>
            <li>Não há reembolso de mensalidades já pagas</li>
            <li>Trial de módulo extra (7 dias) é único por módulo, por empresa</li>
          </ul>
        </Section>

        <Section titulo="5. Disponibilidade do Serviço">
          <ul>
            <li>Buscamos disponibilidade de 99% mensal, mas o Serviço pode passar por manutenções programadas</li>
            <li>Manutenções noturnas (após 02h horário de Brasília) podem causar indisponibilidade temporária</li>
            <li>Não nos responsabilizamos por falhas decorrentes de fatores externos: provedores de internet, gateways de pagamento, marketplaces (iFood), serviços terceiros</li>
          </ul>
        </Section>

        <Section titulo="6. Responsabilidades do Cliente">
          <ul>
            <li>Configurar corretamente impressoras, integrações e usuários</li>
            <li>Fazer backup local de dados críticos quando exportáveis</li>
            <li>Cumprir leis aplicáveis ao seu negócio (sanitárias, fiscais, trabalhistas, consumeristas)</li>
            <li>Não usar o Serviço para fins ilegais, fraudulentos ou que violem direitos de terceiros</li>
          </ul>
        </Section>

        <Section titulo="7. Propriedade Intelectual">
          <p>O código, design e marca do {b.nome} pertencem a {razao}.
          O Cliente recebe apenas uma <strong>licença de uso</strong> não exclusiva,
          intransferível e revogável durante o período da assinatura.</p>
          <p>Os dados do Cliente (cardápio, clientes, pedidos, etc) são de propriedade
          do Cliente, que pode exportá-los a qualquer momento.</p>
        </Section>

        <Section titulo="8. Limitação de Responsabilidade">
          <p>Em nenhuma hipótese o {b.nome} será responsável por:</p>
          <ul>
            <li>Lucros cessantes, danos indiretos ou consequenciais</li>
            <li>Perda de dados não decorrente de falha exclusiva da plataforma</li>
            <li>Decisões comerciais do Cliente baseadas em relatórios do sistema</li>
            <li>Conteúdo cadastrado pelo Cliente (cardápio, descrições, fotos)</li>
          </ul>
          <p>Em qualquer caso, a responsabilidade total não excederá o valor pago
          pelo Cliente nos últimos 12 meses.</p>
        </Section>

        <Section titulo="9. Cancelamento e Exclusão de Dados">
          <ul>
            <li>O Cliente pode cancelar sua assinatura a qualquer momento pelo painel</li>
            <li>Após cancelamento, o acesso é mantido até o fim do ciclo já pago</li>
            <li>Dados ficam em backup por 30 dias após cancelamento; depois são apagados definitivamente</li>
            <li>O Cliente pode solicitar exclusão imediata via <code>/painel/lgpd</code></li>
          </ul>
        </Section>

        <Section titulo="10. Alterações nos Termos">
          <p>Podemos alterar estes Termos a qualquer momento. Mudanças significativas
          serão comunicadas com 30 dias de antecedência via e-mail. O uso continuado
          após o aviso representa aceitação dos novos Termos.</p>
        </Section>

        <Section titulo="11. Foro">
          <p>Fica eleito o foro da comarca onde está sediada a empresa controladora
          ({razao}{b.cnpj ? `, CNPJ ${b.cnpj}` : ""}{b.endereco ? `, ${b.endereco}` : ""})
          para dirimir quaisquer questões decorrentes destes Termos, com renúncia
          de qualquer outro, por mais privilegiado que seja.</p>
        </Section>

        <p className="mt-12 text-xs text-slate-500">
          Em caso de dúvidas, entre em contato:{" "}
          {b.email ? (
            <a href={`mailto:${b.email}`} className="text-emerald-400">{b.email}</a>
          ) : (
            <span>{contatoEmail}</span>
          )}
          {b.telefone && <span> · Tel: {b.telefone}</span>}
          {b.whatsapp && <span> · WhatsApp: {b.whatsapp}</span>}
        </p>
      </main>
    </div>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold mb-2 text-white">{titulo}</h2>
      <div className="text-slate-300 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
