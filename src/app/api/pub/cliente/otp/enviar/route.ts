/**
 * POST /api/pub/cliente/otp/enviar
 * Body: { empresa_slug, telefone? OU cpf? }
 *
 * Localiza cliente cadastrado e dispara código de 6 dígitos via WhatsApp.
 * Não revela se cliente existe ou não — sempre retorna "OK" pra evitar
 * enumeration de telefones.
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
});

function normalizarTelefone(t: string): string {
  const d = t.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}
function normalizarCpf(c: string): string {
  return c.replace(/\D/g, "");
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Wrap geral: nenhum erro inesperado deve crashar (502)
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[Cliente/OTP/enviar] UNCAUGHT:", err);
    return serverError(err instanceof Error ? err.message : "Erro inesperado");
  }
}

async function handlePost(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (!body.telefone && !body.cpf) {
    return badRequest("Informe telefone ou CPF");
  }

  // Verifica se migration 075 foi aplicada (cliente_otp existe?)
  try {
    await queryOne(`SELECT 1 FROM cliente_otp LIMIT 1`);
  } catch {
    return badRequest(
      "Funcionalidade de OTP do cliente ainda não está disponível. " +
      "Admin precisa aplicar a migration 075 no banco."
    );
  }

  // Localiza empresa
  const empresa = await queryOne<{ id: string }>(
    `SELECT id FROM empresas WHERE slug = $1 AND deleted_at IS NULL`,
    [body.empresa_slug]
  );
  if (!empresa) return badRequest("Restaurante não encontrado");

  // Localiza cliente
  const identificador = body.telefone ? normalizarTelefone(body.telefone) : normalizarCpf(body.cpf!);
  const tipoId        = body.telefone ? "telefone" : "cpf";

  const cliente = await queryOne<{ id: string; telefone: string | null; nome: string | null }>(
    body.telefone
      ? `SELECT id, telefone, nome FROM clientes
          WHERE empresa_id = $1
            AND deleted_at IS NULL
            AND REGEXP_REPLACE(COALESCE(telefone, ''), '[^0-9]', '', 'g') = $2
          LIMIT 1`
      : `SELECT id, telefone, nome FROM clientes
          WHERE empresa_id = $1
            AND deleted_at IS NULL
            AND REGEXP_REPLACE(COALESCE(cpf, ''), '[^0-9]', '', 'g') = $2
          LIMIT 1`,
    [empresa.id, identificador.replace(/^55/, "")]
  );

  // Rate limit: máx 3 envios em 10 min pro mesmo identificador
  try {
    const recent = await queryOne<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM cliente_otp
        WHERE empresa_id = $1 AND identificador = $2
          AND created_at > NOW() - INTERVAL '10 minutes'`,
      [empresa.id, identificador]
    );
    if (Number(recent?.n ?? "0") >= 3) {
      return badRequest("Muitas tentativas. Aguarde 10 minutos.");
    }
  } catch {}

  // Sempre cria registro OTP (mesmo se cliente não existe) pra evitar timing attack
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  const codigoHash = crypto.createHash("sha256").update(codigo).digest("hex");
  const ip = (req.headers.get("x-forwarded-for") ?? "0.0.0.0").split(",")[0].trim();
  const ua = req.headers.get("user-agent") ?? "";

  await query(
    `INSERT INTO cliente_otp
       (empresa_id, identificador, tipo_id, cliente_id, codigo_hash,
        expira_em, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes', $6::inet, $7)`,
    [empresa.id, identificador, tipoId, cliente?.id ?? null, codigoHash, ip, ua]
  ).catch(err => console.error("[Cliente/OTP/insert]", err));

  // Envia código por WhatsApp — tenta Evolution da EMPRESA, e se não tiver,
  // cai pra Master Evolution (mesma usada no suporte/2FA)
  let envioStatus: "enviado" | "sem_evolution" | "falha" = "sem_evolution";
  let envioDetalhe = "";
  if (cliente?.id && body.telefone) {
    const telefoneFmt = cliente.telefone ?? identificador;
    const number = telefoneFmt.replace(/\D/g, "");
    const numberE164 = number.startsWith("55") ? number : `55${number}`;
    const texto = `🔐 Seu código de acesso: *${codigo}*\n\nVálido por 10 minutos.\n\nSe não foi você, ignore.`;

    // Tenta Evolution da empresa primeiro
    try {
      const evoCfg = await queryOne<{ evolution_url: string | null; evolution_key: string | null; slug: string }>(
        `SELECT evolution_url, evolution_key, slug FROM empresas WHERE id = $1`,
        [empresa.id]
      );
      if (evoCfg?.evolution_url && evoCfg.evolution_key) {
        const url = `${evoCfg.evolution_url.replace(/\/+$/, "")}/message/sendText/${evoCfg.slug}`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": evoCfg.evolution_key },
          body: JSON.stringify({ number: numberE164, text: texto }),
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) {
          envioStatus = "enviado";
          console.info(`[OTP/whatsapp] enviado via empresa.evolution → ${numberE164}`);
        } else {
          const t = await r.text().catch(() => "");
          envioDetalhe = `Empresa.evo HTTP ${r.status}: ${t.slice(0, 100)}`;
          console.warn(`[OTP/whatsapp] ${envioDetalhe}`);
        }
      }
    } catch (e) {
      envioDetalhe = `Empresa.evo erro: ${e instanceof Error ? e.message : "?"}`;
      console.warn(`[OTP/whatsapp]`, envioDetalhe);
    }

    // Fallback: Master Evolution (config global do SaaS)
    if (envioStatus !== "enviado") {
      try {
        const masterEvo = await queryOne<{ url: string | null; api_key: string | null; instance_name: string | null }>(
          `SELECT url, api_key, instance_name FROM master_evolution_config WHERE id = 1 AND ativo = TRUE`
        ).catch(() => null);
        if (masterEvo?.url && masterEvo.api_key && masterEvo.instance_name) {
          // api_key pode estar cifrada ou plain — tenta decifrar best-effort
          let apiKey = masterEvo.api_key;
          try {
            const { decryptIfNeeded } = await import("@/lib/security/encrypt");
            apiKey = decryptIfNeeded(masterEvo.api_key) ?? masterEvo.api_key;
          } catch {}
          const url = `${masterEvo.url.replace(/\/+$/, "")}/message/sendText/${masterEvo.instance_name}`;
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": apiKey },
            body: JSON.stringify({ number: numberE164, text: texto }),
            signal: AbortSignal.timeout(8000),
          });
          if (r.ok) {
            envioStatus = "enviado";
            console.info(`[OTP/whatsapp] enviado via Master Evolution → ${numberE164}`);
          } else {
            const t = await r.text().catch(() => "");
            envioDetalhe = `Master.evo HTTP ${r.status}: ${t.slice(0, 100)}`;
            envioStatus = "falha";
          }
        }
      } catch (e) {
        envioDetalhe = `Master.evo erro: ${e instanceof Error ? e.message : "?"}`;
        envioStatus = "falha";
      }
    }
  }

  // Em dev/sandbox, retorna o código pro testes facilitarem
  const devMode = process.env.NODE_ENV !== "production";
  console.info(`[Cliente/OTP] enviar empresa=${empresa.id} cliente=${cliente?.id ?? "—"} envio=${envioStatus}${envioDetalhe ? " · " + envioDetalhe : ""}`);
  return ok({
    enviado: true,
    envio:   envioStatus,                 // útil pro debug
    detalhe: envioDetalhe || undefined,
    mensagem: "Se o cadastro existir, um código foi enviado pelo WhatsApp.",
    ...(devMode && cliente ? { _dev_codigo: codigo } : {}),
  });
}
