/**
 * Testa templates default + substituição de variáveis do Evolution.
 */
import { describe, it, expect } from "vitest";
import { TEMPLATES_DEFAULT, EVENTOS_VALIDOS } from "@/lib/notify/evolution";

describe("EVENTOS_VALIDOS", () => {
  it("cobre os 5 eventos do painel /integracoes", () => {
    expect(EVENTOS_VALIDOS).toContain("novo_pedido");
    expect(EVENTOS_VALIDOS).toContain("confirmado");
    expect(EVENTOS_VALIDOS).toContain("pronto");
    expect(EVENTOS_VALIDOS).toContain("cancelado");
    expect(EVENTOS_VALIDOS).toContain("novo_cliente");
    expect(EVENTOS_VALIDOS).toHaveLength(5);
  });
});

describe("TEMPLATES_DEFAULT", () => {
  it("tem template para cada evento válido", () => {
    for (const ev of EVENTOS_VALIDOS) {
      expect(TEMPLATES_DEFAULT[ev]).toBeTruthy();
      expect(typeof TEMPLATES_DEFAULT[ev]).toBe("string");
    }
  });

  it("templates mencionam {empresa}", () => {
    for (const ev of EVENTOS_VALIDOS) {
      expect(TEMPLATES_DEFAULT[ev]).toContain("{empresa}");
    }
  });

  it("eventos de pedido mencionam {numero}", () => {
    expect(TEMPLATES_DEFAULT.novo_pedido).toContain("{numero}");
    expect(TEMPLATES_DEFAULT.confirmado).toContain("{numero}");
    expect(TEMPLATES_DEFAULT.pronto).toContain("{numero}");
    expect(TEMPLATES_DEFAULT.cancelado).toContain("{numero}");
  });
});
