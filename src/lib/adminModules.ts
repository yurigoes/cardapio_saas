"use client";

export type AdminModuleId =
  | "dashboard"
  | "pedidos"
  | "produtos"
  | "cozinha"
  | "ranking"
  | "cupons"
  | "personalizacao"
  | "usuarios"
  | "categorias"
  | "videos"
  | "config";

export type AdminUser = {
  Id?: number;
  nome?: string;
  email?: string;
  role?: string;
  empresa_id?: number | string;
  modulos_acesso?: string[] | string | null;
  modulos_acesso_json?: string[] | string | null;
};

export const ADMIN_MODULES: Array<{
  id: AdminModuleId;
  label: string;
  description: string;
  requiresLogin: boolean;
  adminOnly?: boolean;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Visão geral da empresa, vendas, status e indicadores.",
    requiresLogin: true,
  },
  {
    id: "pedidos",
    label: "Pedidos",
    description: "Gestão completa de pedidos, histórico, impressão e status.",
    requiresLogin: true,
  },
  {
    id: "produtos",
    label: "Produtos",
    description: "Cadastro e edição de produtos do cardápio.",
    requiresLogin: true,
  },
  {
    id: "cozinha",
    label: "Cozinha (KDS)",
    description: "Painel operacional da cozinha.",
    requiresLogin: true,
  },
  {
    id: "ranking",
    label: "Ranking (Fidelidade)",
    description: "Ranking e acompanhamento de clientes por pontuação.",
    requiresLogin: true,
  },
  {
    id: "cupons",
    label: "Cupons e Fidelidade",
    description: "Regras promocionais, cupons e fidelidade.",
    requiresLogin: true,
  },
  {
    id: "personalizacao",
    label: "Personalização",
    description: "Cores, logo, vídeos, identidade visual e experiência.",
    requiresLogin: true,
  },
  {
    id: "usuarios",
    label: "Contas Admin",
    description: "Cadastro de usuários e permissões por módulo.",
    requiresLogin: true,
    adminOnly: true,
  },
  {
    id: "categorias",
    label: "Categorias",
    description: "Gestão de categorias do cardápio.",
    requiresLogin: true,
  },
  {
    id: "videos",
    label: "Vídeos",
    description: "Vídeos do totem, caixa e painel.",
    requiresLogin: true,
  },
  {
    id: "config",
    label: "Configurações",
    description: "Configurações gerais, integrações e módulos.",
    requiresLogin: true,
    adminOnly: true,
  },
];

export function parseUserModules(user?: AdminUser | null): string[] {
  if (!user) return [];

  if (["ADM", "Admin"].includes(String(user.role || ""))) {
    const raw = user.modulos_acesso_json ?? user.modulos_acesso;

    if (!raw) {
      return ADMIN_MODULES.map((module) => module.id);
    }

    if (Array.isArray(raw)) {
      return raw.map(String);
    }

    try {
      const parsed = JSON.parse(String(raw));

      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {}

    return String(raw)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const raw = user.modulos_acesso_json ?? user.modulos_acesso;

  if (Array.isArray(raw)) return raw.map(String);

  if (raw) {
    try {
      const parsed = JSON.parse(String(raw));

      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {}

    return String(raw)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function canAccessModule(user: AdminUser | null | undefined, moduleId: string) {
  if (!user) return false;

  if (String(user.role || "") === "ADM") return true;

  const module = ADMIN_MODULES.find((item) => item.id === moduleId);

  if (!module) return false;

  if (module.adminOnly && String(user.role || "") !== "Admin") {
    return false;
  }

  const allowed = parseUserModules(user);

  return allowed.includes(moduleId);
}

export function firstAllowedModule(user: AdminUser | null | undefined) {
  if (!user) return "dashboard";

  const allowed = ADMIN_MODULES.find((module) => canAccessModule(user, module.id));

  return allowed?.id || "dashboard";
}
