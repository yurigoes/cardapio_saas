import { describe, it, expect } from "vitest";
import {
  temPermissao, temRole, assertPermissao, assertRole, ROLE_HIERARCHY,
} from "@/lib/auth/rbac";

describe("auth/rbac — permissões e hierarquia de papéis", () => {
  it("master tem qualquer permissão", () => {
    expect(temPermissao("master", "gateway:configurar")).toBe(true);
    expect(temPermissao("master", "admin:tudo")).toBe(true);
  });

  it("admin pode configurar gateway, garçom não", () => {
    expect(temPermissao("admin", "gateway:configurar")).toBe(true);
    expect(temPermissao("garcom", "gateway:configurar")).toBe(false);
  });

  it("garçom pode criar pedido", () => {
    expect(temPermissao("garcom", "pedido:criar")).toBe(true);
  });

  it("temRole compara a hierarquia corretamente", () => {
    expect(temRole("admin", "gerente")).toBe(true);
    expect(temRole("garcom", "admin")).toBe(false);
    expect(temRole("master", "master")).toBe(true);
  });

  it("assertPermissao lança quando negado e passa quando ok", () => {
    expect(() => assertPermissao("garcom", "gateway:configurar")).toThrow();
    expect(() => assertPermissao("admin", "pedido:ver")).not.toThrow();
  });

  it("assertRole lança quando papel é insuficiente", () => {
    expect(() => assertRole("delivery", "admin")).toThrow();
    expect(() => assertRole("admin", "garcom")).not.toThrow();
  });

  it("hierarquia: master > admin > gerente", () => {
    expect(ROLE_HIERARCHY.master).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.gerente);
  });
});
