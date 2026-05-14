/**
 * POST /api/cron/aniversarios
 *
 * Roda 1x por dia (configurar 09h via crontab).
 * Pra cada empresa, busca clientes que fazem aniversário HOJE
 * e ainda não receberam mensagem este ano. Envia via Evolution
 * com delay aleatório entre 5-30s pra evitar bloqueio do WhatsApp.
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";

interface ClienteAniversario {
  empresa_id: string;
  cliente_id: string;
  nome: string | null;
  telefone: string | null;
  empresa_slug: string;
  empresa_nome: string;
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min: number, max: number) { return min + Math.floor(Math.random() * (max - min)); }

async function enviarMensagem(empresaSlug: string, telefone: string, mensagem: string): Promise<{ ok: boolean; erro?: string }> {
  const evoUrl = process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const evoKey = process.env.EVOLUTION_API_KEY;
  if (!evoKey) return { ok: false, erro: "EVOLUTION_API_KEY não configurado" };

  const numero = telefone.startsWith("+") ? telefone.replace(/\D/g, "") : "55" + telefone.replace(/\D/g, "");

  try {
    const r = await fetch(`${evoUrl}/message/sendText/${empresaSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": evoKey },
      body: JSON.stringify({ number: numero, text: mensagem }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return { ok: false, erro: `HTTP ${r.status}: ${txt.slice(0, 100)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: (err as Error).message };
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const ano = new Date().getFullYear();

  try {
    // Pega aniversariantes HOJE (mesmo dia/mês) que ainda não receberam este ano
    const aniversariantes = await query<ClienteAniversario>(
      `SELECT c.empresa_id, c.id AS cliente_id, c.nome, c.telefone,
              e.slug AS empresa_slug, e.nome_fantasia AS empresa_nome
         FROM clientes c
         JOIN empresas e ON e.id = c.empresa_id
        WHERE c.deleted_at IS NULL
          AND e.deleted_at IS NULL
          AND e.status = 'ativo'
          AND c.data_nascimento IS NOT NULL
          AND c.telefone IS NOT NULL
          AND EXTRACT(MONTH FROM c.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(DAY   FROM c.data_nascimento) = EXTRACT(DAY   FROM CURRENT_DATE)
          AND NOT EXISTS (
            SELECT 1 FROM aniversario_envios ae
             WHERE ae.cliente_id = c.id AND ae.ano = $1
          )`,
      [ano]
    );

    let enviados = 0;
    let falhas   = 0;

    for (const c of aniversariantes) {
      if (!c.telefone) continue;

      const mensagem = `🎂 Feliz aniversário, ${c.nome ?? "amigo(a)"}!\n\n` +
        `Hoje é seu dia! ${c.empresa_nome} deseja muito sucesso e ` +
        `agradece por ser nosso(a) cliente.\n\n` +
        `Que tal comemorar com a gente? 🎉`;

      const resultado = await enviarMensagem(c.empresa_slug, c.telefone, mensagem);

      // Registra (mesmo se falhou — pra não tentar de novo no mesmo dia)
      await queryOne(
        `INSERT INTO aniversario_envios (empresa_id, cliente_id, ano, resultado, erro)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (cliente_id, ano) DO NOTHING`,
        [c.empresa_id, c.cliente_id, ano, resultado.ok ? "sucesso" : "erro", resultado.erro ?? null]
      ).catch(() => {});

      if (resultado.ok) enviados++;
      else falhas++;

      // Delay aleatório entre 5-30s pra evitar bloqueio
      await delay(randomDelay(5_000, 30_000));
    }

    return NextResponse.json({
      ok: true,
      processados: aniversariantes.length,
      enviados,
      falhas,
      ano,
    });
  } catch (err) {
    console.error("[Cron/Aniversarios]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "aniversarios" });
}
