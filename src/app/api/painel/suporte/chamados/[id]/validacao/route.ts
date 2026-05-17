/**
 * Validação 2FA WhatsApp
 *
 * POST   /api/painel/suporte/chamados/[id]/validacao
 *   Body: { tipo: 'admin'|'usuario'|'ambos', reenviar?: boolean }
 *   - Se já existe validação pendente E !reenviar: retorna a pendente (não regera)
 *   - Se reenviar=true OU expirado: cancela e gera novo código
 *   - Envia via Master Evolution (config em /admin/integracoes/evolution)
 *   - TTL 5 minutos
 *
 * GET    /api/painel/suporte/chamados/[id]/validacao
 *   Lista validações + selos + indica se há pendente válido
 *
 * PUT    /api/painel/suporte/chamados/[id]/validacao
 *   Body: { tipo, codigo } — confirma código
 *
 * DELETE /api/painel/suporte/chamados/[id]/validacao?id=X
 *   Cancela
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash, randomInt } from "crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";
import { decryptIfNeeded } from "@/lib/security/encrypt";

const TTL_MIN = 5;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function genCodigo(digitos: 4 | 6): string {
  const max = Math.pow(10, digitos);
  return String(randomInt(0, max)).padStart(digitos, "0");
}

function aplicarVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return out.replace(/\\n/g, "\n");
}

async function getMasterEvolution() {
  const cfg = await queryOne<{ url: string | null; api_key: string | null; instance_name: string | null }>(
    `SELECT url, api_key, instance_name FROM master_evolution_config WHERE id = 1 AND ativo = true`
  );
  if (!cfg?.url || !cfg?.api_key || !cfg?.instance_name) return null;
  let apiKey = cfg.api_key;
  if (apiKey.startsWith("encrypted:")) {
    const dec = decryptIfNeeded(apiKey.slice(10));
    if (!dec) return null;
    apiKey = dec;
  }
  return {
    url: cfg.url.trim().replace(/\/+$/, "").replace(/\/(manager|api)$/, ""),
    apiKey,
    instance: cfg.instance_name,
  };
}

async function enviarWA(telefone: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  const cfg = await getMasterEvolution();
  if (!cfg) return { ok: false, erro: "Master Evolution não configurado em /admin/integracoes/evolution" };

  const number = telefone.replace(/\D/g, "");
  const fullNumber = number.startsWith("55") ? number : `55${number}`;

  try {
    const r = await fetch(`${cfg.url}/message/sendText/${cfg.instance}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": cfg.apiKey },
      body:    JSON.stringify({ number: fullNumber, text: texto }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 200);
      return { ok: false, erro: `Evolution HTTP ${r.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "erro de rede" };
  }
}

// ─── GET ─────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const validacoes = await query<{
    id: string; tipo: string; telefone: string;
    solicitado_em: string; expira_em: string;
    validado_em: string | null; cancelado_em: string | null;
    tentativas: number;
  }>(
    `SELECT id, tipo, telefone, solicitado_em::text, expira_em::text,
            validado_em::text, cancelado_em::text, tentativas
       FROM suporte_validacoes
      WHERE chamado_id = $1
      ORDER BY solicitado_em DESC`,
    [params.id]
  ).catch(() => []);

  const selos = await queryOne<{ admin_validado: boolean; usuario_validado: boolean }>(
    `SELECT admin_validado, usuario_validado FROM v_chamado_selos WHERE chamado_id = $1`,
    [params.id]
  ).catch(() => null);

  // Pendentes válidas (não expiradas) por tipo
  const now = Date.now();
  const pendentes = validacoes.filter(v =>
    !v.validado_em && !v.cancelado_em && new Date(v.expira_em).getTime() > now
  );
  const expiradas = validacoes.filter(v =>
    !v.validado_em && !v.cancelado_em && new Date(v.expira_em).getTime() <= now
  );

  return ok({
    validacoes,
    pendentes_ativas: pendentes,
    pendentes_expiradas: expiradas,
    selos: selos ?? { admin_validado: false, usuario_validado: false },
  });
}

// ─── POST: solicita (gera + envia) ──────────────────────────────
const postSchema = z.object({
  tipo:     z.enum(["admin", "usuario", "ambos"]),
  reenviar: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  let body: z.infer<typeof postSchema>;
  try { body = postSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const ctx = await queryOne<{
    empresa_id: string | null;
    empresa_whatsapp: string | null;
    usuario_telefone: string | null;
    usuario_nome: string | null;
    template_admin: string | null;
    template_usuario: string | null;
  }>(
    `SELECT c.empresa_id,
            e.whatsapp AS empresa_whatsapp,
            u.telefone AS usuario_telefone,
            u.nome     AS usuario_nome,
            (SELECT whatsapp_validacao_admin   FROM suporte_horarios WHERE id = 1) AS template_admin,
            (SELECT whatsapp_validacao_usuario FROM suporte_horarios WHERE id = 1) AS template_usuario
       FROM suporte_chamados c
       LEFT JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id = $1`,
    [params.id]
  );
  if (!ctx) return notFound("chamado não encontrado");

  const tipos: Array<"admin" | "usuario"> = body.tipo === "ambos" ? ["admin", "usuario"] : [body.tipo];
  const resumo: Array<{ tipo: string; status: "enviado" | "reusado" | "falha"; erro?: string; expira_em?: string }> = [];

  for (const tipo of tipos) {
    const telefone = tipo === "admin" ? ctx.empresa_whatsapp : ctx.usuario_telefone;
    if (!telefone) {
      resumo.push({ tipo, status: "falha", erro: `Sem telefone cadastrado para ${tipo}` });
      continue;
    }

    // Se já existe pendente válida e não está pedindo reenvio: REUSA
    const pendente = await queryOne<{ id: string; expira_em: string }>(
      `SELECT id, expira_em::text FROM suporte_validacoes
        WHERE chamado_id = $1 AND tipo = $2
          AND validado_em IS NULL AND cancelado_em IS NULL
          AND expira_em > NOW()`,
      [params.id, tipo]
    );

    if (pendente && !body.reenviar) {
      resumo.push({ tipo, status: "reusado", expira_em: pendente.expira_em });
      continue;
    }

    // Cancela pendentes antigas (expiradas ou pra forçar reenvio)
    await queryOne(
      `UPDATE suporte_validacoes SET cancelado_em = NOW()
        WHERE chamado_id = $1 AND tipo = $2
          AND validado_em IS NULL AND cancelado_em IS NULL`,
      [params.id, tipo]
    ).catch(() => {});

    // Gera código + envia
    const codigo = genCodigo(tipo === "admin" ? 6 : 4);
    const hash   = sha256(codigo);

    const template = tipo === "admin" ? ctx.template_admin : ctx.template_usuario;
    const texto = aplicarVars(template ?? `🔐 Código: *{codigo}* (válido por ${TTL_MIN}min)`, {
      codigo,
      usuario_nome: ctx.usuario_nome ?? "o solicitante",
      cliente:      ctx.usuario_nome ?? "amigo(a)",
    });

    // Insere ANTES de enviar (pra ter o registro mesmo se WA falhar)
    const r = await queryOne<{ id: string; expira_em: string }>(
      `INSERT INTO suporte_validacoes (chamado_id, tipo, codigo_hash, telefone, solicitado_por, expira_em)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${TTL_MIN} minutes')
       RETURNING id, expira_em::text`,
      [params.id, tipo, hash, telefone, auth.payload.sub]
    );

    // Envia via Master Evolution
    const envio = await enviarWA(telefone, texto);
    if (!envio.ok) {
      // Marca como cancelada (não desperdiça código)
      await queryOne(
        `UPDATE suporte_validacoes SET cancelado_em = NOW(), tentativas = 0
          WHERE id = $1`,
        [r?.id]
      ).catch(() => {});
      resumo.push({ tipo, status: "falha", erro: envio.erro });
      continue;
    }

    resumo.push({ tipo, status: "enviado", expira_em: r?.expira_em });
  }

  const totalFalhas = resumo.filter(x => x.status === "falha").length;
  return ok({ resumo, totalFalhas, ttl_minutos: TTL_MIN });
}

// ─── PUT: confirma código ──────────────────────────────────────
const putSchema = z.object({
  tipo:   z.enum(["admin", "usuario"]),
  codigo: z.string().regex(/^\d{4,6}$/),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  let body: z.infer<typeof putSchema>;
  try { body = putSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const hash = sha256(body.codigo);

  const v = await queryOne<{ id: string }>(
    `UPDATE suporte_validacoes
        SET tentativas = tentativas + 1
      WHERE chamado_id = $1 AND tipo = $2
        AND codigo_hash = $3
        AND validado_em IS NULL AND cancelado_em IS NULL
        AND expira_em > NOW()
      RETURNING id`,
    [params.id, body.tipo, hash]
  );

  if (!v) {
    // Diferencia: expirado vs código inválido
    const exp = await queryOne(
      `SELECT id FROM suporte_validacoes
        WHERE chamado_id = $1 AND tipo = $2
          AND validado_em IS NULL AND cancelado_em IS NULL
          AND expira_em <= NOW() LIMIT 1`,
      [params.id, body.tipo]
    );
    return badRequest(exp ? "Código expirado — solicite reenvio" : "Código inválido");
  }

  await queryOne(
    `UPDATE suporte_validacoes SET validado_em = NOW(), validado_por = $1 WHERE id = $2`,
    [auth.payload.sub, v.id]
  );

  await queryOne(
    `INSERT INTO suporte_mensagens (chamado_id, autor_tipo, autor_nome, texto)
     VALUES ($1, 'sistema', 'Sistema', $2)`,
    [params.id, `🔐 Validação 2FA confirmada (${body.tipo})`]
  ).catch(() => {});

  const selos = await queryOne<{ admin_validado: boolean; usuario_validado: boolean }>(
    `SELECT admin_validado, usuario_validado FROM v_chamado_selos WHERE chamado_id = $1`,
    [params.id]
  );

  return ok({ confirmado: true, selos });
}

// ─── DELETE: cancela ───────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  const validacaoId = req.nextUrl.searchParams.get("id");
  if (!validacaoId) return badRequest("id da validação obrigatório");

  await queryOne(
    `UPDATE suporte_validacoes SET cancelado_em = NOW()
      WHERE id = $1 AND chamado_id = $2 AND validado_em IS NULL AND cancelado_em IS NULL`,
    [validacaoId, params.id]
  );
  return ok({ cancelado: true });
}
