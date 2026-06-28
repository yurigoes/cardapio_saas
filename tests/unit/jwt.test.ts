import { describe, it, expect, beforeAll } from "vitest";
import { extractBearerToken, signAccessToken, verifyAccessToken } from "@/lib/auth/jwt";

describe("auth/jwt — tokens", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "segredo-de-teste-com-32-bytes-okok";
  });

  it("extractBearerToken extrai o token do header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("extractBearerToken retorna null sem 'Bearer'", () => {
    expect(extractBearerToken("Basic xyz")).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("Bearer    ")).toBeNull();
  });

  it("sign + verify (roundtrip) preserva o payload", async () => {
    const token = await signAccessToken({
      sub: "u1", email: "a@b.com", role: "admin", nome: "A", sessionId: "s1",
    });
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("u1");
    expect(payload.role).toBe("admin");
    expect(payload.sessionId).toBe("s1");
  });

  it("verifyAccessToken rejeita token adulterado", async () => {
    await expect(verifyAccessToken("nao.eh.valido")).rejects.toBeTruthy();
  });
});
