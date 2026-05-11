import { JWTRole } from "./jwt";

// ─────────────────────────────────────────────
// Hierarquia de papéis
// ─────────────────────────────────────────────
export const ROLE_HIERARCHY: Record<JWTRole, number> = {
  master:     100,
  admin:       90,
  gerente:     80,
  financeiro:  70,
  garcom:      50,
  cozinha:     50,
  atendente:   50,
  delivery:    40,
  motoboy:     30,
  cliente:     10,
};

// ─────────────────────────────────────────────
// Permissões por recurso/ação
// ─────────────────────────────────────────────
export type Permissao =
  // Empresas
  | "empresa:ver"       | "empresa:editar"     | "empresa:criar"      | "empresa:deletar"
  // Usuários
  | "usuario:ver"       | "usuario:criar"      | "usuario:editar"     | "usuario:deletar"
  // Cardápio
  | "cardapio:ver"      | "cardapio:editar"    | "cardapio:criar"     | "cardapio:deletar"
  // Pedidos
  | "pedido:ver"        | "pedido:criar"       | "pedido:editar"      | "pedido:cancelar"
  | "pedido:imprimir"
  // Mesas
  | "mesa:ver"          | "mesa:editar"        | "mesa:abrir"         | "mesa:fechar"
  // Cozinha
  | "cozinha:ver"       | "cozinha:atualizar"
  // Financeiro
  | "financeiro:ver"    | "financeiro:editar"  | "caixa:abrir"        | "caixa:fechar"
  | "relatorio:ver"
  // Delivery
  | "delivery:ver"      | "delivery:atribuir"  | "motoboy:gerenciar"
  // Estoque
  | "estoque:ver"       | "estoque:editar"
  // Gateways
  | "gateway:ver"       | "gateway:configurar"
  // Admin
  | "admin:tudo";

export const PERMISSOES_POR_ROLE: Record<JWTRole, Permissao[]> = {
  master: ["admin:tudo"],

  admin: [
    "empresa:ver", "empresa:editar",
    "usuario:ver", "usuario:criar", "usuario:editar", "usuario:deletar",
    "cardapio:ver", "cardapio:editar", "cardapio:criar", "cardapio:deletar",
    "pedido:ver", "pedido:criar", "pedido:editar", "pedido:cancelar", "pedido:imprimir",
    "mesa:ver", "mesa:editar", "mesa:abrir", "mesa:fechar",
    "cozinha:ver", "cozinha:atualizar",
    "financeiro:ver", "financeiro:editar", "caixa:abrir", "caixa:fechar", "relatorio:ver",
    "delivery:ver", "delivery:atribuir", "motoboy:gerenciar",
    "estoque:ver", "estoque:editar",
    "gateway:ver", "gateway:configurar",
  ],

  gerente: [
    "empresa:ver",
    "usuario:ver", "usuario:criar", "usuario:editar",
    "cardapio:ver", "cardapio:editar", "cardapio:criar",
    "pedido:ver", "pedido:criar", "pedido:editar", "pedido:cancelar", "pedido:imprimir",
    "mesa:ver", "mesa:editar", "mesa:abrir", "mesa:fechar",
    "cozinha:ver", "cozinha:atualizar",
    "financeiro:ver", "caixa:abrir", "caixa:fechar", "relatorio:ver",
    "delivery:ver", "delivery:atribuir",
    "estoque:ver",
    "gateway:ver",
  ],

  financeiro: [
    "pedido:ver",
    "financeiro:ver", "financeiro:editar", "caixa:abrir", "caixa:fechar", "relatorio:ver",
    "gateway:ver",
  ],

  garcom: [
    "cardapio:ver",
    "pedido:ver", "pedido:criar", "pedido:editar", "pedido:imprimir",
    "mesa:ver", "mesa:abrir", "mesa:fechar",
  ],

  cozinha: [
    "pedido:ver", "pedido:imprimir",
    "cozinha:ver", "cozinha:atualizar",
  ],

  atendente: [
    "cardapio:ver",
    "pedido:ver", "pedido:criar", "pedido:editar", "pedido:imprimir",
    "mesa:ver",
  ],

  delivery: [
    "pedido:ver", "delivery:ver",
  ],

  motoboy: [
    "pedido:ver", "delivery:ver",
  ],

  cliente: [
    "cardapio:ver", "pedido:ver", "pedido:criar",
  ],
};

export function temPermissao(role: JWTRole, permissao: Permissao): boolean {
  if (role === "master") return true;
  return (PERMISSOES_POR_ROLE[role] as string[]).includes(permissao);
}

export function temRole(userRole: JWTRole, minRole: JWTRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

export function assertPermissao(role: JWTRole, permissao: Permissao): void {
  if (!temPermissao(role, permissao)) {
    throw new Error(`Acesso negado: permissão '${permissao}' necessária`);
  }
}

export function assertRole(userRole: JWTRole, minRole: JWTRole): void {
  if (!temRole(userRole, minRole)) {
    throw new Error(`Acesso negado: papel mínimo '${minRole}' necessário`);
  }
}
