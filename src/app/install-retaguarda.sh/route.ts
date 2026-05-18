/**
 * GET /install-retaguarda.sh
 *
 * Serve o auto-instalador da retaguarda direto do master, pra que o
 * operador rode:
 *   curl -fsSL https://app.tthreedigital.com.br/install-retaguarda.sh | sudo bash
 *
 * Sem precisar lembrar URL do GitHub. Lê o arquivo de
 * retaguarda/install.sh do disco (incluído no build via Dockerfile).
 *
 * Fallback: se arquivo não existir (dev local, etc), redireciona
 * pro GitHub raw.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GITHUB_FALLBACK =
  "https://raw.githubusercontent.com/yurigoes/cardapio_saas/main/retaguarda/install.sh";

export async function GET() {
  // Procura em locais possíveis (build standalone vs dev)
  const candidates = [
    path.resolve(process.cwd(), "retaguarda/install.sh"),
    "/app/retaguarda/install.sh",
  ];

  for (const p of candidates) {
    try {
      const content = await fs.readFile(p, "utf-8");
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type":        "text/x-shellscript; charset=utf-8",
          "Cache-Control":       "public, max-age=300",
          "Content-Disposition": 'inline; filename="install-retaguarda.sh"',
        },
      });
    } catch { /* tenta próximo */ }
  }

  // Fallback: redireciona pro GitHub
  return NextResponse.redirect(GITHUB_FALLBACK, 302);
}
