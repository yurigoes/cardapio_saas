import { headers } from "next/headers";
import {
  getEmpresaByDominio,
  getEmpresaBySlug,
  getEmpresaBySubdominio
} from "./api";

export async function getEmpresaAtual(slug?: string) {
  const host = headers().get("host")?.split(":")[0] || "";
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "cardapio.yugochat.com.br";

  if (host.endsWith(`.${baseDomain}`)) {
    const subdominio = host.replace(`.${baseDomain}`, "");

    if (subdominio && subdominio !== "www") {
      return getEmpresaBySubdominio(subdominio);
    }
  }

  if (host !== baseDomain && !host.includes("localhost")) {
    return getEmpresaByDominio(host);
  }

  if (slug) {
    return getEmpresaBySlug(slug);
  }

  return null;
}
