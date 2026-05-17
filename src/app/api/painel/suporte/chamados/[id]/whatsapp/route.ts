/**
 * POST /api/painel/suporte/chamados/[id]/whatsapp
 * Body: { telefone?, mensagem? }
 *   - Se omitidos, usa template configurado em suporte_horarios.whatsapp_resposta_cliente
 *   - Substitui variáveis: {operador} {assunto} {mensagem} {link} {cliente} {empresa}
 *
 * Master/suporte only. Envia via Evolution.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const schema = z.object({
  telefone: z.string().min(8).max(30).optional(),
  mensagem: z.string().min(1).max(2000).optional(),
});

function aplicarVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  // Suporte a \n literal no template
  return out.replace(/\\n/g, "\n");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const ctx = await queryOne<{
      assunto:        string;
      empresa_id:     string | null;
      empresa_nome:   string | null;
      empresa_slug:   string | null;
      empresa_evo_url: string | null;
      empresa_evo_key: string | null;
      empresa_whats:  string | null;
      usuario_nome:   string | null;
      usuario_telefone: string | null;
      template:       string | null;
    }>(
      `SELECT c.assunto, c.empresa_id,
              e.nome_fantasia AS empresa_nome,
              e.slug          AS empresa_slug,
              e.evolution_url AS empresa_evo_url,
              e.evolution_key AS empresa_evo_key,
              e.whatsapp      AS empresa_whats,
              u.nome          AS usuario_nome,
              u.telefone      AS usuario_telefone,
              (SELECT whatsapp_resposta_cliente FROM suporte_horarios WHERE id = 1) AS template
         FROM suporte_chamados c
         LEFT JOIN empresas e ON e.id = c.empresa_id
         LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.id = $1`,
      [params.id]
    );
    if (!ctx) return notFound("chamado não encontrado");

    const operador = await queryOne<{ nome: string; cargo: string | null }>(
      `SELECT nome, cargo FROM usuarios WHERE id = $1`, [auth.payload.sub]
    );

    // Telefone destino: prioridade do body, senão do usuário do chamado, senão whatsapp da empresa
    const telefone = body.telefone || ctx.usuario_telefone || ctx.empresa_whats;
    if (!telefone) return badRequest("Sem telefone do destinatário (configure usuario.telefone ou empresa.whatsapp)");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";
    const link    = `${baseUrl}/painel/suporte/chamados/${params.id}`;

    // Aplica template
    const template = body.mensagem || ctx.template || "{operador} respondeu: {mensagem}\n{link}";
    const texto = aplicarVars(template, {
      operador:  operador?.nome ?? "Suporte",
      cargo:     operador?.cargo ?? "",
      assunto:   ctx.assunto,
      mensagem:  body.mensagem ?? "Confira o chamado pra mais detalhes",
      link,
      cliente:   ctx.usuario_nome ?? "amigo(a)",
      empresa:   ctx.empresa_nome ?? "",
    });

    // Envia via Master Evolution (suporte é serviço do SaaS, não da empresa)
    // Importa helper master pra reusar config centralizada
    const { decryptIfNeeded } = await import("@/lib/security/encrypt");
    const master = await queryOne<{ url: string | null; api_key: string | null; instance_name: string | null }>(
      `SELECT url, api_key, instance_name FROM master_evolution_config WHERE id = 1 AND ativo = true`
    );

    if (!master?.url || !master?.api_key || !master?.instance_name) {
      return serverError("Master Evolution não configurado. Configure em /admin/integracoes/evolution");
    }

    let apiKey = master.api_key;
    if (apiKey.startsWith("encrypted:")) {
      const dec = decryptIfNeeded(apiKey.slice(10));
      if (!dec) return serverError("Falha ao decifrar Master Evolution api_key");
      apiKey = dec;
    }

    const evoUrl = master.url.trim().replace(/\/+$/, "").replace(/\/(manager|api)$/, "");
    const number = telefone.replace(/\D/g, "");
    const fullNumber = number.startsWith("55") ? number : `55${number}`;

    const r = await fetch(`${evoUrl}/message/sendText/${master.instance_name}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body:    JSON.stringify({ number: fullNumber, text: texto }),
      signal:  AbortSignal.timeout(15_000),
    }).catch((err: Error) => {
      console.warn("[Suporte/WhatsApp] rede:", err.message);
      return null;
    });

    if (!r) {
      return serverError("Sem resposta da Evolution (timeout ou rede)");
    }
    if (!r.ok) {
      const body = (await r.text()).slice(0, 200);
      console.error("[Suporte/WhatsApp] Evolution HTTP", r.status, body);
      return serverError(`Evolution HTTP ${r.status}: ${body}`);
    }

    // Mensagem 'sistema' no chat
    await queryOne(
      `INSERT INTO suporte_mensagens (chamado_id, autor_id, autor_tipo, autor_nome, texto, interno)
       VALUES ($1, $2, 'sistema', $3, $4, FALSE)`,
      [params.id, auth.payload.sub, operador?.nome ?? "Sistema",
       `📱 ${operador?.nome ?? "Operador"} enviou WhatsApp para ${telefone}: "${texto.slice(0, 100)}${texto.length > 100 ? "..." : ""}"`]
    ).catch(() => {});

    return ok({ enviado: true, para: telefone });
  } catch (err) {
    console.error("[Suporte/WhatsApp]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
