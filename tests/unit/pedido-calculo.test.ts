import { describe, it, expect } from "vitest";
import { calcularSubtotal, calcularTotal } from "@/lib/pedidos/calculo";

describe("pedidos/calculo — totais do pedido", () => {
  it("subtotal soma preço × quantidade", () => {
    expect(calcularSubtotal([
      { preco_unitario: 50, quantidade: 2 },
      { preco_unitario: 30, quantidade: 1 },
    ])).toBe(130);
  });

  it("subtotal de lista vazia é 0", () => {
    expect(calcularSubtotal([])).toBe(0);
  });

  it("total = subtotal + taxa de entrega − desconto", () => {
    expect(calcularTotal(130, 10, 5)).toBe(135);
  });

  it("total nunca fica negativo (desconto maior que tudo)", () => {
    expect(calcularTotal(10, 0, 50)).toBe(0);
  });

  it("total sem taxa/desconto = subtotal", () => {
    expect(calcularTotal(100)).toBe(100);
  });
});
