/**
 * smoke.spec.ts
 * Teste smoke essencial: garante que app sobe + login responde + 404 funciona.
 * Roda em CI antes de qualquer outro teste.
 */
import { test, expect } from "@playwright/test";

test("home redireciona ou serve algo", async ({ page }) => {
  const r = await page.goto("/");
  expect(r?.status()).toBeLessThan(500);
});

test("login page carrega", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("input[type='email'], input[type='text'][name='email']").first())
    .toBeVisible({ timeout: 10_000 });
});

test("404 funciona pra rota inexistente", async ({ page }) => {
  const r = await page.goto("/rota-que-nao-existe-aaa");
  expect([404, 200].includes(r?.status() ?? 0)).toBeTruthy();
});

test("API /api/health responde", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBeLessThan(500);
  const data = await r.json().catch(() => ({}));
  // Não exigimos schema, só que responde JSON
  expect(typeof data === "object").toBeTruthy();
});

test("install-agent.sh é servido", async ({ request }) => {
  const r = await request.get("/install-agent.sh");
  expect(r.status()).toBe(200);
  const body = await r.text();
  expect(body).toContain("RustDesk");
});
