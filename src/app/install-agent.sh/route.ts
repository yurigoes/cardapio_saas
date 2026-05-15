/**
 * GET /install-agent.sh
 *
 * Serve o script bash de instalação do agente RustDesk Linux.
 * Permite one-liner:
 *   sudo bash <(curl -fsSL https://app.tthreedigital.com.br/install-agent.sh) --relay ... --key ... --pass ...
 */
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const path = join(process.cwd(), "scripts", "install-rustdesk-agent.sh");
    const content = await readFile(path, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type":  "text/x-shellscript; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    return new NextResponse(
      `#!/bin/bash\necho "erro ao baixar instalador: ${err instanceof Error ? err.message : "?"}" >&2\nexit 1\n`,
      { status: 500 }
    );
  }
}
