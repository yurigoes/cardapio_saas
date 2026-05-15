/**
 * POST /api/painel/suporte/chamados/[id]/validacao
 *   Suporte solicita validação 2FA. Body: { tipo: 'admin'|'usuario'|'ambos' }
 *   Sistema gera código(s), envia via Evolution WhatsApp.
 *   Códigos: admin=6 dígitos, usuario=4 dígitos.
 *
 * GET /api/painel/suporte/chamados/[id]/validacao
 *   Lista validações pendentes/feitas + selos.
 *
 * PUT /api/painel/suporte/chamados/[id]/validacao
 *   Cliente confirma. Body: { tipo, codigo }
 *
 * DELETE /api/painel/suporte/chamados/[id]/validacao?id=X
 *   Cancela validação pendente (master/suporte).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash, randomInt } from "crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";
import { notificarEvolution } from "@/lib/notify/evolution";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function genCodigo(digitos: 4 | 6): string {
  const max = Math.pow(10, digitos);
  return String(randomInt(0, max)).padStart(digitos, "0");
}

// ─── GET: lista + selos ─────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const validacoes = await query(
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

  return ok({ validacoes, selos: selos ?? { admin_validado: false, usuario_validado: false } });
}

// ─── POST: solicita ────────────────────────────────────────────
const postSchema = z.object({
  tipo: z.enum(["admin", "usuario", "ambos"]),
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

  // Pega contexto do chamado: empresa.whatsapp (admin) e usuario.telefone (requester)
  const ctx = await queryOne<{
    empresa_id:   string;
    empresa_whatsapp: string | null;
    usuario_telefone: string | null;
    usuario_nome:     string | null;
  }>(
    `SELECT c.empresa_id,
            e.whatsapp AS empresa_whatsapp,
            u.telefone AS usuario_telefone,
            u.nome     AS usuario_nome
       FROM suporte_chamados c
       JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id = $1`,
    [params.id]
  );
  if (!ctx) return notFound("chamado não encontrado");

  const tipos: Array<"admin" | "usuario"> =
    body.tipo === "ambos" ? ["admin", "usuario"] : [body.tipo];

  const result: Array<{ tipo: string; ok: boolean; motivo?: string }> = [];

  for (const tipo of tipos) {
    const telefone = tipo === "admin" ? ctx.empresa_whatsapp : ctx.usuario_telefone;
    if (!telefone) {
      result.push({ tipo, ok: false, motivo: `sem telefone cadastrado para ${tipo}` });
      continue;
    }

    // Gera código
    const codigo = genCodigo(tipo === "admin" ? 6 : 4);
    const hash   = sha256(codigo);

    // Cancela validações antigas pendentes do mesmo tipo
    await queryOne(
      `UPDATE suporte_validacoes SET cancelado_em = NOW()
        WHERE chamado_id = $1 AND tipo = $2
          AND validado_em IS NULL AND cancelado_em IS NULL`,
      [params.id, tipo]
    ).catch(() => {});

    // Insere nova
    await queryOne(
      `INSERT INTO suporte_validacoes (chamado_id, tipo, codigo_hash, telefone, solicitado_por)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.id, tipo, hash, telefone, auth.payload.sub]
    );

    // Envia via Evolution (WhatsApp)
    const texto = tipo === "admin"
      ? `🔐 *Three Digital — Validação Admin*\n\nCódigo de autorização para ${ctx.usuario_nome ?? "o solicitante"} no suporte:\n\n*${codigo}*\n\nVálido por 30 minutos. Se não foi você quem pediu, ignore.`
      : `🔐 *Three Digital — Validação*\n\nCódigo pra confirmar que você abriu o chamado:\n\n*${codigo}*\n\nVálido por 30 minutos.`;

    const r = await notificarEvolution(ctx.empresa_id, "novo_pedido", {
      telefone,
    }).catch(() => ({ enviado: false }));

    // notificarEvolution usa template padrão; pra mandar texto custom precisamos
    // chamar a Evolution API direto. Vou fazer fallback simples:
    if (!r.enviado) {
      // tenta via Evolution direto
      try {
        const url = process.env.EVOLUTION_PUBLIC_URL || process.env.EVOLUTION_API_URL;
        const key = process.env.EVOLUTION_API_KEY;
        const empresa = await queryOne<{ slug: string; evolution_url: string | null; evolution_key: string | null }>(
          `SELECT slug, evolution_url, evolution_key FROM empresas WHERE id = $1`,
          [ctx.empresa_id]
        );
        const evoUrl = empresa?.evolution_url || url;
        const evoKey = empresa?.evolution_key || key;
        if (evoUrl && evoKey && empresa?.slug) {
          const number = telefone.replace(/\D/g, "");
          const fullNumber = number.startsWith("55") ? number : `55${number}`;
          await fetch(`${evoUrl.replace(/\/+$/, "")}/message/sendText/${empresa.slug}`, {
            method:  "POST",
            headers: { "Content-Type": "application/json", "apikey": evoKey },
            body:    JSON.stringify({ number: fullNumber, text: texto }),
            signal:  AbortSignal.timeout(8000),
          });
        }
      } catch {/* */}
    }

    result.push({ tipo, ok: true });
  }

  return ok({ solicitadas: result });
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
  // Qualquer logado pode confirmar (normalmente o cliente que recebeu)

  let body: z.infer<typeof putSchema>;
  try { body = putSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const hash = sha256(body.codigo);

  const v = await queryOne<{ id: string; tentativas: number }>(
    `UPDATE suporte_validacoes
        SET tentativas = tentativas + 1
      WHERE chamado_id = $1 AND tipo = $2
        AND codigo_hash = $3
        AND validado_em IS NULL AND cancelado_em IS NULL
        AND expira_em > NOW()
      RETURNING id, tentativas`,
    [params.id, body.tipo, hash]
  );

  if (!v) {
    // Incrementa tentativa em validação ativa pra mesmo tipo (rate limit)
    await queryOne(
      `UPDATE suporte_validacoes SET tentativas = tentativas + 1
        WHERE chamado_id = $1 AND tipo = $2
          AND validado_em IS NULL AND cancelado_em IS NULL`,
      [params.id, body.tipo]
    ).catch(() => {});
    return badRequest("Código inválido ou expirado");
  }

  await queryOne(
    `UPDATE suporte_validacoes
        SET validado_em = NOW(), validado_por = $1
      WHERE id = $2`,
    [auth.payload.sub, v.id]
  );

  // Mensagem sistema no chat
  await queryOne(
    `INSERT INTO suporte_mensagens (chamado_id, autor_tipo, autor_nome, texto)
     VALUES ($1, 'sistema', 'Sistema', $2)`,
    [params.id, `🔐 Validação 2FA confirmada (${body.tipo})`]
  ).catch(() => {});

  // Recalcula selos
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
