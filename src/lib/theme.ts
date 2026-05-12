/**
 * Helper para aplicar a cor primária da empresa como CSS variables.
 * Usado pelos layouts (empresa)/painel, /totem/[slug] e /cliente/[slug].
 *
 * Define:
 *   --color-primary       (hex completo, ex: #10b981)
 *   --color-primary-rgb   (3 ints, ex: "16 185 129") — usado pelo Tailwind brand color
 *   --color-primary-15    (#10b981 + "26" = 15% opacity hex)
 *   --color-primary-50    (#10b981 + "80" = 50% opacity hex)
 *   --color-secondary     (hex)
 */

function hexToRgbTriple(hex: string): string | null {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** Aplica as variáveis CSS no <html>. Chame dentro de useEffect ou onMount. */
export function applyBrandColors(opts: {
  primary?:   string | null;
  secondary?: string | null;
}) {
  if (typeof document === "undefined") return;
  const root      = document.documentElement;
  const primary   = (opts.primary   || "#10b981").trim();
  const secondary = (opts.secondary || "#1e293b").trim();

  root.style.setProperty("--color-primary",   primary);
  root.style.setProperty("--color-secondary", secondary);

  const rgbTriple = hexToRgbTriple(primary);
  if (rgbTriple) {
    root.style.setProperty("--color-primary-rgb", rgbTriple);
  }

  // Variantes hex (compat: usadas em estilos inline antigos)
  if (/^#[0-9a-f]{6}$/i.test(primary)) {
    root.style.setProperty("--color-primary-15", primary + "26"); // 15% alpha
    root.style.setProperty("--color-primary-50", primary + "80"); // 50% alpha
  }
}
