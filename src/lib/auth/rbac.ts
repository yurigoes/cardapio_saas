import { JWTRole } from "./jwt";
import { query } from "@/lib/db/client";

// ─────────────────────────────────────────────
// Hierarquia de papéis
// ─────────────────────────────────────────────
export const ROLE_HIERARCHY: Record<JWTRole, number> = {
  master:      100,
  suporte:      95,    // entre master e admin: cross-tenant pra suporte
  admin:        90,
  gerente:      80,
  financeiro:   70,
  garcom:       50,
  cozinha:      50,
  atendente:    50,
  delivery:     40,
  motoboy:      30,
  cliente:      10,
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

  // Suporte: cross-tenant pra atender chamados, mas sem editar empresas
  // (não muda configuração, só ajuda a entender o que o cliente vê)
  suporte: [
    "empresa:ver",
    "usuario:ver",
    "cardapio:ver",
    "pedido:ver",
    "mesa:ver",
    "cozinha:ver",
    "financeiro:ver", "relatorio:ver",
    "delivery:ver",
    "estoque:ver",
    "gateway:ver",
  ],

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
    // Pode ver e fechar pedidos atribuídos a ele (check adicional no handler:
    // motoboy_id = sub do JWT)
    "pedido:ver", "pedido:editar", "pedido:imprimir",
    "delivery:ver",
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

// ─────────────────────────────────────────────
// Permissões dinâmicas (overrides via banco)
// ─────────────────────────────────────────────

interface OverrideRow { permissao: string; acao: "allow" | "deny"; }

/**
 * Verifica permissão consultando overrides em tempo real.
 * Ordem de precedência:
 *   1. Override por usuário (deny ou allow)
 *   2. Override por role (deny ou allow)
 *   3. PERMISSOES_POR_ROLE estático
 *   4. Master sempre tem tudo (a não ser que override deny específico)
 *
 * Cache em memória 30s pra evitar query a cada call.
 */
const _cache = new Map<string, { exp: number; perms: Map<string, "allow" | "deny"> }>();
const CACHE_MS = 30_000;

async function loadOverrides(escopo: "role" | "user", id: string): Promise<Map<string, "allow" | "deny">> {
  const key = `${escopo}:${id}`;
  const hit = _cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.perms;
  const rows = await query<OverrideRow>(
    `SELECT permissao, acao FROM permissoes_overrides WHERE escopo = $1 AND escopo_id = $2`,
    [escopo, id]
  ).catch(() => []);
  const map = new Map<string, "allow" | "deny">();
  for (const r of rows) map.set(r.permissao, r.acao);
  _cache.set(key, { exp: Date.now() + CACHE_MS, perms: map });
  return map;
}

export function invalidarPermissoesCache(escopo?: "role" | "user", id?: string): void {
  if (escopo && id) _cache.delete(`${escopo}:${id}`);
  else _cache.clear();
}

export async function temPermissaoDinamica(
  usuarioId: string,
  role: JWTRole,
  permissao: string
): Promise<boolean> {
  // 1. Override por usuário tem prioridade absoluta
  const userOv = await loadOverrides("user", usuarioId);
  if (userOv.has(permissao)) return userOv.get(permissao) === "allow";
  // 2. Override por role
  const roleOv = await loadOverrides("role", role);
  if (roleOv.has(permissao)) return roleOv.get(permissao) === "allow";
  // 3. Default estático
  if (role === "master") return true;
  return (PERMISSOES_POR_ROLE[role] as string[]).includes(permissao);
}
