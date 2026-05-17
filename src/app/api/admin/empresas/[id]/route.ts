import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

function assertMaster(role: string) {
  if (role !== "master") throw new Error("forbidden");
}

// GET /api/admin/empresas/[id] — dados completos incluindo cadastrais + endereço + gestor
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try { assertMaster(auth.payload.role); }
  catch { return forbidden(); }

  try {
    const empresa = await queryOne(
      `SELECT e.id, e.nome_fantasia, e.razao_social, e.razao_social_full,
              e.cnpj, e.inscricao_estadual, e.inscricao_municipal, e.regime_tributario,
              e.slug, e.subdominio,
              e.cor_primaria, e.cor_secundaria, e.whatsapp, e.telefone, e.email,
              e.endereco_cep, e.endereco_logradouro, e.endereco_numero,
              e.endereco_complemento, e.endereco_bairro, e.endereco_cidade, e.endereco_uf,
              e.gestor_nome, e.gestor_cpf, e.gestor_rg, e.gestor_telefone, e.gestor_email,
              e.cadastro_status, e.cadastro_aprovado_por, e.cadastro_aprovado_em,
              e.cadastro_motivo_rejeicao, e.exibir_como_parceiro,
              e.status, e.plano_id, e.modulos_ativos, e.assinatura_expira_em,
              e.slave_key, e.slave_ativo, e.slave_ultimo_sync,
              e.logo_url, e.banner_url,
              e.created_at, e.updated_at,
              p.nome as plano_nome
         FROM empresas e
         LEFT JOIN planos p ON p.id = e.plano_id
        WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [params.id]
    );

    if (!empresa) return notFound("Empresa não encontrada");
    return ok(empresa);
  } catch (err) {
    console.error("[Admin/Empresas/GET]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

const updateSchema = z.object({
  // Status / plano
  status:               z.enum(["ativo","inativo","suspenso","bloqueado","teste"]).optional(),
  plano_id:             z.string().uuid().nullable().optional(),
  assinatura_expira_em: z.string().datetime().nullable().optional(),
  modulos_ativos:       z.array(z.string()).optional(),
  // Identidade
  nome_fantasia:        z.string().min(2).max(255).optional(),
  razao_social:         z.string().max(255).nullable().optional(),
  razao_social_full:    z.string().max(255).nullable().optional(),
  cnpj:                 z.string().max(18).nullable().optional(),
  inscricao_estadual:   z.string().max(50).nullable().optional(),
  inscricao_municipal:  z.string().max(50).nullable().optional(),
  regime_tributario:    z.string().max(30).nullable().optional(),
  // Contato
  email:                z.string().email().nullable().optional(),
  whatsapp:             z.string().max(20).nullable().optional(),
  telefone:             z.string().max(20).nullable().optional(),
  // Endereço estruturado
  endereco_cep:         z.string().max(9).nullable().optional(),
  endereco_logradouro:  z.string().max(255).nullable().optional(),
  endereco_numero:      z.string().max(20).nullable().optional(),
  endereco_complemento: z.string().max(255).nullable().optional(),
  endereco_bairro:      z.string().max(100).nullable().optional(),
  endereco_cidade:      z.string().max(100).nullable().optional(),
  endereco_uf:          z.string().length(2).nullable().optional(),
  // Gestor
  gestor_nome:          z.string().max(255).nullable().optional(),
  gestor_cpf:           z.string().max(14).nullable().optional(),
  gestor_rg:            z.string().max(20).nullable().optional(),
  gestor_telefone:      z.string().max(20).nullable().optional(),
  gestor_email:         z.string().email().nullable().optional(),
  // Validação cadastral
  cadastro_status:      z.enum(["pendente","em_analise","aprovado","rejeitado"]).optional(),
  cadastro_motivo_rejeicao: z.string().max(1000).nullable().optional(),
  exibir_como_parceiro: z.boolean().optional(),
  // Branding
  cor_primaria:         z.string().max(20).nullable().optional(),
  cor_secundaria:       z.string().max(20).nullable().optional(),
  logo_url:             z.string().nullable().optional(),
  banner_url:           z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try { assertMaster(auth.payload.role); }
  catch { return forbidden(); }

  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  const entries = Object.entries(body).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return badRequest("Nenhum campo para atualizar");

  try {
    const sets: string[]    = [];
    const values: unknown[] = [];
    let i = 1;

    for (const [k, v] of entries) {
      if (k === "modulos_ativos") {
        sets.push(`${k} = $${i++}`);
        values.push(JSON.stringify(v));
      } else {
        sets.push(`${k} = $${i++}`);
        values.push(v);
      }
    }

    // Se mudou pra aprovado, marca quem aprovou e quando
    if (body.cadastro_status === "aprovado") {
      sets.push(`cadastro_aprovado_por = $${i++}`);
      values.push(auth.payload.sub);
      sets.push(`cadastro_aprovado_em = NOW()`);
    }

    sets.push(`updated_at = NOW()`);
    values.push(params.id);

    const empresa = await queryOne(
      `UPDATE empresas SET ${sets.join(", ")}
        WHERE id = $${i} AND deleted_at IS NULL
        RETURNING id`,
      values
    );

    if (!empresa) return notFound("Empresa não encontrada");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Admin/Empresas/PATCH]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try { assertMaster(auth.payload.role); }
  catch { return forbidden(); }

  try {
    const empresa = await queryOne(
      `UPDATE empresas SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [params.id]
    );

    if (!empresa) return notFound("Empresa não encontrada");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Admin/Empresas/DELETE]", err);
    return serverError();
  }
}
