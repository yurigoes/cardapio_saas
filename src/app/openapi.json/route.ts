/**
 * GET /openapi.json
 *
 * Serve a especificação OpenAPI dinâmica — spec base vem de
 * `public/openapi-base.json` mas título/descrição/server URL são
 * substituídos pelos dados do branding configurado pelo master.
 */
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSaasBranding } from "@/lib/branding/server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

interface OpenApiSpec {
  info?: { title?: string; description?: string; contact?: { name?: string; email?: string; url?: string } };
  servers?: { url: string; description?: string }[];
  [k: string]: unknown;
}

export async function GET() {
  const b = await getSaasBranding();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "/";

  let spec: OpenApiSpec;
  try {
    // Tenta novo nome (base) primeiro, depois nome legado
    const filePath = path.join(process.cwd(), "public", "openapi-base.json");
    const fallback = path.join(process.cwd(), "public", "openapi.json");
    let raw: string;
    try { raw = await readFile(filePath, "utf-8"); }
    catch { raw = await readFile(fallback, "utf-8"); }
    spec = JSON.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: "openapi spec não encontrada", detail: String(err) },
      { status: 500 }
    );
  }

  // Override título + descrição + servers
  if (spec.info) {
    spec.info.title       = `${b.nome} API v1`;
    spec.info.description = `API pública para integrações externas do ${b.nome}.\n\n` +
      `Autenticação via API key (Authorization: Bearer apk_...).\n\n` +
      `Gere keys em /painel/api-keys.`;
    spec.info.contact = {
      name:  b.nome,
      ...(b.email && { email: b.email }),
      ...(b.site && { url: b.site }),
    };
  }
  spec.servers = [{ url: baseUrl, description: b.nome }];

  return NextResponse.json(spec, {
    headers: {
      "Content-Type":  "application/json",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
