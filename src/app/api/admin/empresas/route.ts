import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, queryCount } from "@/lib/db/client";
import { empresaCreateSchema, paginacaoSchema, parseBodyOrThrow } from "@/lib/utils/validators";
import { ok, created, forbidden, badRequest, conflict, serverError, paginatedOk } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";
import { isDuplicateKeyError } from "@/lib/utils/errors";
import { sanitizeSlug } from "@/lib/security/sanitize";
import { generateSlaveKey } from "@/lib/sync/auth";
import { provisionarEvolution } from "@/lib/notify/evolution-provision";

// Apenas master admin pode acessar
function assertMaster(role: string) {
  if (role !== "master") throw new Error("forbidden");
}

// GET /api/admin/empresas — Lista todas as empresas (master)
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    assertMaster(auth.payload.role);
  } catch {
    return forbidden("Acesso exclusivo para administradores master");
  }

  const searchParams = req.nextUrl.searchParams;

  // Admin pode pedir até 500 registros de uma vez (ex: dropdown do hub)
  const adminPaginacao = paginacaoSchema.extend({
    limit: z.coerce.number().int().min(1).max(500).default(20),
  });
  let page = 1, limit = 20, q: string | undefined;
  try {
    const parsed = adminPaginacao.parse({
      page:  searchParams.get("page")  ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      q:     searchParams.get("q")     ?? undefined,
    });
    page  = parsed.page;
    limit = parsed.limit;
    q     = parsed.q;
  } catch {
    return badRequest("Parâmetros de paginação inválidos");
  }

  const status = searchParams.get("status");
  const offset = (page - 1) * limit;

  // Condições com prefixo "e." para o JOIN query
  const conditions      = ["e.deleted_at IS NULL"];
  // Condições sem prefixo para o COUNT query (sem JOIN)
  const countConditions = ["deleted_at IS NULL"];
  const values: unknown[] = [];
  let i = 1;

  if (q) {
    conditions.push(`(e.nome_fantasia ILIKE $${i} OR e.cnpj LIKE $${i} OR e.slug LIKE $${i})`);
    countConditions.push(`(nome_fantasia ILIKE $${i} OR cnpj LIKE $${i} OR slug LIKE $${i})`);
    values.push(`%${q}%`);
    i++;
  }

  if (status) {
    conditions.push(`e.status = $${i}`);
    countConditions.push(`status = $${i}`);
    values.push(status);
    i++;
  }

  const where      = conditions.join(" AND ");
  const whereCount = countConditions.join(" AND ");

  const [empresas, total] = await Promise.all([
    query(
      `SELECT e.id, e.nome_fantasia, e.slug, e.status, e.cnpj,
              e.email, e.whatsapp, e.plano_id, e.modulos_ativos,
              e.created_at, e.assinatura_expira_em,
              e.trial_inicio, e.trial_fim, e.trial_dias,
              e.slave_ativo, e.slave_ultimo_sync,
              (e.slave_key IS NOT NULL) AS tem_slave_key,
              p.nome as plano_nome,
              (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.deleted_at IS NULL) as total_usuarios,
              (SELECT COUNT(*) FROM pedidos pd WHERE pd.empresa_id = e.id AND pd.deleted_at IS NULL) as total_pedidos
       FROM empresas e
       LEFT JOIN planos p ON p.id = e.plano_id
       WHERE ${where}
       ORDER BY e.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    queryCount(`SELECT COUNT(*) FROM empresas WHERE ${whereCount}`, values),
  ]);

  return paginatedOk(empresas, total, page, limit);
}

// POST /api/admin/empresas — Cria nova empresa (master)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    assertMaster(auth.payload.role);
  } catch {
    return forbidden("Acesso exclusivo para administradores master");
  }

  let body: z.output<typeof empresaCreateSchema>;
  try {
    body = await parseBodyOrThrow(req, empresaCreateSchema);
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  // Sanitiza slug
  body.slug = sanitizeSlug(body.slug);

  try {
    // Gera slave_key automaticamente para cada nova empresa
    const slaveKey = generateSlaveKey();

    const empresa = await queryOne<{ id: string }>(
      `INSERT INTO empresas
         (nome_fantasia, razao_social, cnpj, slug, subdominio, cor_primaria,
          cor_secundaria, whatsapp, telefone, email, plano_id, status, slave_key,
          trial_inicio, trial_fim, trial_dias)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'teste',$12,
               NOW(), NOW() + INTERVAL '14 days', 14)
       RETURNING id`,
      [
        body.nome_fantasia,
        body.razao_social     || null,
        body.cnpj             || null,
        body.slug,
        body.subdominio       || null,
        body.cor_primaria     || "#10B981",
        body.cor_secundaria   || "#0F172A",
        body.whatsapp         || null,
        body.telefone         || null,
        body.email            || null,
        body.plano_id         || null,
        slaveKey,
      ]
    );

    await auditLog({
      acao:      "empresa:criar",
      recurso:   "empresas",
      recursoId: empresa?.id,
      dadosNovos: body,
      usuario:   { sub: auth.payload.sub, empresaId: undefined },
    });

    // Auto-provisiona instância Evolution (best-effort, não bloqueia).
    // Pode ser desabilitado via env EVOLUTION_AUTO_PROVISION=false.
    if (empresa?.id && process.env.EVOLUTION_AUTO_PROVISION !== "false") {
      provisionarEvolution(empresa.id)
        .then(r => {
          if (r.ok) console.info(`[Admin/Empresas] Evolution provisionada (${r.ja_existia ? "já existia" : "criada"}): ${r.instance}`);
          else      console.warn(`[Admin/Empresas] Evolution NÃO provisionada: ${r.motivo}`);
        })
        .catch(e => console.warn("[Admin/Empresas] provisionarEvolution falhou", e));
    }

    return created({ id: empresa?.id });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return conflict("Slug ou CNPJ já cadastrado");
    }
    console.error("[Admin/Empresas/POST]", err);
    return serverError();
  }
}
