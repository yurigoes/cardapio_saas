import { headers } from "next/headers";
import {
  getEmpresaByDominio,
  getEmpresaBySlug,
  getEmpresaBySubdominio
} from "./api";

export async function getEmpresaAtual(slug?: string) {
  const host = headers().get("host")?.split(":")[0] || "";
  const baseDomain =
    process.env.NEXT_PUBLIC_BASE_DOMAIN || "cardapio.yugochat.com.br";

  if (host.endsWith(`.${baseDomain}`)) {
    const subdominio = host.replace(`.${baseDomain}`, "");

    if (subdominio && subdominio !== "www") {
      const empresaSub = await getEmpresaBySubdominio(subdominio);

      if (empresaSub) {
        return empresaSub;
      }
    }
  }

  if (host !== baseDomain && !host.includes("localhost")) {
    const empresaDominio = await getEmpresaByDominio(host);

    if (empresaDominio) {
      return empresaDominio;
    }
  }

  if (slug) {
    return getEmpresaBySlug(slug);
  }

  return null;
}