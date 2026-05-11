"use client";

import { AdminUser } from "./adminModules";

const STORAGE_KEY = "yugo_admin_auth";

export type AdminAuthSession = {
  user: AdminUser;
  token?: string;
  loggedAt: string;
};

export function saveAdminSession(session: AdminAuthSession) {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getAdminSession(): AdminAuthSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed?.user) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(STORAGE_KEY);
}

export function getAdminUser(): AdminUser | null {
  return getAdminSession()?.user || null;
}

export function normalizeEmpresaId(value: any) {
  if (Array.isArray(value)) {
    return value[0]?.Id || value[0]?.id || value[0];
  }

  if (typeof value === "object" && value !== null) {
    return value.Id || value.id;
  }

  return value;
}

export function userCanAccessEmpresa(
  user: AdminUser | null | undefined,
  empresaId: string | number
) {
  if (!user) return false;

  if (String(user.role || "") === "ADM") return true;

  const userEmpresaId = normalizeEmpresaId(user.empresa_id);

  return Number(userEmpresaId) === Number(empresaId);
}

/**
 * Compatibilidade com arquivos antigos do admin.
 * Algumas telas antigas importam loginAdmin/logoutAdmin.
 */
export function logoutAdmin() {
  clearAdminSession();
}

export function getAdminAuth() {
  return getAdminSession();
}

export function setAdminAuth(session: AdminAuthSession) {
  saveAdminSession(session);
}

export function isAdminLoggedIn() {
  return !!getAdminSession()?.user;
}
