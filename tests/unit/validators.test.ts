import { describe, it, expect } from "vitest";
import {
  telefoneSchema, precoSchema, paginacaoSchema, pedidoItemSchema,
} from "@/lib/utils/validators";

describe("telefoneSchema", () => {
  it("aceita formatado e strip não-dígitos", () => {
    expect(telefoneSchema.parse("(11) 99999-9999")).toBe("11999999999");        // 11 dígitos
    expect(telefoneSchema.parse("+55 11 99999-9999")).toBe("5511999999999");    // 13 dígitos
  });
  it("aceita só dígitos", () => {
    expect(telefoneSchema.parse("11999999999")).toBe("11999999999");
  });
  it("rejeita curto demais", () => {
    expect(() => telefoneSchema.parse("123")).toThrow();
  });
});

describe("precoSchema", () => {
  it("aceita number", () => {
    expect(precoSchema.parse(10.5)).toBe(10.5);
  });
  it("aceita string numérica (pg NUMERIC vem como string)", () => {
    expect(precoSchema.parse("10.50")).toBe(10.5);
  });
  it("rejeita negativo", () => {
    expect(() => precoSchema.parse(-1)).toThrow();
  });
  it("rejeita acima do limite", () => {
    expect(() => precoSchema.parse(100000)).toThrow();
  });
});

describe("paginacaoSchema", () => {
  it("default page=1 limit=20", () => {
    const r = paginacaoSchema.parse({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
  });
  it("aceita strings (query params vêm como string)", () => {
    const r = paginacaoSchema.parse({ page: "3", limit: "50" });
    expect(r.page).toBe(3);
    expect(r.limit).toBe(50);
  });
  it("limita limit em 500", () => {
    expect(() => paginacaoSchema.parse({ limit: "1000" })).toThrow();
  });
});

describe("pedidoItemSchema", () => {
  it("valida item completo", () => {
    const r = pedidoItemSchema.parse({
      nome: "X-Burger",
      preco_unitario: 25.9,
      quantidade: 2,
    });
    expect(r.quantidade).toBe(2);
    expect(r.adicionais).toEqual([]);
  });
  it("aceita até 999 unidades", () => {
    const r = pedidoItemSchema.parse({ nome: "X", preco_unitario: 1, quantidade: 999 });
    expect(r.quantidade).toBe(999);
  });
  it("rejeita quantidade > 999", () => {
    expect(() => pedidoItemSchema.parse({ nome: "X", preco_unitario: 1, quantidade: 1000 })).toThrow();
  });
});
