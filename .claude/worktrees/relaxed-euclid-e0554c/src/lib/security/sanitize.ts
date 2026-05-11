// ─────────────────────────────────────────────
// Sanitização de entradas — proteção XSS, Injection, Path Traversal
// ─────────────────────────────────────────────

const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe[\s\S]*?>/gi,
  /<object[\s\S]*?>/gi,
  /<embed[\s\S]*?>/gi,
  /data:text\/html/gi,
  /vbscript:/gi,
];

const SQL_PATTERNS = [
  /(\b)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|DECLARE)\b/gi,
  /(-{2}|\/\*|\*\/|;)/g,
  /\b(xp_|sp_)\w+/gi,
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.%2[fF]/g,
  /%2[eE]%2[eE]/g,
];

export function sanitizeString(input: unknown): string {
  if (typeof input !== "string") return "";
  let str = input.trim();

  // Remove caracteres de controle (exceto tab e newline)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Remove padrões XSS
  for (const pattern of XSS_PATTERNS) {
    str = str.replace(pattern, "");
  }

  // Escapa HTML entities perigosas
  str = str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

  return str;
}

export function sanitizeHtml(input: unknown): string {
  if (typeof input !== "string") return "";
  let str = input.trim();

  // Remove apenas tags perigosas, mantém formatação básica
  str = str.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  str = str.replace(/<iframe[\s\S]*?>/gi, "");
  str = str.replace(/javascript:/gi, "");
  str = str.replace(/on\w+\s*=/gi, "data-removed=");

  return str;
}

export function detectSqlInjection(input: string): boolean {
  return SQL_PATTERNS.some((pattern) => pattern.test(input));
}

export function detectPathTraversal(input: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(input));
}

export function sanitizeFilename(filename: unknown): string {
  if (typeof filename !== "string") return "";

  return filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 255);
}

export function sanitizeSlug(input: unknown): string {
  if (typeof input !== "string") return "";

  return input
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export function sanitizePhone(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\D/g, "").slice(0, 15);
}

export function sanitizeCpfCnpj(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\D/g, "").slice(0, 18);
}

type AnyObject = Record<string, unknown>;

export function sanitizeObject<T extends AnyObject>(obj: T): T {
  const result = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      (result as AnyObject)[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      (result as AnyObject)[key] = value.map((v) =>
        typeof v === "string" ? sanitizeString(v) : v
      );
    } else if (value !== null && typeof value === "object") {
      (result as AnyObject)[key] = sanitizeObject(value as AnyObject);
    } else {
      (result as AnyObject)[key] = value;
    }
  }

  return result;
}

export function validateContentType(contentType: string | null, expected: string): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().includes(expected.toLowerCase());
}

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateUploadedFile(
  file: { type: string; size: number; name: string }
): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: "Tipo de arquivo não permitido" };
  }

  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return { valid: false, error: "Extensão de arquivo não permitida" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "Arquivo muito grande (máximo 10MB)" };
  }

  return { valid: true };
}
