/**
 * Testes do gerador de API key + verificação de scope.
 * Não testa verifyApiKey() (exige DB) — só funções puras.
 */
import { describe, it, expect } from "vitest";
import { gerarApiKey, hasScope } from "@/lib/auth/api-key";
import crypto from "crypto";

describe("gerarApiKey", () => {
  it("gera key com prefix apk_ e 32+ chars", () => {
    const { fullKey, prefix, hash } = gerarApiKey();
    expect(fullKey).toMatch(/^apk_[A-Za-z0-9_-]+$/);
    expect(fullKey.length).toBeGreaterThan(32);
    expect(prefix).toBe(fullKey.slice(0, 12));
    expect(prefix).toMatch(/^apk_/);
  });

  it("hash é SHA-256 da fullKey", () => {
    const { fullKey, hash } = gerarApiKey();
    const expected = crypto.createHash("sha256").update(fullKey).digest("hex");
    expect(hash).toBe(expected);
    expect(hash).toHaveLength(64);
  });

  it("gera keys únicas em chamadas sucessivas", () => {
    const k1 = gerarApiKey();
    const k2 = gerarApiKey();
    expect(k1.fullKey).not.toBe(k2.fullKey);
    expect(k1.hash).not.toBe(k2.hash);
  });
});

describe("hasScope", () => {
  const ctx = (scopes: string[]) => ({ id: "x", empresaId: "y", nome: "z", scopes });

  it("admin tem todos os scopes", () => {
    expect(hasScope(ctx(["admin"]), "read")).toBe(true);
    expect(hasScope(ctx(["admin"]), "write")).toBe(true);
    expect(hasScope(ctx(["admin"]), "admin")).toBe(true);
  });

  it("write inclui read", () => {
    expect(hasScope(ctx(["write"]), "read")).toBe(true);
    expect(hasScope(ctx(["write"]), "write")).toBe(true);
    expect(hasScope(ctx(["write"]), "admin")).toBe(false);
  });

  it("read não inclui write", () => {
    expect(hasScope(ctx(["read"]), "read")).toBe(true);
    expect(hasScope(ctx(["read"]), "write")).toBe(false);
  });

  it("null é sempre falso", () => {
    expect(hasScope(null, "read")).toBe(false);
    expect(hasScope(null, "admin")).toBe(false);
  });

  it("scopes vazios = sem permissão", () => {
    expect(hasScope(ctx([]), "read")).toBe(false);
  });
});
