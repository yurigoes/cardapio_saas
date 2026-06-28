import { describe, it, expect } from "vitest";
import { isGatewaySupported, GATEWAYS_INFO } from "@/lib/gateways/registry";

describe("gateways/registry — gateways de pagamento", () => {
  it("GATEWAYS_INFO não está vazio", () => {
    expect(GATEWAYS_INFO.length).toBeGreaterThan(0);
  });

  it("isGatewaySupported reconhece gateways implementados", () => {
    expect(isGatewaySupported("stone")).toBe(true);
    expect(isGatewaySupported("pix_bancario")).toBe(true);
  });

  it("isGatewaySupported rejeita gateway inexistente", () => {
    expect(isGatewaySupported("banco_inexistente_xyz")).toBe(false);
  });
});
