import { describe, it, expect } from "vitest";
import { getModuloInfo, getAllModulos, getModulosByCategoria } from "@/lib/modules/registry";

describe("modules/registry — catálogo de módulos", () => {
  it("getAllModulos() retorna lista não-vazia", () => {
    expect(getAllModulos().length).toBeGreaterThan(0);
  });

  it("getModuloInfo() acha existente e null para inexistente", () => {
    const first = getAllModulos()[0];
    expect(getModuloInfo(first.id)).toEqual(first);
    expect(getModuloInfo("__inexistente__" as never)).toBeNull();
  });

  it("getModulosByCategoria() agrupa sem perder módulos", () => {
    const cats = getModulosByCategoria();
    const totalAgrupado = Object.values(cats).reduce((a, arr) => a + arr.length, 0);
    expect(totalAgrupado).toBe(getAllModulos().length);
  });
});
