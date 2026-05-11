// ─────────────────────────────────────────────
// Sistema de Módulos — Registry completo
// ─────────────────────────────────────────────

export type ModuloId =
  | "cardapio_digital"
  | "delivery"
  | "balcao"
  | "mesa"
  | "comanda"
  | "autoatendimento"
  | "totem"
  | "cozinha_kds"
  | "garcom"
  | "financeiro"
  | "estoque"
  | "compras"
  | "fiscal"
  | "crm"
  | "fidelidade"
  | "cashback"
  | "cupom"
  | "marketing"
  | "whatsapp"
  | "multiunidade"
  | "assinaturas"
  | "relatorios_basicos"
  | "relatorios_avancados"
  | "bi_dashboard"
  | "api_externa"
  | "ifood"
  | "consumer"
  | "erp"
  | "contabil"
  | "impressoras"
  | "tef"
  | "pix"
  | "motoboy"
  | "rastreamento"
  | "autoatendimento_qrcode"
  | "notificacoes"
  | "auditoria"
  | "backup"
  | "monitoramento";

export interface ModuloInfo {
  id:          ModuloId;
  nome:        string;
  descricao:   string;
  categoria:   string;
  icone:       string;
  dependencias?: ModuloId[];
  premium:     boolean;
}

export const MODULOS_REGISTRY: Record<ModuloId, ModuloInfo> = {
  cardapio_digital: {
    id: "cardapio_digital",
    nome: "Cardápio Digital",
    descricao: "Cardápio online com QR Code, pedidos via WhatsApp",
    categoria: "Atendimento",
    icone: "QrCode",
    premium: false,
  },
  delivery: {
    id: "delivery",
    nome: "Delivery",
    descricao: "Gestão de pedidos delivery com taxa e rastreamento",
    categoria: "Atendimento",
    icone: "Bike",
    premium: false,
  },
  balcao: {
    id: "balcao",
    nome: "Balcão",
    descricao: "Atendimento de balcão com PDV",
    categoria: "Atendimento",
    icone: "Store",
    premium: false,
  },
  mesa: {
    id: "mesa",
    nome: "Mesas",
    descricao: "Gestão de mesas, abertura e fechamento de conta",
    categoria: "Atendimento",
    icone: "UtensilsCrossed",
    premium: false,
  },
  comanda: {
    id: "comanda",
    nome: "Comandas",
    descricao: "Controle de comandas individuais por cliente",
    categoria: "Atendimento",
    icone: "ClipboardList",
    premium: false,
  },
  autoatendimento: {
    id: "autoatendimento",
    nome: "Autoatendimento",
    descricao: "Terminal de autoatendimento na mesa ou balcão",
    categoria: "Atendimento",
    icone: "Tablet",
    premium: true,
  },
  totem: {
    id: "totem",
    nome: "Totem",
    descricao: "Totem de autoatendimento físico",
    categoria: "Atendimento",
    icone: "Monitor",
    premium: true,
  },
  cozinha_kds: {
    id: "cozinha_kds",
    nome: "Cozinha / KDS",
    descricao: "Kitchen Display System com fila inteligente",
    categoria: "Produção",
    icone: "ChefHat",
    premium: false,
  },
  garcom: {
    id: "garcom",
    nome: "Garçom",
    descricao: "App PWA para garçons gerenciarem mesas e pedidos",
    categoria: "Operação",
    icone: "UserCheck",
    premium: false,
  },
  financeiro: {
    id: "financeiro",
    nome: "Financeiro",
    descricao: "Controle de caixa, fluxo de caixa e contas",
    categoria: "Gestão",
    icone: "DollarSign",
    premium: false,
  },
  estoque: {
    id: "estoque",
    nome: "Estoque",
    descricao: "Gestão de estoque com entradas e saídas",
    categoria: "Gestão",
    icone: "Package",
    premium: true,
  },
  compras: {
    id: "compras",
    nome: "Compras",
    descricao: "Gestão de pedidos de compra e fornecedores",
    categoria: "Gestão",
    icone: "ShoppingCart",
    premium: true,
  },
  fiscal: {
    id: "fiscal",
    nome: "Fiscal",
    descricao: "Emissão de NFC-e, NF-e e relatórios fiscais",
    categoria: "Fiscal",
    icone: "FileText",
    premium: true,
  },
  crm: {
    id: "crm",
    nome: "CRM",
    descricao: "Gestão de clientes, histórico e segmentação",
    categoria: "Marketing",
    icone: "Users",
    premium: false,
  },
  fidelidade: {
    id: "fidelidade",
    nome: "Fidelidade",
    descricao: "Programa de pontos e recompensas",
    categoria: "Marketing",
    icone: "Star",
    premium: true,
    dependencias: ["crm"],
  },
  cashback: {
    id: "cashback",
    nome: "Cashback",
    descricao: "Programa de cashback para clientes",
    categoria: "Marketing",
    icone: "RotateCcw",
    premium: true,
    dependencias: ["crm"],
  },
  cupom: {
    id: "cupom",
    nome: "Cupons",
    descricao: "Criação e gestão de cupons de desconto",
    categoria: "Marketing",
    icone: "Tag",
    premium: false,
  },
  marketing: {
    id: "marketing",
    nome: "Marketing",
    descricao: "Campanhas, push notifications e e-mail marketing",
    categoria: "Marketing",
    icone: "Megaphone",
    premium: true,
    dependencias: ["crm"],
  },
  whatsapp: {
    id: "whatsapp",
    nome: "WhatsApp",
    descricao: "Integração com WhatsApp para pedidos e notificações",
    categoria: "Comunicação",
    icone: "MessageCircle",
    premium: false,
  },
  multiunidade: {
    id: "multiunidade",
    nome: "Multiunidade",
    descricao: "Gestão de múltiplas unidades da mesma rede",
    categoria: "Gestão",
    icone: "Building2",
    premium: true,
  },
  assinaturas: {
    id: "assinaturas",
    nome: "Assinaturas",
    descricao: "Planos de assinatura recorrente para clientes",
    categoria: "Comercial",
    icone: "RefreshCw",
    premium: true,
    dependencias: ["crm"],
  },
  relatorios_basicos: {
    id: "relatorios_basicos",
    nome: "Relatórios Básicos",
    descricao: "Relatórios de vendas, produtos e caixa",
    categoria: "Relatórios",
    icone: "BarChart2",
    premium: false,
  },
  relatorios_avancados: {
    id: "relatorios_avancados",
    nome: "Relatórios Avançados",
    descricao: "Relatórios detalhados com filtros e exportação",
    categoria: "Relatórios",
    icone: "BarChart",
    premium: true,
    dependencias: ["relatorios_basicos"],
  },
  bi_dashboard: {
    id: "bi_dashboard",
    nome: "Dashboard BI",
    descricao: "Painel de Business Intelligence com gráficos em tempo real",
    categoria: "Relatórios",
    icone: "TrendingUp",
    premium: true,
    dependencias: ["relatorios_avancados"],
  },
  api_externa: {
    id: "api_externa",
    nome: "API Externa",
    descricao: "Acesso à API para integração com sistemas externos",
    categoria: "Integração",
    icone: "Code2",
    premium: true,
  },
  ifood: {
    id: "ifood",
    nome: "iFood",
    descricao: "Integração com iFood — pedidos, cardápio e status",
    categoria: "Integração",
    icone: "Zap",
    premium: true,
  },
  consumer: {
    id: "consumer",
    nome: "Consumer",
    descricao: "Integração com Consumer — pedidos e clientes",
    categoria: "Integração",
    icone: "Globe",
    premium: true,
  },
  erp: {
    id: "erp",
    nome: "ERP",
    descricao: "Integração bidirecional com sistemas ERP",
    categoria: "Integração",
    icone: "Link",
    premium: true,
  },
  contabil: {
    id: "contabil",
    nome: "Contabilidade",
    descricao: "Exportação contábil e integração com sistemas contábeis",
    categoria: "Integração",
    icone: "Calculator",
    premium: true,
  },
  impressoras: {
    id: "impressoras",
    nome: "Impressoras",
    descricao: "Gestão de impressoras térmicas por setor",
    categoria: "Hardware",
    icone: "Printer",
    premium: false,
  },
  tef: {
    id: "tef",
    nome: "TEF",
    descricao: "Transferência Eletrônica de Fundos com pinpad",
    categoria: "Pagamentos",
    icone: "CreditCard",
    premium: true,
  },
  pix: {
    id: "pix",
    nome: "PIX",
    descricao: "Recebimento via PIX com QR Code dinâmico",
    categoria: "Pagamentos",
    icone: "Zap",
    premium: false,
  },
  motoboy: {
    id: "motoboy",
    nome: "Motoboy",
    descricao: "Gestão de entregadores e atribuição de pedidos",
    categoria: "Delivery",
    icone: "Bike",
    premium: true,
    dependencias: ["delivery"],
  },
  rastreamento: {
    id: "rastreamento",
    nome: "Rastreamento",
    descricao: "Rastreamento em tempo real de entregas",
    categoria: "Delivery",
    icone: "MapPin",
    premium: true,
    dependencias: ["delivery", "motoboy"],
  },
  autoatendimento_qrcode: {
    id: "autoatendimento_qrcode",
    nome: "Cardápio QR Code",
    descricao: "Cardápio digital por QR Code por mesa",
    categoria: "Atendimento",
    icone: "QrCode",
    premium: false,
  },
  notificacoes: {
    id: "notificacoes",
    nome: "Notificações",
    descricao: "Central de notificações em tempo real",
    categoria: "Sistema",
    icone: "Bell",
    premium: false,
  },
  auditoria: {
    id: "auditoria",
    nome: "Auditoria",
    descricao: "Log completo de ações e alterações no sistema",
    categoria: "Sistema",
    icone: "Shield",
    premium: true,
  },
  backup: {
    id: "backup",
    nome: "Backup",
    descricao: "Backup automático de dados",
    categoria: "Sistema",
    icone: "Database",
    premium: true,
  },
  monitoramento: {
    id: "monitoramento",
    nome: "Monitoramento",
    descricao: "Monitoramento de performance e alertas",
    categoria: "Sistema",
    icone: "Activity",
    premium: true,
  },
};

export function getModuloInfo(id: ModuloId): ModuloInfo | null {
  return MODULOS_REGISTRY[id] ?? null;
}

export function getAllModulos(): ModuloInfo[] {
  return Object.values(MODULOS_REGISTRY);
}

export function getModulosByCategoria(): Record<string, ModuloInfo[]> {
  const result: Record<string, ModuloInfo[]> = {};

  for (const modulo of Object.values(MODULOS_REGISTRY)) {
    if (!result[modulo.categoria]) {
      result[modulo.categoria] = [];
    }
    result[modulo.categoria].push(modulo);
  }

  return result;
}
