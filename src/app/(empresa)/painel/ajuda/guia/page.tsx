"use client";

/**
 * /painel/ajuda/guia
 *
 * Guia de uso página por página. Descreve cada aba do painel, o que
 * cada botão/campo faz, e fluxos comuns. Pra quem nunca usou ou tem
 * dúvida sobre uma tela específica.
 *
 * 100% client-side, sem chamada de API. Apenas conteúdo + sumário
 * lateral fixo (table of contents).
 */
import { useState, useMemo } from "react";
import {
  BookOpen, Search, ChevronRight,
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Bike, DollarSign,
  Package, Users, Settings, Tag, BarChart3, MapPin, CreditCard,
  Zap, LayoutGrid, Tv2, Wallet, Activity, ScrollText, Receipt,
  Database, Key, Printer, ShieldCheck, Mail, Server, Network, Truck,
  ChefHat, Building2, FileText, Bell,
} from "lucide-react";

// Tipos
interface Secao {
  id:        string;
  titulo:    string;
  icone:     React.ComponentType<{ className?: string }>;
  rota:      string;       // /painel/...
  resumo:    string;
  campos: Array<{
    nome:        string;
    descricao:   string;
    obrigatorio?: boolean;
  }>;
  fluxos: Array<{
    titulo: string;
    passos: string[];
  }>;
  dicas?: string[];
  permissao?: string;      // role mínimo
}

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo do guia (estruturado pra fácil manutenção)
// ─────────────────────────────────────────────────────────────────────────────
const SECOES: Secao[] = [
  {
    id: "dashboard",
    titulo: "Dashboard",
    icone: LayoutDashboard,
    rota: "/painel",
    resumo: "Visão geral do dia: faturamento, número de pedidos, ticket médio, pedidos em andamento e gráficos comparativos.",
    campos: [
      { nome: "Pedidos hoje", descricao: "Quantidade de pedidos criados no dia (qualquer status, exceto cancelados)." },
      { nome: "Faturamento hoje", descricao: "Soma do total de pedidos com status 'entregue' criados hoje." },
      { nome: "Ticket médio", descricao: "Faturamento ÷ número de pedidos finalizados." },
      { nome: "Pedidos em andamento", descricao: "Pedidos com status diferente de 'entregue' ou 'cancelado'." },
      { nome: "Gráfico de 7 dias", descricao: "Compara o faturamento dos últimos 7 dias." },
    ],
    fluxos: [
      { titulo: "Conferir o dia rapidamente", passos: [
        "Abrir /painel — primeira tela após login",
        "Olhar os 4 cards de topo (pedidos, faturamento, ticket, em andamento)",
        "Rolar até o gráfico pra ver tendência da semana",
      ]},
    ],
    dicas: [
      "Os números aparecem em tempo (quase) real, não precisa atualizar a página.",
      "Se algum card mostrar zero o dia inteiro, verifique se há caixa aberto.",
    ],
  },
  {
    id: "pedidos",
    titulo: "Pedidos",
    icone: ShoppingBag,
    rota: "/painel/pedidos",
    resumo: "Lista completa de pedidos com filtros por status, tipo (mesa, delivery, totem) e período. Permite mudar status, imprimir cupom, cancelar.",
    campos: [
      { nome: "Filtro status", descricao: "pendente · confirmado · preparando · pronto · saiu_entrega · entregue · cancelado" },
      { nome: "Filtro tipo", descricao: "mesa · balcão · delivery · totem · whatsapp · app" },
      { nome: "Buscar", descricao: "Por número do pedido, nome ou telefone do cliente." },
      { nome: "Botão 'Imprimir'", descricao: "Reenfilera o cupom pra impressora cadastrada (cozinha + cliente)." },
      { nome: "Botão 'Cancelar'", descricao: "Marca como cancelado e libera estoque/cupons usados (se houver)." },
    ],
    fluxos: [
      { titulo: "Marcar pedido como entregue", passos: [
        "Clicar no card do pedido",
        "No modal, escolher o próximo status no dropdown",
        "Clicar Salvar — o cliente recebe notificação WhatsApp automática se cadastrado",
      ]},
      { titulo: "Reimprimir cupom perdido", passos: [
        "Abrir o pedido",
        "Botão 'Imprimir' → escolher cozinha ou cliente",
        "Aguardar agente de impressão processar (até 5s)",
      ]},
    ],
  },
  {
    id: "cardapio",
    titulo: "Cardápio",
    icone: UtensilsCrossed,
    rota: "/painel/cardapio",
    resumo: "Gerencia categorias e produtos. Inclui variações (tamanho/adicionais), preço, custo, foto, disponibilidade, e flag exclusivo da filial.",
    campos: [
      { nome: "Categoria", descricao: "Agrupa produtos. Ordem define a sequência no totem/cardápio público.", obrigatorio: true },
      { nome: "Nome do produto", descricao: "Texto que aparece no cardápio.", obrigatorio: true },
      { nome: "Preço", descricao: "Valor base. Variações somam preco_extra.", obrigatorio: true },
      { nome: "Preço de custo", descricao: "Opcional. Usado em relatórios de margem." },
      { nome: "Variações", descricao: "Grupos como Tamanho (P/M/G), Adicionais (queijo, bacon). Cada opção tem preço extra." },
      { nome: "Pontos de fidelidade", descricao: "Pontos creditados ao cliente quando este produto é comprado. 0 = usa regra geral." },
      { nome: "Disponível", descricao: "Se desligado, o produto somе do cardápio público mas continua no admin." },
      { nome: "Destaque", descricao: "Aparece na carrossel destacada do totem." },
      { nome: "Imagem", descricao: "Upload direto. É convertida pra WebP otimizada (máx 1600px) e armazenada no MinIO." },
      { nome: "Botão 🔒 Exclusivo desta filial", descricao: "Só aparece em redes com cardápio compartilhado. Marca o produto como visível só na filial atual." },
    ],
    fluxos: [
      { titulo: "Criar produto com variações", passos: [
        "Aba Produtos → 'Novo Produto'",
        "Preencher nome + categoria + preço base",
        "Em Variações, clicar 'Inserir exemplo' ou criar grupo manual",
        "Cada opção tem nome + preco_extra (somado ao preço base)",
        "Salvar",
      ]},
      { titulo: "Tirar produto temporariamente do ar", passos: [
        "Card do produto → ícone toggle (canto inferior direito)",
        "Vira cinza = indisponível, não aparece no cardápio público",
      ]},
    ],
    dicas: [
      "Imagens são convertidas pra WebP automaticamente — pode subir JPG/PNG até 10 MB.",
      "Em rede com cardápio sincronizado, criar produto na matriz reflete em todas filiais.",
    ],
  },
  {
    id: "cozinha",
    titulo: "Cozinha (KDS)",
    icone: ChefHat,
    rota: "/painel/cozinha",
    resumo: "Tela do display da cozinha. Mostra pedidos confirmados em colunas (a fazer → preparando → pronto). Toque/clique avança status.",
    campos: [
      { nome: "Colunas", descricao: "Pendente · Preparando · Pronto. Cada card é um pedido." },
      { nome: "Cronômetro", descricao: "Tempo desde a criação do pedido. Vira amarelo aos 15min, vermelho aos 30min." },
      { nome: "Botão avançar", descricao: "Move o pedido pra próxima coluna. Notifica o cliente." },
    ],
    fluxos: [
      { titulo: "Operar com toque", passos: [
        "Tocar o card vai pra próxima coluna",
        "Long-press abre menu com 'voltar status' ou 'detalhes'",
      ]},
    ],
    dicas: [
      "Funciona offline parcialmente (mostra últimos pedidos em cache).",
      "Configure /painel/impressoras pra ter cupom impresso paralelo ao KDS.",
    ],
  },
  {
    id: "delivery",
    titulo: "Delivery",
    icone: Bike,
    rota: "/painel/delivery",
    resumo: "Fila de pedidos delivery + gestão de motoboys. Atribui motoboy, vê GPS em tempo real, fecha conta no fim do turno.",
    campos: [
      { nome: "Aba Pedidos", descricao: "Pendentes pra entrega. Botão 'Atribuir' chama um motoboy ativo." },
      { nome: "Aba Motoboys", descricao: "CRUD de motoboys. Cada um vira usuário com role=motoboy." },
      { nome: "GPS último ping", descricao: "Atualiza a cada 30s quando o motoboy está com app aberto." },
      { nome: "Fechar conta", descricao: "Soma corridas do dia, taxa por entrega, e imprime cupom de fechamento." },
    ],
    fluxos: [
      { titulo: "Despachar pedido", passos: [
        "Aba Pedidos → card do pedido",
        "Selecionar motoboy no dropdown",
        "Clicar 'Atribuir' — pedido vai pro app do motoboy",
      ]},
    ],
  },
  {
    id: "mesas",
    titulo: "Mesas",
    icone: LayoutGrid,
    rota: "/painel/mesas",
    resumo: "Layout das mesas com status (livre/ocupada/conta pedida). Cada mesa tem QR code próprio que cliente escaneia.",
    campos: [
      { nome: "Mesa livre (verde)", descricao: "Sem comanda aberta." },
      { nome: "Mesa ocupada (laranja)", descricao: "Com pedidos não fechados." },
      { nome: "Pedir conta (vermelho)", descricao: "Cliente apertou o botão 'pedir conta' no QR." },
      { nome: "QR Code", descricao: "Cada mesa tem URL única /m/[token]. Imprima e cole na mesa." },
    ],
    fluxos: [
      { titulo: "Fechar comanda da mesa", passos: [
        "Clicar na mesa → 'Fechar conta'",
        "Confere itens, aplica desconto se preciso",
        "Escolhe forma de pagamento",
        "Confirma — mesa volta a livre e cupom é impresso",
      ]},
    ],
  },
  {
    id: "totem",
    titulo: "Totem (autoatendimento)",
    icone: Tv2,
    rota: "/painel/kiosk",
    resumo: "Configura o totem touch (kiosk). Cor de destaque, vídeo/imagem de fundo, slogan, mensagens, aceita dinheiro, tema claro/escuro.",
    campos: [
      { nome: "totem_bg_video_url", descricao: "URL de vídeo MP4 que toca em loop como fundo. Vazio = imagem ou cor sólida." },
      { nome: "totem_cta_text", descricao: "Botão grande inicial. Ex: 'Toque para começar'." },
      { nome: "totem_slogan", descricao: "Frase de apoio abaixo do CTA." },
      { nome: "totem_cor_destaque", descricao: "Cor primária do totem (botões, destaques). Se vazia, usa cor_primaria geral." },
      { nome: "totem_aceita_dinheiro", descricao: "Habilita opção 'Dinheiro' no checkout. Desligado força PIX/cartão." },
      { nome: "totem_tema", descricao: "claro / escuro. Default escuro." },
    ],
    fluxos: [
      { titulo: "Ativar totem novo", passos: [
        "Configurar /painel/kiosk com vídeo + texto",
        "Abrir /totem/{slug_da_empresa} no tablet em modo fullscreen",
        "Configurar impressora em /painel/impressoras",
        "Configurar gateway PIX em /painel/gateways",
      ]},
    ],
  },
  {
    id: "pdv",
    titulo: "PDV (balcão)",
    icone: Receipt,
    rota: "/painel/pdv",
    resumo: "Frente de loja: cadastra pedido balcão rápido, escolhe forma de pagamento, abre/fecha caixa.",
    campos: [
      { nome: "Buscar produto", descricao: "Por nome, código ou categoria." },
      { nome: "Carrinho", descricao: "Itens com qtd, variações, observação livre." },
      { nome: "Forma de pagamento", descricao: "dinheiro / pix / pinpad / cartao_maquina / cartao_credito." },
      { nome: "Cliente (opcional)", descricao: "Vincula ao CRM pra acumular pontos e cashback." },
    ],
    fluxos: [
      { titulo: "Venda rápida", passos: [
        "Buscar produto → clica no card pra add",
        "Ajustar qtd e variações",
        "Forma de pagamento",
        "Finalizar — imprime cupom + reduz estoque",
      ]},
    ],
  },
  {
    id: "caixa",
    titulo: "Caixa",
    icone: Wallet,
    rota: "/painel/caixa",
    resumo: "Abertura, sangria, reforço e fechamento de caixa. Confere valores recebidos vs esperados por forma de pagamento.",
    campos: [
      { nome: "Valor de abertura", descricao: "Dinheiro inicial em espécie no gaveta." },
      { nome: "Sangria", descricao: "Retirada de dinheiro durante o turno (depósito banco, troco)." },
      { nome: "Reforço", descricao: "Entrada extra (troco vindo, bancário)." },
      { nome: "Fechamento", descricao: "Confronta esperado × informado. Gera cupom resumo." },
    ],
    fluxos: [
      { titulo: "Fluxo do turno", passos: [
        "Abrir caixa com valor de abertura",
        "Durante o dia, fazer sangrias/reforços quando precisar",
        "No fim, fechar — informar contagem física",
        "Diferença é gravada e impressa no cupom",
      ]},
    ],
    dicas: [
      "Empresa com caixa_obrigatorio=true não aceita pedidos com caixa fechado.",
    ],
  },
  {
    id: "clientes",
    titulo: "Clientes & Fidelidade",
    icone: Users,
    rota: "/painel/clientes",
    resumo: "CRM, pontos de fidelidade, cashback, vales, troca de pontos por cupom.",
    campos: [
      { nome: "Ranking pontos", descricao: "Top 3 clientes em pódio + lista paginada." },
      { nome: "Ajustar pontos", descricao: "+ ou - com observação. Vai pro histórico." },
      { nome: "🎁 Gerar cupom", descricao: "Troca pontos por cupom de valor calculado em R$/pt." },
      { nome: "Limite de vale", descricao: "Saldo máximo de crediário que o cliente pode usar." },
    ],
    fluxos: [
      { titulo: "Resgatar cupom pra cliente", passos: [
        "Clicar no cliente → modal abre",
        "No bloco amber '🎁 Gerar cupom', digitar quantos pontos",
        "Clica Gerar — cupom RGT-XXXXXX é criado, código copiável",
      ]},
    ],
    dicas: [
      "Em rede com fidelidade cross-filial, o cliente acumula em qualquer loja da rede.",
    ],
  },
  {
    id: "cupons",
    titulo: "Cupons",
    icone: Tag,
    rota: "/painel/cupons",
    resumo: "CRUD de cupons promocionais (percentual, valor fixo, frete grátis). Pode ser global, exclusivo cliente, ou template de resgate.",
    campos: [
      { nome: "Código", descricao: "Texto que cliente digita no checkout (ex: PROMO10)." },
      { nome: "Tipo", descricao: "percentual (10%) · fixo (R$10) · frete_gratis." },
      { nome: "Uso máximo", descricao: "Quantas vezes o cupom pode ser usado no total." },
      { nome: "Uso por cliente", descricao: "Quantas vezes cada cliente pode usar." },
      { nome: "Valor mínimo pedido", descricao: "Cupom só vale acima desse valor." },
      { nome: "Validade", descricao: "Data limite. Vazio = sem expiração." },
      { nome: "Pontos resgate", descricao: "Se preenchido, vira cupom-template resgatável no painel do cliente." },
    ],
    fluxos: [
      { titulo: "Criar promoção temporária", passos: [
        "Novo Cupom → tipo='percentual', valor=10",
        "Uso máximo=100, validade=hoje+7d",
        "Salvar — divulgar o código pros clientes",
      ]},
    ],
  },
  {
    id: "estoque",
    titulo: "Estoque",
    icone: Package,
    rota: "/painel/estoque",
    resumo: "Controle de saldo por produto. Movimentações de entrada, saída, ajuste. Em rede tem aba de Transferências entre filiais.",
    campos: [
      { nome: "Saldo atual", descricao: "Estoque disponível pra venda. Reduz automático ao finalizar pedido." },
      { nome: "Saldo mínimo", descricao: "Alerta visual quando saldo cai abaixo." },
      { nome: "Custo médio", descricao: "Atualizado a cada entrada (média ponderada)." },
    ],
    fluxos: [
      { titulo: "Lançar entrada (compra)", passos: [
        "Aba Movimentações → 'Nova entrada'",
        "Escolher produto + quantidade + custo unitário",
        "Salvar — saldo e custo médio são atualizados",
      ]},
    ],
  },
  {
    id: "rede",
    titulo: "Rede de filiais",
    icone: Network,
    rota: "/painel/rede",
    resumo: "Dashboard consolidado da rede + transferências. Disponível pra empresas com rede_id configurado.",
    campos: [
      { nome: "Totais agregados", descricao: "Soma de todas as filiais no período escolhido." },
      { nome: "Breakdown por filial", descricao: "Ranking de filiais por faturamento." },
      { nome: "Top produtos", descricao: "Mais vendidos somando todas as filiais." },
      { nome: "Gráfico por dia", descricao: "Tendência diária consolidada." },
    ],
    fluxos: [
      { titulo: "Transferir produto entre filiais", passos: [
        "/painel/rede/transferencias → 'Nova transferência'",
        "Origem = filial atual; Destino = outra filial; produto + qtd",
        "Origem confirma 'Enviar' (status: em_transito)",
        "Destino confirma 'Receber' — saldo migra",
      ]},
    ],
  },
  {
    id: "financeiro",
    titulo: "Financeiro",
    icone: DollarSign,
    rota: "/painel/financeiro",
    resumo: "Mensalidades, faturas, recibos. Status da assinatura. Histórico de pagamentos.",
    campos: [
      { nome: "Mensalidade atual", descricao: "Fatura do mês corrente com vencimento e link de pagamento." },
      { nome: "Histórico", descricao: "Faturas anteriores com status (paga, em_aberto, atrasada)." },
      { nome: "Plano", descricao: "Plano contratado e módulos ativos." },
    ],
    fluxos: [
      { titulo: "Pagar mensalidade", passos: [
        "Aba Mensalidades → clicar fatura aberta",
        "Escolher método (PIX ou cartão)",
        "Pagar via gateway Mercado Pago/Cielo",
      ]},
    ],
  },
  {
    id: "relatorios",
    titulo: "Relatórios",
    icone: BarChart3,
    rota: "/painel/relatorios",
    resumo: "Relatórios analíticos: vendas, produtos, clientes, motoboys, estoque, financeiro.",
    campos: [
      { nome: "Filtro de período", descricao: "Hoje · 7d · 30d · mês · personalizado." },
      { nome: "Filtro por filial", descricao: "Em rede, escolhe uma ou todas." },
      { nome: "Botão exportar", descricao: "CSV / PDF dos dados visíveis." },
    ],
    fluxos: [],
  },
  {
    id: "config",
    titulo: "Configurações",
    icone: Settings,
    rota: "/painel/config",
    resumo: "Dados da empresa, cores, horário, taxa de entrega, módulos ativos, regras de fidelidade/cashback.",
    campos: [
      { nome: "nome_fantasia · cnpj · slug", descricao: "Identidade. Slug é a URL pública (/p/{slug})." },
      { nome: "cor_primaria · cor_secundaria", descricao: "Cores do painel e do cardápio público." },
      { nome: "horario_abertura · horario_fechamento", descricao: "Janela em que o cardápio fica online." },
      { nome: "taxa_entrega · pedido_minimo", descricao: "Defaults pra delivery sem regra de bairro." },
      { nome: "fidelidade_ativo", descricao: "Liga/desliga sistema de pontos." },
      { nome: "pontos_por_real", descricao: "Quantos pontos o cliente ganha por R$1 gasto." },
      { nome: "real_por_ponto", descricao: "Valor em R$ de cada ponto na hora de trocar por cupom." },
      { nome: "cashback_ativo · cashback_percentual", descricao: "Sistema paralelo: % do pedido vira saldo." },
    ],
    fluxos: [],
  },
  {
    id: "impressoras",
    titulo: "Impressoras",
    icone: Printer,
    rota: "/painel/impressoras",
    resumo: "Cadastra impressoras térmicas (rede TCP ou Windows). Gera key + .tar.gz do agente que roda na máquina do restaurante.",
    campos: [
      { nome: "Setor", descricao: "cozinha · caixa · balcao. Cada cupom vai pro setor correspondente." },
      { nome: "Tipo", descricao: "tcp (IP da impressora na rede) ou windows (nome da impressora instalada)." },
      { nome: "Host · Porta", descricao: "Pra tcp: IP da impressora e porta (geralmente 9100)." },
      { nome: "Gerar key", descricao: "Cria token único pro agente autenticar. .tar.gz é baixado e instalado." },
    ],
    fluxos: [
      { titulo: "Instalar agente Windows", passos: [
        "Gerar key → baixar .tar.gz",
        "Extrair na máquina do restaurante (precisa Node.js 18+)",
        "Duplo clique em setup.bat",
        "Colar a key e escolher tipo (rede/Windows) pra cada setor",
        "Pra rodar em segundo plano: install-service.bat como admin",
      ]},
    ],
  },
  {
    id: "integracoes",
    titulo: "Integrações",
    icone: Zap,
    rota: "/painel/integracoes",
    resumo: "Conecta WhatsApp (Evolution API), iFood, sistemas legados, webhooks externos.",
    campos: [
      { nome: "WhatsApp Evolution", descricao: "URL + key do servidor Evolution. QR code pra parear número." },
      { nome: "iFood", descricao: "Client_id + secret do iFood pra puxar pedidos automaticamente." },
      { nome: "Webhooks", descricao: "URLs externas notificadas em eventos (novo pedido, etc)." },
    ],
    fluxos: [
      { titulo: "Conectar WhatsApp", passos: [
        "Aba WhatsApp → escanear QR code com WhatsApp Business",
        "Aguardar status 'connected'",
        "Os eventos (novo_pedido, pronto, saiu_entrega, entregue) disparam mensagens automáticas",
      ]},
    ],
  },
  {
    id: "gateways",
    titulo: "Gateways de pagamento",
    icone: CreditCard,
    rota: "/painel/gateways",
    resumo: "Mercado Pago, Cielo (eCommerce/LIO/TEF), PIX direto. Escolhe um como padrão.",
    campos: [
      { nome: "Mercado Pago", descricao: "Access token + chave pública. Suporta Checkout Pro + PreApproval." },
      { nome: "Cielo eCommerce", descricao: "Merchant ID + merchant key. Cobranças PIX/cartão via API." },
      { nome: "Cielo LIO", descricao: "Integração com maquininha Cielo LIO via Order Manager." },
      { nome: "Cielo TEF", descricao: "Integração Android Intent (POS Cielo no totem)." },
      { nome: "Padrão", descricao: "Gateway usado quando o cliente não escolhe (PIX no totem etc)." },
    ],
    fluxos: [],
  },
  {
    id: "retaguarda",
    titulo: "Retaguarda local (mini-PC na loja)",
    icone: Server,
    rota: "/admin/retaguardas (master)",
    resumo: "Cada restaurante grande pode ter um mini-PC rodando 'retaguarda' — um proxy local que cacheia cardápio, imagens e estáticos. Totens/PDVs/painéis dentro da loja batem nele em vez de irem direto pra app principal. Reduz drasticamente a banda usada e o número de acessos simultâneos no servidor central.",
    campos: [
      { nome: "Mini-PC mínimo", descricao: "2 vCPU, 4 GB RAM, 20 GB SSD, Linux Ubuntu/Debian. Pode ser um Raspberry Pi 4 ou Mini PC NUC." },
      { nome: "Comando único", descricao: "curl -fsSL https://raw.githubusercontent.com/yurigoes/cardapio_saas/main/retaguarda/install.sh | sudo bash" },
      { nome: "Cloudflare Tunnel", descricao: "Gera HTTPS público em loja-X.tthreedigital.com.br sem precisar de IP fixo. Cria 1 tunnel por loja na sua conta CF." },
      { nome: "Acesso interno na LAN", descricao: "Os totens/PDVs dentro da loja podem acessar pelo IP local direto (ex: http://192.168.0.50/totem/{slug}) sem precisar de cert SSL ou DNS." },
      { nome: "Heartbeat", descricao: "Retaguarda manda ping pro master a cada 60s. Status visível em /admin/retaguardas (master)." },
      { nome: "Cache em camadas", descricao: "Imagens 7 dias · Cardápio 5 min · Estáticos Next 30 dias · Mutations pass-through." },
    ],
    fluxos: [
      { titulo: "Instalar retaguarda nova (1ª vez por loja)", passos: [
        "Pré-req do master (UMA VEZ SÓ pra todas as lojas): adicionar RETAGUARDA_HEARTBEAT_SECRET no .env, rodar migration 081, restart",
        "Pré-req do Cloudflare (UMA VEZ SÓ): criar API Token com Tunnel:Edit + DNS:Edit, anotar Account ID e Zone ID",
        "Na máquina nova, rodar: curl -fsSL ...install.sh | sudo bash",
        "Responder: slug da empresa, URL do master, CF token+account+zone, heartbeat secret",
        "O script instala Docker, cria tunnel, configura DNS, sobe containers — tudo automático",
        "Ao fim mostra: IP local da retaguarda + URL pública via tunnel",
      ]},
      { titulo: "Configurar totem pra usar a retaguarda local", passos: [
        "Opção A (mais simples): acessar http://IP_LOCAL/totem/{slug} no totem. Pega IP do mini-PC no roteador.",
        "Opção B (PWA + LAN): split-DNS no roteador da loja apontando loja-X.tthreedigital.com.br pro IP local. Totem usa o domínio normal e ganha cert SSL + latência LAN.",
        "Opção C (PWA + público): só usar loja-X.tthreedigital.com.br via Cloudflare. Latência 50-80ms mas sem mexer no roteador.",
      ]},
      { titulo: "Atualizar a retaguarda", passos: [
        "ssh root@mini-pc",
        "cd /opt/cardapio_saas && git pull",
        "cd retaguarda && docker compose pull && docker compose up -d",
      ]},
      { titulo: "Diagnosticar problema na retaguarda", passos: [
        "docker compose logs -f nginx-cache (ver cache hits/miss)",
        "docker logs retaguarda_cloudflared (ver status do tunnel)",
        "curl http://localhost/__retaguarda_health (deve retornar 200)",
        "curl -I https://loja-X.tthreedigital.com.br/api/pub/cardapio/{slug} (deve ter header X-Retaguarda-Cache: HIT após 1ª chamada)",
      ]},
    ],
    dicas: [
      "Sem retaguarda, os totens funcionam normalmente — só usam o master direto. Retaguarda é um acelerador opcional pra lojas grandes.",
      "1 conta Cloudflare suporta tunnels ILIMITADOS no plano grátis. Pode criar 1 por loja sem custo.",
      "Pra IP local não mudar, configure DHCP estático no roteador (lease permanente pro MAC do mini-PC).",
      "Mutations (criar pedido, etc) sempre vão pro master — retaguarda só cacheia leituras. Se internet cair, o totem trava na hora de finalizar pedido (próxima etapa terá buffer offline).",
    ],
  },
  {
    id: "monitoramento",
    titulo: "Monitor & saúde do sistema",
    icone: Activity,
    rota: "/api/health/limits",
    resumo: "Endpoint público que devolve métricas de saturação do servidor: uso do pool de banco, conexões PG ativas, % cache hit do Postgres, memória do Node, status do Redis, e nível agregado de alerta (ok/atencao/critico).",
    campos: [
      { nome: "pool_db.pct_uso", descricao: "% do pool de conexões PG em uso. Atenção >75%, crítico >90%." },
      { nome: "postgres.cache_hit_pct", descricao: "% de queries que vieram do cache do PG. Saudável >98%." },
      { nome: "node.rss_mb", descricao: "Memória RSS do processo Node. Alerta >800 MB." },
      { nome: "redis.ok", descricao: "Boolean. Se false, cache desativado e tudo cai direto no PG." },
      { nome: "alerta_nivel", descricao: "Agregado: ok / atencao / critico. HTTP 503 quando crítico." },
    ],
    fluxos: [
      { titulo: "Configurar monitoramento externo", passos: [
        "Em uptime-kuma ou similar, adicionar monitor HTTP em https://app.tthreedigital.com.br/api/health/limits",
        "Configurar alerta se HTTP != 200 (= status crítico)",
        "Opcional: parsear JSON e alertar nos campos específicos (pool_db.pct_uso > 80, etc)",
        "Alerta pode ir pro WhatsApp via n8n ou webhook do Discord",
      ]},
    ],
  },
  {
    id: "usuarios",
    titulo: "Usuários",
    icone: Users,
    rota: "/painel/usuarios",
    resumo: "CRUD de usuários do painel. Roles: admin, gerente, atendente, motoboy. Permissões por role.",
    campos: [
      { nome: "Nome · email · senha", descricao: "Credenciais de login." },
      { nome: "Role", descricao: "Define permissões. admin=tudo, gerente=op+config, atendente=op, motoboy=delivery." },
      { nome: "Opera todas filiais", descricao: "Em rede, permite o usuário trocar filial ativa via dropdown header." },
    ],
    fluxos: [
      { titulo: "Criar gerente novo", passos: [
        "Novo usuário → role=gerente",
        "Senha forte (8+ chars, maiúscula, número)",
        "Marcar 'opera todas filiais' se aplicável",
      ]},
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function GuiaSistemaPage() {
  const [busca, setBusca]     = useState("");
  const [ativaId, setAtivaId] = useState(SECOES[0].id);

  const secoesFiltradas = useMemo(() => {
    if (!busca.trim()) return SECOES;
    const b = busca.toLowerCase();
    return SECOES.filter(s =>
      s.titulo.toLowerCase().includes(b) ||
      s.resumo.toLowerCase().includes(b) ||
      s.campos.some(c => c.nome.toLowerCase().includes(b) || c.descricao.toLowerCase().includes(b)) ||
      s.fluxos.some(f => f.titulo.toLowerCase().includes(b) || f.passos.some(p => p.toLowerCase().includes(b)))
    );
  }, [busca]);

  return (
    <div className="flex gap-6">
      {/* ── Sumário lateral ──────────────────────────────────────────────── */}
      <aside className="sticky top-4 hidden lg:block h-fit w-64 flex-shrink-0 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-2 px-2 py-1 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <BookOpen className="h-3.5 w-3.5" />
          Sumário
        </div>
        <nav className="space-y-0.5 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          {secoesFiltradas.map(s => {
            const ativa = ativaId === s.id;
            const Icon = s.icone;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setAtivaId(s.id)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  ativa ? "bg-brand/15 text-brand" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{s.titulo}</span>
              </a>
            );
          })}
        </nav>
      </aside>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header + busca */}
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
                <BookOpen className="h-6 w-6 text-brand" />
                Guia do sistema
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Explicação detalhada de cada tela do painel, com campos, fluxos e dicas.
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar tela, campo ou fluxo… (ex: cupom, motoboy, fidelidade)"
              className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand/40 focus:outline-none"
            />
          </div>

          {busca && secoesFiltradas.length === 0 && (
            <p className="rounded-lg border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
              Nenhuma seção encontrada com &quot;{busca}&quot;.
            </p>
          )}
        </header>

        {/* Seções */}
        {secoesFiltradas.map(s => {
          const Icon = s.icone;
          return (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-4 rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4"
            >
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                    <Icon className="h-5 w-5 text-brand" />
                    {s.titulo}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Acesso: <code className="rounded bg-white/10 px-1.5 py-0.5">{s.rota}</code>
                  </p>
                </div>
              </header>

              <p className="text-sm text-slate-300 leading-relaxed">{s.resumo}</p>

              {/* Campos */}
              {s.campos.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Campos &amp; botões
                  </h3>
                  <div className="space-y-1.5">
                    {s.campos.map((c, i) => (
                      <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
                        <p className="flex items-center gap-2 text-sm font-medium text-white">
                          {c.nome}
                          {c.obrigatorio && (
                            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                              obrigatório
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">{c.descricao}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fluxos */}
              {s.fluxos.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Fluxos comuns
                  </h3>
                  <div className="space-y-3">
                    {s.fluxos.map((f, i) => (
                      <div key={i} className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
                        <p className="mb-1.5 text-sm font-semibold text-white">{f.titulo}</p>
                        <ol className="space-y-0.5 pl-4 text-xs text-slate-400 list-decimal">
                          {f.passos.map((p, j) => <li key={j}>{p}</li>)}
                        </ol>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dicas */}
              {s.dicas && s.dicas.length > 0 && (
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                    💡 Dicas
                  </p>
                  <ul className="space-y-0.5 pl-4 text-xs text-slate-300 list-disc">
                    {s.dicas.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
            </section>
          );
        })}

        {/* Rodapé */}
        <footer className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center text-xs text-slate-500">
          Não achou o que procurava? Veja as{" "}
          <a href="/painel/ajuda/especificacoes" className="text-brand hover:underline">especificações técnicas</a>
          {" "}ou abra um chamado em{" "}
          <a href="/painel/suporte" className="text-brand hover:underline">/painel/suporte</a>.
        </footer>
      </div>
    </div>
  );
}
