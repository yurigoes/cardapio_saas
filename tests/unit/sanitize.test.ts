import { describe, it, expect } from "vitest";
import {
  sanitizeString, sanitizeHtml, detectSqlInjection, detectPathTraversal,
  sanitizeFilename, sanitizeSlug, sanitizePhone, sanitizeCpfCnpj,
  sanitizeObject, validateContentType, validateUploadedFile,
} from "@/lib/security/sanitize";

describe("security/sanitize — proteção de entradas", () => {
  it("sanitizeString remove <script> e escapa < >", () => {
    const out = sanitizeString("<script>alert('x')</script>ola");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<");
  });

  it("sanitizeString devolve '' para não-string", () => {
    expect(sanitizeString(123)).toBe("");
    expect(sanitizeString(null)).toBe("");
  });

  it("sanitizeHtml mantém <p> e remove <script>", () => {
    const out = sanitizeHtml("<p>ok</p><script>bad</script>");
    expect(out).toContain("<p>ok</p>");
    expect(out).not.toContain("<script>");
  });

  it("detectSqlInjection detecta comandos SQL", () => {
    expect(detectSqlInjection("texto normal sem nada")).toBe(false);
    expect(detectSqlInjection("SELECT * FROM users")).toBe(true);
  });

  it("detectPathTraversal detecta ../", () => {
    expect(detectPathTraversal("arquivo.txt")).toBe(false);
    expect(detectPathTraversal("../../etc/passwd")).toBe(true);
  });

  it("sanitizeFilename troca caracteres especiais por _", () => {
    expect(sanitizeFilename("a b@c.txt")).toBe("a_b_c.txt");
  });

  it("sanitizeSlug remove acentos e normaliza", () => {
    expect(sanitizeSlug("Café da Casa")).toBe("cafe-da-casa");
  });

  it("sanitizePhone mantém só dígitos (máx 15)", () => {
    expect(sanitizePhone("(11) 98765-4321")).toBe("11987654321");
  });

  it("sanitizeCpfCnpj mantém só dígitos", () => {
    expect(sanitizeCpfCnpj("123.456.789-00")).toBe("12345678900");
  });

  it("sanitizeObject sanitiza recursivamente", () => {
    const out = sanitizeObject({ a: "<b>x</b>", nested: { c: "<i>y</i>" } });
    expect(out.a).not.toContain("<");
    expect((out.nested as { c: string }).c).not.toContain("<");
  });

  it("validateContentType faz match case-insensitive", () => {
    expect(validateContentType("image/jpeg; charset=utf-8", "image")).toBe(true);
    expect(validateContentType(null, "image")).toBe(false);
  });

  it("validateUploadedFile aceita imagem válida", () => {
    expect(validateUploadedFile({ type: "image/jpeg", size: 1000, name: "p.jpg" }).valid).toBe(true);
  });

  it("validateUploadedFile rejeita tipo e tamanho inválidos", () => {
    expect(validateUploadedFile({ type: "text/plain", size: 10, name: "a.txt" }).valid).toBe(false);
    expect(validateUploadedFile({ type: "image/jpeg", size: 99 * 1024 * 1024, name: "a.jpg" }).valid).toBe(false);
  });
});
