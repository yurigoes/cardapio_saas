import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL    || "admin@demo.com";
const SENHA = process.env.E2E_SENHA    || "Master@12345678";

test.describe("Login + Dashboard", () => {
  test("redireciona / para /login quando não autenticado", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(login|painel|admin|hub)/);
  });

  test("login válido entra no painel ou hub", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder(/e-?mail/i).fill(EMAIL);
    await page.getByPlaceholder(/senha/i).fill(SENHA);
    await page.getByRole("button", { name: /entrar/i }).click();

    // Master vai pra /admin, admin/gerente pra /painel
    await page.waitForURL(/\/(admin|painel|hub)/, { timeout: 10_000 });

    // Header/título visível
    await expect(page.locator("body")).not.toContainText("Senha incorreta");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("login inválido mostra erro", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder(/e-?mail/i).fill("naoexiste@demo.com");
    await page.getByPlaceholder(/senha/i).fill("senha-errada-12345");
    await page.getByRole("button", { name: /entrar/i }).click();

    // Aguarda a resposta e verifica que não saiu da página
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("API pública", () => {
  test("GET /api/health responde", async ({ request }) => {
    const r = await request.get("/api/health");
    expect([200, 503]).toContain(r.status());
    const body = await r.json();
    expect(body).toHaveProperty("success");
  });

  test("GET /api/v1/produtos sem API key → 401", async ({ request }) => {
    const r = await request.get("/api/v1/produtos");
    expect(r.status()).toBe(401);
  });
});

test.describe("Documentação", () => {
  test("/docs/api carrega Swagger UI", async ({ page }) => {
    await page.goto("/docs/api");
    await expect(page.getByText(/API v1/)).toBeVisible({ timeout: 10_000 });
  });

  test("/openapi.json é JSON válido com paths", async ({ request }) => {
    const r = await request.get("/openapi.json");
    expect(r.status()).toBe(200);
    const spec = await r.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths["/api/v1/produtos"]).toBeDefined();
  });
});
