import { describe, it, expect } from "vitest";
import { calcularTrial } from "@/lib/billing/trial";

describe("calcularTrial", () => {
  const futuro  = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const passado = new Date(Date.now() - 1 * 86_400_000).toISOString();

  it("status='ativo' nunca tem trial ativo (já é pagante)", () => {
    const r = calcularTrial({ status: "ativo", trial_inicio: null, trial_fim: futuro });
    expect(r.ativo).toBe(false);
    expect(r.expirado).toBe(false);
  });

  it("status='teste' com trial_fim futuro → ativo", () => {
    const r = calcularTrial({ status: "teste", trial_inicio: null, trial_fim: futuro });
    expect(r.ativo).toBe(true);
    expect(r.expirado).toBe(false);
    expect(r.diasRestantes).toBeGreaterThan(0);
    expect(r.diasRestantes).toBeLessThanOrEqual(5);
  });

  it("status='teste' com trial_fim no passado → expirado", () => {
    const r = calcularTrial({ status: "teste", trial_inicio: null, trial_fim: passado });
    expect(r.ativo).toBe(false);
    expect(r.expirado).toBe(true);
    expect(r.diasRestantes).toBe(0);
  });

  it("status='suspensa' nunca está em trial", () => {
    const r = calcularTrial({ status: "suspensa", trial_inicio: null, trial_fim: futuro });
    expect(r.ativo).toBe(false);
  });

  it("status='teste' sem trial_fim → não ativo", () => {
    const r = calcularTrial({ status: "teste", trial_inicio: null, trial_fim: null });
    expect(r.ativo).toBe(false);
    expect(r.expirado).toBe(false);
    expect(r.diasRestantes).toBe(0);
  });
});
