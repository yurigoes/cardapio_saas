/**
 * Lista canônica de módulos do sistema (catálogo SaaS).
 *
 * Movido de `src/app/api/painel/modulos/route.ts` porque Next 14 não permite
 * exports arbitrários em route handlers — só GET/POST/PATCH/etc.
 */
export const MODULOS = [
  { key: "balcao",             nome: "PDV / Balcão",          preco: 49.90 },
  { key: "mesa",               nome: "Gestão de Mesas",       preco: 39.90 },
  { key: "delivery",           nome: "Delivery",              preco: 59.90 },
  { key: "cozinha_kds",        nome: "Cozinha (KDS)",         preco: 29.90 },
  { key: "totem",              nome: "Totem Autoatendimento", preco: 79.90 },
  { key: "financeiro",         nome: "Financeiro / Caixa",    preco: 49.90 },
  { key: "estoque",            nome: "Controle de Estoque",   preco: 39.90 },
  { key: "cupom",              nome: "Cupons",                preco: 19.90 },
  { key: "crm",                nome: "CRM / Clientes",        preco: 29.90 },
  { key: "relatorios_basicos", nome: "Relatórios",            preco: 19.90 },
  { key: "ifood",              nome: "Integração iFood",      preco: 99.90 },
];
