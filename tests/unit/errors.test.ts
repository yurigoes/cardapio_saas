import { describe, it, expect } from "vitest";
import {
  AppError, AuthError, ForbiddenError, NotFoundError, ValidationError,
  ConflictError, RateLimitError, ModuleDisabledError,
  isAppError, isDatabaseError, isDuplicateKeyError, isForeignKeyError,
} from "@/lib/utils/errors";

describe("utils/errors — classes e type guards", () => {
  it("AppError usa defaults (APP_ERROR / 400)", () => {
    const e = new AppError("x");
    expect(e.code).toBe("APP_ERROR");
    expect(e.status).toBe(400);
    expect(e.message).toBe("x");
  });

  it("AuthError → 401/UNAUTHORIZED", () => {
    const e = new AuthError();
    expect(e.status).toBe(401);
    expect(e.code).toBe("UNAUTHORIZED");
  });

  it("ForbiddenError → 403", () => {
    expect(new ForbiddenError().status).toBe(403);
  });

  it("NotFoundError interpola o recurso", () => {
    const e = new NotFoundError("Produto");
    expect(e.message).toBe("Produto não encontrado");
    expect(e.status).toBe(404);
  });

  it("ValidationError → 422 e guarda details", () => {
    const e = new ValidationError("inv", { f: 1 });
    expect(e.status).toBe(422);
    expect(e.details).toEqual({ f: 1 });
  });

  it("ConflictError → 409", () => {
    expect(new ConflictError("dup").status).toBe(409);
  });

  it("RateLimitError → 429", () => {
    expect(new RateLimitError().status).toBe(429);
  });

  it("ModuleDisabledError cita o módulo", () => {
    expect(new ModuleDisabledError("pix").message).toContain("pix");
  });

  it("isAppError discrimina AppError de Error comum", () => {
    expect(isAppError(new AppError("x"))).toBe(true);
    expect(isAppError(new Error("y"))).toBe(false);
  });

  it("isDatabaseError exige Error com code", () => {
    expect(isDatabaseError(Object.assign(new Error("x"), { code: "23505" }))).toBe(true);
    expect(isDatabaseError(new Error("x"))).toBe(false);
  });

  it("isDuplicateKeyError reconhece 23505", () => {
    expect(isDuplicateKeyError(Object.assign(new Error(), { code: "23505" }))).toBe(true);
    expect(isDuplicateKeyError(Object.assign(new Error(), { code: "23503" }))).toBe(false);
  });

  it("isForeignKeyError reconhece 23503", () => {
    expect(isForeignKeyError(Object.assign(new Error(), { code: "23503" }))).toBe(true);
    expect(isForeignKeyError(Object.assign(new Error(), { code: "23505" }))).toBe(false);
  });
});
