import { describe, it, expect } from "vitest";
import { rateLimitHeaders } from "@/lib/security/rate-limit";

describe("security/rate-limit — headers HTTP", () => {
  it("sucesso → Retry-After 0 e headers corretos", () => {
    const h = rateLimitHeaders({ success: true, remaining: 50, resetAt: 60000, total: 100 });
    expect(h["X-RateLimit-Limit"]).toBe("100");
    expect(h["X-RateLimit-Remaining"]).toBe("50");
    expect(h["X-RateLimit-Reset"]).toBe("60"); // ceil(60000/1000)
    expect(h["Retry-After"]).toBe("0");
  });

  it("bloqueado → Retry-After maior que 0", () => {
    const h = rateLimitHeaders({
      success: false, remaining: 0, resetAt: Date.now() + 30000, total: 100,
    });
    expect(Number(h["Retry-After"])).toBeGreaterThan(0);
  });
});
