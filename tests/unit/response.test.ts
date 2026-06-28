import { describe, it, expect } from "vitest";
import {
  ok, created, noContent, badRequest, unauthorized, forbidden,
  notFound, conflict, unprocessable, serverError, paginatedOk,
} from "@/lib/utils/response";

describe("utils/response — envelopes de resposta HTTP", () => {
  it("ok() retorna 200 com { success:true, data }", async () => {
    const res = ok({ id: "1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { id: "1" }, meta: undefined });
  });

  it("created() retorna 201", async () => {
    const res = created({ x: 1 });
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ x: 1 });
  });

  it("noContent() retorna 204", () => {
    expect(noContent().status).toBe(204);
  });

  it("badRequest() retorna 400 com erro e code", async () => {
    const res = badRequest("faltou", "MISS");
    expect(res.status).toBe(400);
    const b = await res.json();
    expect(b).toMatchObject({ success: false, error: "faltou", code: "MISS" });
  });

  it("unauthorized() default 401/UNAUTHORIZED", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("forbidden() retorna 403", () => {
    expect(forbidden().status).toBe(403);
  });

  it("notFound() retorna 404/NOT_FOUND", async () => {
    const res = notFound();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("conflict() retorna 409", () => {
    expect(conflict("dup").status).toBe(409);
  });

  it("unprocessable() retorna 422 com details", async () => {
    const res = unprocessable("inv", { f: "email" });
    expect(res.status).toBe(422);
    const b = await res.json();
    expect(b.code).toBe("VALIDATION_ERROR");
    expect(b.meta.details).toEqual({ f: "email" });
  });

  it("serverError() retorna 500/INTERNAL_ERROR", async () => {
    const res = serverError();
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });

  it("paginatedOk() calcula a paginação (página do meio)", async () => {
    const b = await paginatedOk([{ id: 1 }], 100, 2, 20).json();
    expect(b.meta.pagination).toEqual({
      total: 100, page: 2, limit: 20, pages: 5, hasNext: true, hasPrev: true,
    });
  });

  it("paginatedOk() última página: hasNext=false", async () => {
    const b = await paginatedOk([], 100, 5, 20).json();
    expect(b.meta.pagination.hasNext).toBe(false);
    expect(b.meta.pagination.hasPrev).toBe(true);
  });
});
