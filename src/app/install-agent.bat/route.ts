/**
 * GET /install-agent.bat
 *
 * Serve o wrapper .bat (double-click) pra usuários menos técnicos no
 * Windows que preferem clicar duas vezes em vez de PowerShell.
 */
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const path = join(process.cwd(), "scripts", "install-rustdesk-agent.bat");
    const content = await readFile(path, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type":  "application/octet-stream",
        "Content-Disposition": "attachment; filename=install-rustdesk-agent.bat",
      },
    });
  } catch (err) {
    return new NextResponse(
      `@echo off\necho Erro: ${err instanceof Error ? err.message : "?"}\npause\nexit 1\n`,
      { status: 500 }
    );
  }
}
