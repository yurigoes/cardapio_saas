/**
 * POST /api/pub/cliente/otp/validar
 * Body: { empresa_slug, telefone? OU cpf?, codigo }
 *
 * Valida OTP e cria sessão. Retorna { token, cliente } pra o cliente
 * armazenar em localStorage e usar no painel.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, serverError } from "@/lib/utils/response";

const schema = z.object({
  empresa_slug: z.string().min(2).max(60),
  telefone:     z.string().max(20).optional(),
  cpf:          z.string().max(14).optional(),
  codigo:       z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"),
});

function normalizar(t: string): string {
  const d = t.replace(/\D/g, "");
  if (d.length >= 12) return d;
  return d.length >= 10 ? `55${d}` : d;
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (!body.telefone && !body.cpf) return badRequest("Informe telefone ou CPF");

  const empresa = await queryOne<{ id: string }>(
    `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL`,
    [body.empresa_slug]
  );
  if (!empresa) return badRequest("Restaurante não encontrado");

  const identificador = body.telefone ? normalizar(body.telefone) : body.cpf!.replace(/\D/g, "");
  const codigoHash = crypto.createHash("sha256").update(body.codigo).digest("hex");

  // Pega OTP mais recente válido
  const otp = await queryOne<{
    id: string; cliente_id: string | null; tentativas: number;
  }>(
    `SELECT id, cliente_id, tentativas FROM cliente_otp
      WHERE empresa_id = $1 AND identificador = $2
        AND validado = FALSE
        AND expira_em > NOW()
      ORDER BY created_at DESC LIMIT 1`,
    [empresa.id, identificador]
  );

  if (!otp) return badRequest("Código expirado ou inexistente");
  if (otp.tentativas >= 5) return badRequest("Muitas tentativas erradas. Solicite novo código.");

  // Compara hash (constant-time)
  const otpRow = await queryOne<{ codigo_hash: string }>(
    `SELECT codigo_hash FROM cliente_otp WHERE id = $1`, [otp.id]
  );
  const bate = otpRow && crypto.timingSafeEqual(
    Buffer.from(otpRow.codigo_hash, "hex"),
    Buffer.from(codigoHash, "hex")
  );

  if (!bate) {
    await query(`UPDATE cliente_otp SET tentativas = tentativas + 1 WHERE id = $1`, [otp.id]);
    return badRequest("Código incorreto");
  }
  if (!otp.cliente_id) {
    return badRequest("Cliente não encontrado para este telefone/CPF");
  }

  // Marca OTP como usado + cria sessão de 30 dias
  await query(`UPDATE cliente_otp SET validado = TRUE WHERE id = $1`, [otp.id]);

  const token = crypto.randomBytes(32).toString("hex");
  const ip = (req.headers.get("x-forwarded-for") ?? "0.0.0.0").split(",")[0].trim();
  const ua = req.headers.get("user-agent") ?? "";

  await query(
    `INSERT INTO cliente_sessoes (token, cliente_id, empresa_id, expira_em, ip, user_agent)
     VALUES ($1, $2, $3, NOW() + INTERVAL '30 days', $4::inet, $5)`,
    [token, otp.cliente_id, empresa.id, ip, ua]
  );

  const cliente = await queryOne<{
    id: string; nome: string | null; telefone: string | null; email: string | null;
    pontos: number; saldo_cashback: string; total_pedidos: number; total_gasto: string;
  }>(
    `SELECT id, nome, telefone, email,
            COALESCE(pontos, 0)              AS pontos,
            COALESCE(saldo_cashback, 0)::text AS saldo_cashback,
            COALESCE(total_pedidos, 0)       AS total_pedidos,
            COALESCE(total_gasto, 0)::text    AS total_gasto
       FROM clientes WHERE id = $1`,
    [otp.cliente_id]
  );

  return ok({ token, cliente });
}
