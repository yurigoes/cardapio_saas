/**
 * GET /api/painel/mensalidades/[id]/comprovante
 * Retorna HTML do comprovante de pagamento estilizado (cliente imprime/baixa PDF).
 *
 * Funciona pra mensalidades E cobranças avulsas (?tipo=avulsa).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { forbidden, notFound, badRequest } from "@/lib/utils/response";
import { getSaasBranding } from "@/lib/branding/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  if (!empresaId && !["master","suporte","financeiro"].includes(role)) return forbidden();

  const tipo = req.nextUrl.searchParams.get("tipo") ?? "mensalidade";

  let cobranca: {
    titulo:        string;
    descricao:     string | null;
    valor:         string;
    vencimento:    string;
    status:        string;
    pago_em:       string | null;
    pago_via:      string | null;
    mp_payment_id: string | null;
    nota_fiscal_url:  string | null;
    nota_fiscal_nome: string | null;
    empresa_id:    string;
    empresa_nome:  string;
    empresa_cnpj:  string | null;
    empresa_endereco: string;
    plano_nome:    string | null;
  } | null = null;

  if (tipo === "avulsa") {
    cobranca = await queryOne(
      `SELECT
         c.nome AS titulo, c.motivo AS descricao,
         c.valor::text, c.vencimento::text, c.status,
         c.pago_em::text, c.pago_via, c.mp_payment_id,
         c.nota_fiscal_url, c.nota_fiscal_nome,
         e.id AS empresa_id, e.nome_fantasia AS empresa_nome, e.cnpj AS empresa_cnpj,
         COALESCE(
           NULLIF(CONCAT_WS(', ',
             NULLIF(CONCAT_WS(' ', e.endereco_logradouro, e.endereco_numero), ''),
             NULLIF(e.endereco_bairro, ''),
             NULLIF(CONCAT_WS('/', e.endereco_cidade, e.endereco_uf), '')
           ), ''), '—') AS empresa_endereco,
         NULL AS plano_nome
       FROM cobrancas_avulsas c
       JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = $1`,
      [params.id]
    );
  } else {
    cobranca = await queryOne(
      `SELECT
         CONCAT('Mensalidade ', TO_CHAR(m.mes_referencia, 'TMMonth YYYY')) AS titulo,
         p.nome AS descricao,
         m.valor::text, m.vencimento::text, m.status,
         m.pago_em::text, m.pago_via, m.mp_payment_id,
         m.nota_fiscal_url, m.nota_fiscal_nome,
         e.id AS empresa_id, e.nome_fantasia AS empresa_nome, e.cnpj AS empresa_cnpj,
         COALESCE(
           NULLIF(CONCAT_WS(', ',
             NULLIF(CONCAT_WS(' ', e.endereco_logradouro, e.endereco_numero), ''),
             NULLIF(e.endereco_bairro, ''),
             NULLIF(CONCAT_WS('/', e.endereco_cidade, e.endereco_uf), '')
           ), ''), '—') AS empresa_endereco,
         p.nome AS plano_nome
       FROM mensalidades m
       JOIN empresas e ON e.id = m.empresa_id
  LEFT JOIN planos p   ON p.id = m.plano_id
      WHERE m.id = $1`,
      [params.id]
    );
  }

  if (!cobranca) return notFound();
  if (empresaId && cobranca.empresa_id !== empresaId
      && !["master","suporte","financeiro"].includes(role)) return forbidden();
  if (cobranca.status !== "paga") return badRequest("Cobrança ainda não foi paga");

  const branding = await getSaasBranding();
  const cor = "#10b981"; // padrão; pode trocar por branding.cor_primaria depois

  const html = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<title>Comprovante — ${cobranca.titulo}</title>
<style>
  @media print { @page { margin: 1.5cm; } body { -webkit-print-color-adjust: exact; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 40px 20px; color: #1e293b; }
  .doc { max-width: 720px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,.08); overflow: hidden; }
  .hdr { background: linear-gradient(135deg, ${cor} 0%, ${cor}cc 100%); padding: 32px; color: white; text-align: center; }
  .hdr .logo { height: 48px; max-width: 200px; object-fit: contain; margin-bottom: 12px; }
  .hdr .marca { font-size: 14px; opacity: 0.9; font-weight: 500; }
  .hdr h1 { font-size: 26px; margin-top: 16px; letter-spacing: 0.5px; }
  .selo { display: inline-block; background: rgba(255,255,255,.2); border: 2px solid white; padding: 6px 16px; border-radius: 30px; font-size: 11px; font-weight: bold; letter-spacing: 1px; margin-top: 12px; }
  .body { padding: 32px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .field label { display: block; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px; }
  .field p { font-size: 14px; color: #0f172a; word-wrap: break-word; }
  .valor-box { background: ${cor}10; border: 2px solid ${cor}; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
  .valor-box .label { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: ${cor}; }
  .valor-box .valor { font-size: 36px; font-weight: 900; color: #0f172a; margin-top: 4px; }
  .valor-box .moeda { font-size: 18px; color: #64748b; margin-right: 6px; }
  hr { border: 0; border-top: 1px dashed #cbd5e1; margin: 24px 0; }
  .partes { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .parte { padding: 16px; background: #f8fafc; border-radius: 8px; border-left: 3px solid ${cor}; }
  .parte h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 8px; }
  .parte p { font-size: 13px; color: #1e293b; line-height: 1.5; }
  .parte strong { color: #0f172a; }
  .meta { background: #f8fafc; padding: 16px; border-radius: 8px; font-size: 11px; color: #64748b; font-family: monospace; }
  .meta div { margin: 2px 0; }
  .ftr { background: #0f172a; color: #cbd5e1; padding: 16px; font-size: 11px; text-align: center; }
  .ftr a { color: ${cor}; text-decoration: none; }
  .actions { text-align: center; padding: 20px; background: white; border-top: 1px solid #e2e8f0; }
  .actions button { background: ${cor}; color: white; border: 0; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; margin: 0 4px; }
  .actions button:hover { opacity: 0.9; }
  @media print { .actions { display: none; } body { background: white; padding: 0; } .doc { box-shadow: none; } }
</style>
</head><body>
  <div class="doc">
    <div class="hdr">
      ${branding.logo_url ? `<img class="logo" src="${branding.logo_url}" alt="${branding.nome ?? "Logo"}">` : ""}
      <div class="marca">${branding.nome ?? "Three Digital"}</div>
      <h1>${cobranca.titulo}</h1>
      <div class="selo">✓ COMPROVANTE DE PAGAMENTO</div>
    </div>
    <div class="body">
      ${cobranca.descricao ? `
      <div class="field">
        <label>Descrição</label>
        <p>${cobranca.descricao}</p>
      </div>
      <hr>` : ""}

      <div class="valor-box">
        <div class="label">Valor pago</div>
        <div class="valor"><span class="moeda">R$</span>${Number(cobranca.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
      </div>

      <div class="partes">
        <div class="parte">
          <h3>Recebido por (Contratada)</h3>
          <p><strong>${branding.razao_social ?? branding.nome ?? "Three Digital"}</strong>${branding.cnpj ? `<br>CNPJ: ${branding.cnpj}` : ""}${branding.endereco ? `<br>${branding.endereco}` : ""}${branding.email ? `<br>${branding.email}` : ""}</p>
        </div>
        <div class="parte">
          <h3>Pago por (Contratante)</h3>
          <p><strong>${cobranca.empresa_nome}</strong>${cobranca.empresa_cnpj ? `<br>CNPJ: ${cobranca.empresa_cnpj}` : ""}<br>${cobranca.empresa_endereco}</p>
        </div>
      </div>

      <hr>

      <div class="row">
        <div class="field">
          <label>Data do pagamento</label>
          <p>${cobranca.pago_em ? new Date(cobranca.pago_em).toLocaleString("pt-BR") : "—"}</p>
        </div>
        <div class="field">
          <label>Forma de pagamento</label>
          <p>${(cobranca.pago_via ?? "—").toUpperCase()}</p>
        </div>
      </div>

      <div class="meta">
        ${cobranca.mp_payment_id ? `<div>📌 ID da transação: <strong>${cobranca.mp_payment_id}</strong></div>` : ""}
        <div>📅 Vencimento original: ${new Date(cobranca.vencimento).toLocaleDateString("pt-BR")}</div>
        <div>🆔 Comprovante #${params.id.slice(0, 8).toUpperCase()}</div>
        ${cobranca.nota_fiscal_url ? `<div>📄 Nota fiscal: <a href="${cobranca.nota_fiscal_url}" target="_blank" style="color:${cor}">${cobranca.nota_fiscal_nome ?? "baixar"}</a></div>` : ""}
      </div>
    </div>
    <div class="actions">
      <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
      <button onclick="window.close()">Fechar</button>
    </div>
    <div class="ftr">
      © ${new Date().getFullYear()} ${branding.nome ?? "Three Digital"}${branding.site ? ` · <a href="${branding.site}">${branding.site.replace(/^https?:\/\//, "")}</a>` : ""}
      ${branding.whatsapp ? ` · WhatsApp ${branding.whatsapp}` : ""}
    </div>
  </div>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
