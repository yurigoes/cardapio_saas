/**
 * Gera o arquivo custom-domains.yml do Traefik
 * baseado nos domínios aprovados no banco de dados.
 *
 * O Traefik monitora o arquivo com `watch=true` e
 * aplica as mudanças automaticamente sem restart.
 */
import fs   from "fs";
import path from "path";
import { query } from "@/lib/db/client";

const DYNAMIC_FILE = process.env.TRAEFIK_DYNAMIC_FILE
  || "/opt/cardapio/infra/traefik/dynamic/custom-domains.yml";

interface EmpresaComDominio {
  slug:           string;
  dominio_proprio: string;
}

function slugify(domain: string): string {
  return domain.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function generateYaml(empresas: EmpresaComDominio[]): string {
  if (empresas.length === 0) {
    return `# Nenhum domínio personalizado aprovado ainda.\nhttp:\n  routers: {}\n  services: {}\n`;
  }

  const routers: string[] = [];
  const services: string[] = [];

  for (const e of empresas) {
    const routerKey  = `custom-${slugify(e.dominio_proprio)}`;
    const serviceKey = `app`;  // todos apontam para o mesmo serviço Next.js

    routers.push(`    ${routerKey}:
      rule: Host(\`${e.dominio_proprio}\`)
      entrypoints: [websecure]
      service: ${serviceKey}
      tls:
        certResolver: le`);
  }

  // Serviço único aponta para o container app
  services.push(`    app:
      loadBalancer:
        servers:
          - url: "http://app:3000"`);

  return `# Domínios personalizados — gerado automaticamente
# NÃO edite manualmente. Use o painel admin.
# Gerado em: ${new Date().toISOString()}

http:
  routers:
${routers.join("\n\n")}

  services:
${services.join("\n\n")}
`;
}

/**
 * Lê todos os domínios aprovados do banco e reescreve o arquivo do Traefik.
 */
export async function rewriteCustomDomains(): Promise<void> {
  // Em dev ou sem caminho configurado, não faz nada
  if (!fs.existsSync(path.dirname(DYNAMIC_FILE))) {
    console.warn("[Traefik] Pasta dynamic não encontrada — pulando rewrite");
    return;
  }

  const empresas = await query<EmpresaComDominio>(
    `SELECT slug, dominio_proprio
     FROM empresas
     WHERE dominio_proprio IS NOT NULL
       AND dominio_status = 'aprovado'
       AND deleted_at IS NULL
       AND status = 'ativo'`
  );

  const yaml = generateYaml(empresas);
  fs.writeFileSync(DYNAMIC_FILE, yaml, "utf8");
  console.log(`[Traefik] custom-domains.yml atualizado com ${empresas.length} domínio(s)`);
}
