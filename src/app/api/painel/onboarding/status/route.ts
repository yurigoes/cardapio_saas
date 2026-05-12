/**
 * GET /api/painel/onboarding/status
 *
 * Retorna o que falta para a empresa estar "operacional".
 * Usado pelo wizard /painel/onboarding e pelo banner do dashboard.
 *
 * Steps:
 *   1. dados_basicos   — nome_fantasia + whatsapp + cor_primaria
 *   2. categorias      — pelo menos 1 categoria
 *   3. produtos        — pelo menos 1 produto
 *   4. mesas_ou_qr     — pelo menos 1 mesa OU subdomínio configurado (delivery)
 *   5. gateway_ou_pix  — gateway online OU pix_chave
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound, serverError } from "@/lib/utils/response";

interface EmpresaRow {
  nome_fantasia:  string | null;
  whatsapp:       string | null;
  cor_primaria:   string | null;
  subdominio:     string | null;
  pix_chave:      string | null;
  total_categorias: string;
  total_produtos:   string;
  total_mesas:      string;
  total_gateways:   string;
}

export interface OnboardingStep {
  id:        "dados_basicos" | "categorias" | "produtos" | "mesas_ou_qr" | "gateway_ou_pix";
  label:     string;
  done:      boolean;
  hint:      string;
  href:      string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const empresaId = auth.payload.empresaId;
  if (!empresaId) return badRequest("Sem empresa associada");

  try {
    const row = await queryOne<EmpresaRow>(
      `SELECT
         e.nome_fantasia, e.whatsapp, e.cor_primaria, e.subdominio, e.pix_chave,
         (SELECT COUNT(*) FROM categorias      c WHERE c.empresa_id = e.id AND c.deleted_at IS NULL) AS total_categorias,
         (SELECT COUNT(*) FROM produtos        p WHERE p.empresa_id = e.id AND p.deleted_at IS NULL) AS total_produtos,
         (SELECT COUNT(*) FROM mesas           m WHERE m.empresa_id = e.id AND m.deleted_at IS NULL) AS total_mesas,
         (SELECT COUNT(*) FROM gateways_config g WHERE g.empresa_id = e.id AND g.ativo = TRUE AND g.deleted_at IS NULL) AS total_gateways
       FROM empresas e
       WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [empresaId]
    );

    if (!row) return notFound("Empresa não encontrada");

    const steps: OnboardingStep[] = [
      {
        id:    "dados_basicos",
        label: "Dados básicos",
        done:  !!(row.nome_fantasia && row.whatsapp && row.cor_primaria),
        hint:  "Nome, WhatsApp e cor da marca",
        href:  "/painel/config",
      },
      {
        id:    "categorias",
        label: "Primeira categoria",
        done:  Number(row.total_categorias) > 0,
        hint:  "Bebidas, lanches, sobremesas…",
        href:  "/painel/cardapio",
      },
      {
        id:    "produtos",
        label: "Primeiro produto",
        done:  Number(row.total_produtos) > 0,
        hint:  "Adicione com nome, preço e foto",
        href:  "/painel/cardapio",
      },
      {
        id:    "mesas_ou_qr",
        label: "Mesas ou delivery",
        done:  Number(row.total_mesas) > 0 || !!row.subdominio,
        hint:  "Cadastre mesas (QR) ou ative o link público",
        href:  "/painel/mesas",
      },
      {
        id:    "gateway_ou_pix",
        label: "Forma de pagamento online",
        done:  Number(row.total_gateways) > 0 || !!row.pix_chave,
        hint:  "PIX direto ou gateway (MP, Pagar.me, Asaas, Stone)",
        href:  "/painel/gateways",
      },
    ];

    const completos = steps.filter(s => s.done).length;
    return ok({
      total:     steps.length,
      completos,
      pendentes: steps.length - completos,
      completo:  completos === steps.length,
      steps,
    });
  } catch (err) {
    console.error("[Painel/Onboarding/Status]", err);
    return serverError();
  }
}
