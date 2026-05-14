import Link from "next/link";
import { ChefHat, ArrowLeft, Shield, Download, Trash2 } from "lucide-react";
import { getSaasBranding } from "@/lib/branding/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const b = await getSaasBranding();
  return { title: `Política de Privacidade · ${b.nome}` };
}

export default async function PrivacidadePage() {
  const b = await getSaasBranding();
  const razao = b.razao_social ?? b.nome;
  const dpoEmail = b.dpo_email ?? b.email;
  const dpoNome  = b.dpo_nome ?? "Encarregado de Proteção de Dados";

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

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-emerald-400" />
          <h1 className="text-3xl font-bold">Política de Privacidade</h1>
        </div>
        <p className="text-sm text-slate-400 mb-8">
          Conformidade com LGPD (Lei 13.709/2018). Última atualização: maio de 2026
        </p>

        <Section titulo="1. Quem somos">
          <p>{b.nome} é uma plataforma de gestão para restaurantes operada
          por <strong>{razao}</strong>{b.cnpj ? `, CNPJ ${b.cnpj}` : ""}{b.endereco ? `, sediada em ${b.endereco}` : ""}.</p>
          {dpoEmail && (
            <p>Nosso encarregado de proteção de dados ({dpoNome}) pode ser contactado em:{" "}
              <a href={`mailto:${dpoEmail}`} className="text-emerald-400">{dpoEmail}</a>
              {b.dpo_telefone && <span> · Tel: {b.dpo_telefone}</span>}
            </p>
          )}
        </Section>

        <Section titulo="2. Quais dados coletamos">
          <p><strong>Do estabelecimento:</strong> nome fantasia, razão social, CNPJ,
          endereço, e-mail, telefone, dados bancários (quando configurar gateway de pagamento).</p>
          <p><strong>Dos usuários do sistema (operadores):</strong> nome, e-mail, telefone, senha (hash bcrypt — não temos acesso à senha original), papel/função, IP de acesso, log de ações.</p>
          <p><strong>Dos clientes finais (consumidores que pedem comida):</strong> nome, telefone, endereço de entrega, histórico de pedidos. Coletados apenas quando o cliente fornece via cardápio digital ou cadastro.</p>
        </Section>

        <Section titulo="3. Pra que usamos">
          <ul className="list-disc pl-5 space-y-1">
            <li>Operacionalizar o sistema (login, gestão de pedidos, etc)</li>
            <li>Processar pagamentos e cobranças</li>
            <li>Enviar notificações operacionais (pedido pronto via WhatsApp)</li>
            <li>Gerar relatórios e estatísticas pro estabelecimento</li>
            <li>Cumprir obrigações legais (fiscais, regulatórias)</li>
            <li>Suporte técnico e atendimento</li>
          </ul>
          <p className="mt-3"><strong>Não vendemos dados</strong> a terceiros. Não usamos seus dados
          pra publicidade direcionada.</p>
        </Section>

        <Section titulo="4. Com quem compartilhamos">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Gateways de pagamento</strong> (Mercado Pago, Stripe): dados necessários pra processar cobranças</li>
            <li><strong>Marketplaces</strong> (iFood, quando integrado): dados de pedido recebidos por essa via</li>
            <li><strong>Provedor de WhatsApp</strong> (Evolution): número e mensagem enviada</li>
            <li><strong>Cloudflare</strong> (CDN/proxy): dados de acesso (IP) pra entrega das páginas</li>
            <li><strong>Autoridades competentes</strong>, mediante ordem judicial ou requisição legal</li>
          </ul>
        </Section>

        <Section titulo="5. Onde armazenamos">
          <p>Dados ficam em servidor próprio (VPS) localizado no Brasil, com:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Banco PostgreSQL com senhas individuais por instância</li>
            <li>Backups diários criptografados</li>
            <li>HTTPS obrigatório (Cloudflare SSL)</li>
            <li>Tokens JWT com expiração de 15 minutos (access) + 7 dias (refresh)</li>
            <li>Senhas armazenadas com bcrypt cost 12 (irreversível)</li>
          </ul>
        </Section>

        <Section titulo="6. Por quanto tempo guardamos">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Conta ativa:</strong> enquanto a assinatura estiver vigente</li>
            <li><strong>Após cancelamento:</strong> 30 dias em backup, depois exclusão definitiva</li>
            <li><strong>Dados fiscais</strong> (notas, recibos): 5 anos (obrigação legal)</li>
            <li><strong>Logs de acesso/auditoria:</strong> 6 meses</li>
            <li><strong>Erros de sistema:</strong> 30 dias</li>
          </ul>
        </Section>

        <Section titulo="7. Seus direitos (LGPD Art. 18)" destaque>
          <p>Como titular dos dados, você tem direito a:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Confirmar</strong> a existência de tratamento</li>
            <li><strong>Acessar</strong> seus dados</li>
            <li><strong>Corrigir</strong> dados incompletos, inexatos ou desatualizados</li>
            <li><strong>Solicitar anonimização, bloqueio ou eliminação</strong> de dados desnecessários</li>
            <li><strong>Portabilidade</strong> — exportar seus dados em formato estruturado</li>
            <li><strong>Eliminação</strong> dos dados tratados com seu consentimento</li>
            <li><strong>Revogar consentimento</strong> a qualquer momento</li>
          </ul>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <Link href="/painel/lgpd" className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-3 text-center font-bold text-white flex items-center justify-center gap-2">
              <Download className="h-4 w-4" /> Exportar meus dados
            </Link>
            <Link href="/painel/lgpd" className="rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-4 py-3 text-center font-bold text-red-200 flex items-center justify-center gap-2">
              <Trash2 className="h-4 w-4" /> Excluir minha conta
            </Link>
          </div>
        </Section>

        <Section titulo="8. Cookies">
          <p>Usamos apenas cookies essenciais para funcionamento do sistema
          (sessão JWT, preferências de tema). Não usamos cookies de tracking
          publicitário.</p>
        </Section>

        <Section titulo="9. Crianças e adolescentes">
          <p>O Serviço não é direcionado a menores de 18 anos. Não coletamos
          intencionalmente dados de menores.</p>
        </Section>

        <Section titulo="10. Mudanças nesta política">
          <p>Notificaremos por e-mail mudanças significativas com 30 dias de
          antecedência. O uso continuado representa aceitação.</p>
        </Section>

        <Section titulo="11. Contato">
          <p>Pra exercer seus direitos ou tirar dúvidas:</p>
          <ul className="list-disc pl-5">
            {dpoEmail && (
              <li>E-mail (DPO): <a href={`mailto:${dpoEmail}`} className="text-emerald-400">{dpoEmail}</a></li>
            )}
            {b.email && b.email !== dpoEmail && (
              <li>E-mail geral: <a href={`mailto:${b.email}`} className="text-emerald-400">{b.email}</a></li>
            )}
            {b.dpo_telefone && <li>Telefone: {b.dpo_telefone}</li>}
            {b.whatsapp && <li>WhatsApp: {b.whatsapp}</li>}
            <li>Painel: <Link href="/painel/lgpd" className="text-emerald-400">/painel/lgpd</Link></li>
          </ul>
          <p className="mt-3">Resposta em até 15 dias úteis.</p>
        </Section>
      </main>
    </div>
  );
}

function Section({ titulo, destaque, children }: { titulo: string; destaque?: boolean; children: React.ReactNode }) {
  return (
    <section className={`mt-8 ${destaque ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5" : ""}`}>
      <h2 className="text-xl font-bold mb-2 text-white">{titulo}</h2>
      <div className="text-slate-300 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
