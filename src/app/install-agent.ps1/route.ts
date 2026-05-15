/**
 * GET /install-agent.ps1
 *
 * Serve o script PowerShell de instalação do agente RustDesk Windows.
 * Permite o usuário rodar via one-liner:
 *   iwr https://app.tthreedigital.com.br/install-agent.ps1 | iex
 *
 * É um endpoint PÚBLICO (sem auth) porque o token vem como argumento.
 */
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const path = join(process.cwd(), "scripts", "install-rustdesk-agent.ps1");
    const content = await readFile(path, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type":  "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Content-Disposition": "inline; filename=install-rustdesk-agent.ps1",
      },
    });
  } catch (err) {
    return new NextResponse(
      `# erro ao ler script: ${err instanceof Error ? err.message : "?"}\n` +
      `Write-Host 'Não foi possível baixar o instalador.' -ForegroundColor Red\n`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }
}
