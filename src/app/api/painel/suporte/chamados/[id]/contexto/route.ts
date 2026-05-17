/**
 * GET /api/painel/suporte/chamados/[id]/contexto
 *
 * Retorna variáveis auto-preenchíveis do chamado pra usar em templates:
 * cliente, operador (eu), empresa, assunto, link, numero, email (do solicitante).
 *
 * UI consulta isso quando abre modal de envio + detecta quais vars do
 * template estão cobertas vs quais precisam ser preenchidas manualmente.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const ctx = await queryOne<{
      assunto:       string;
      numero:        number | null;
      empresa_nome:  string | null;
      empresa_id:    string | null;
      usuario_nome:  string | null;
      usuario_email: string | null;
      usuario_telefone: string | null;
    }>(
      `SELECT c.assunto,
              (ROW_NUMBER() OVER (ORDER BY c.criado_em))::int AS numero,
              e.nome_fantasia AS empresa_nome,
              c.empresa_id,
              u.nome  AS usuario_nome,
              u.email AS usuario_email,
              u.telefone AS usuario_telefone
         FROM suporte_chamados c
         LEFT JOIN empresas e ON e.id = c.empresa_id
         LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.id = $1`,
      [params.id]
    );
    if (!ctx) return notFound("chamado não encontrado");

    const operador = await queryOne<{ nome: string; email: string; cargo: string | null }>(
      `SELECT nome, email, cargo FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";

    // Variáveis sistema (auto-preenchíveis):
    const variaveis: Record<string, string> = {
      cliente:    ctx.usuario_nome ?? "Cliente",
      operador:   operador?.nome ?? "Suporte",
      cargo:      operador?.cargo ?? "",
      empresa:    ctx.empresa_nome ?? "",
      assunto:    ctx.assunto,
      numero:     String(ctx.numero ?? params.id.slice(0, 8)),
      link:       `${baseUrl}/painel/suporte/chamados/${params.id}`,
      email:      ctx.usuario_email ?? "",
      telefone:   ctx.usuario_telefone ?? "",
    };

    return ok({ variaveis });
  } catch (err) {
    console.error("[Chamados/contexto]", err);
    return serverError();
  }
}
