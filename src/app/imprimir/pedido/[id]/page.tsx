/**
 * /imprimir/pedido/[id]?tipo=cliente|cozinha|comanda&token=JWT
 *
 * Página HTML otimizada para impressoras térmicas de 80mm.
 * Auto-imprime ao carregar (window.print + window.close depois).
 *
 * Tipos de cupom:
 *   - cliente:  não-fiscal completo (itens + totais + pagamento)
 *   - cozinha:  só itens com qty + observações em destaque (sem preços)
 *   - comanda:  pré-conta para mesa (itens detalhados, total parcial)
 *
 * O token JWT vem na query string porque o popup não compartilha cookies/headers
 * com a janela admin. Servidor valida e renderiza.
 */
import { headers } from "next/headers";
import { queryOne, query } from "@/lib/db/client";
import { verifyAccessToken } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

interface PedidoData {
  id: string; numero: number; tipo: string; status: string;
  total: string; subtotal: string; desconto: string; taxa_entrega: string;
  cliente_nome: string | null; cliente_telefone: string | null;
  observacoes: string | null;
  forma_pagamento: string | null;
  mesa_numero: number | null;
  empresa_id: string;
  criado_em: string;
}
interface ItemData {
  id: string; nome: string; quantidade: number;
  preco_unitario: string; subtotal: string;
  observacoes: string | null;
  adicionais: Array<{ grupo_nome?: string; opcao_nome?: string; preco_extra?: number }>;
}
interface EmpresaData {
  nome_fantasia: string; cnpj: string | null;
  endereco: string | null; whatsapp: string | null;
}

function fmtBRL(v: number | string) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TIPO_LABEL: Record<string, string> = {
  mesa: "MESA", balcao: "BALCÃO", delivery: "DELIVERY",
  totem: "AUTOATENDIMENTO", whatsapp: "WHATSAPP", app: "APP",
};

export default async function ImprimirPedidoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tipo?: string; token?: string };
}) {
  const tipo = (searchParams.tipo ?? "cliente") as "cliente" | "cozinha" | "comanda";

  // Auth via query token (popup não tem localStorage da janela admin direto)
  let empresaId: string | null = null;
  try {
    const token = searchParams.token ?? "";
    if (!token) throw new Error("token ausente");
    const payload = await verifyAccessToken(token);
    empresaId = payload.empresaId ?? null;
  } catch {
    return <ErroAuth />;
  }
  if (!empresaId) return <ErroAuth />;

  // Busca pedido + empresa + itens
  const pedido = await queryOne<PedidoData>(
    `SELECT p.id, p.numero, p.tipo, p.status,
            p.total, p.subtotal, p.desconto,
            COALESCE(p.taxa_entrega, 0) AS taxa_entrega,
            p.cliente_nome, p.cliente_telefone, p.observacoes,
            p.forma_pagamento, m.numero AS mesa_numero,
            p.empresa_id,
            p.created_at AS criado_em
     FROM pedidos p
     LEFT JOIN mesas m ON m.id = p.mesa_id
     WHERE p.id = $1 AND p.empresa_id = $2 AND p.deleted_at IS NULL`,
    [params.id, empresaId]
  );
  if (!pedido) return <ErroPedido />;

  const empresa = await queryOne<EmpresaData>(
    `SELECT nome_fantasia, cnpj, NULL::text AS endereco, whatsapp
     FROM empresas WHERE id = $1`,
    [empresaId]
  );

  const itens = await query<ItemData>(
    `SELECT id, nome, quantidade, preco_unitario, subtotal, observacoes,
            COALESCE(adicionais, '[]'::jsonb) AS adicionais
     FROM pedido_itens WHERE pedido_id = $1 ORDER BY created_at ASC`,
    [params.id]
  );

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <title>Pedido #{pedido.numero} — {tipo}</title>
        <style>{cssCupom}</style>
      </head>
      <body>
        <div className="cupom">
          <Cabecalho empresa={empresa} pedido={pedido} tipo={tipo} />
          <Corpo pedido={pedido} itens={itens} tipo={tipo} />
          {tipo !== "cozinha" && <Totais pedido={pedido} />}
          <Rodape tipo={tipo} />
        </div>

        {/* Auto-print + auto-close */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                setTimeout(function() {
                  window.print();
                  setTimeout(function() {
                    if (window.opener) window.close();
                  }, 1000);
                }, 200);
              });
            `,
          }}
        />
      </body>
    </html>
  );
}

// ── Componentes ──────────────────────────────────────────────────────────────

function Cabecalho({
  empresa, pedido, tipo,
}: {
  empresa: EmpresaData | null;
  pedido: PedidoData;
  tipo: string;
}) {
  return (
    <>
      <div className="center bold large">{empresa?.nome_fantasia ?? "Restaurante"}</div>
      {empresa?.cnpj && <div className="center small">CNPJ {empresa.cnpj}</div>}
      <hr />

      <div className="center bold">
        {tipo === "cozinha"  ? "═══ COZINHA ═══" :
         tipo === "comanda"  ? "─── COMANDA ───" :
         "CUPOM NÃO-FISCAL"}
      </div>

      <div className="line">
        <span className="bold">PEDIDO #{pedido.numero}</span>
        <span>{TIPO_LABEL[pedido.tipo] ?? pedido.tipo.toUpperCase()}</span>
      </div>

      {pedido.mesa_numero && (
        <div className="line">
          <span>Mesa</span>
          <span className="bold">{pedido.mesa_numero}</span>
        </div>
      )}

      {pedido.cliente_nome && (
        <div className="line">
          <span>Cliente</span>
          <span>{pedido.cliente_nome}</span>
        </div>
      )}

      <div className="line small">
        <span>Data</span>
        <span>{fmtDateTime(pedido.criado_em)}</span>
      </div>
      <hr />
    </>
  );
}

function Corpo({
  pedido, itens, tipo,
}: {
  pedido: PedidoData;
  itens: ItemData[];
  tipo: string;
}) {
  return (
    <div className="itens">
      {itens.map((item) => {
        // Agrupa adicionais por grupo
        const grupos: Record<string, string[]> = {};
        (item.adicionais ?? []).forEach((ad) => {
          const k = ad.grupo_nome ?? "Opções";
          if (!grupos[k]) grupos[k] = [];
          if (ad.opcao_nome) grupos[k].push(ad.opcao_nome);
        });
        return (
          <div key={item.id} className="item">
            <div className="line">
              <span className={tipo === "cozinha" ? "bold large" : "bold"}>
                {item.quantidade}× {item.nome}
              </span>
              {tipo !== "cozinha" && (
                <span>{fmtBRL(item.subtotal)}</span>
              )}
            </div>
            {Object.entries(grupos).map(([g, ops]) => (
              <div key={g} className={tipo === "cozinha" ? "small bold" : "small"}>
                {"  → "}{g}: {ops.join(", ")}
              </div>
            ))}
            {item.observacoes && (
              <div className={`small italic ${tipo === "cozinha" ? "bold" : ""}`}>
                {"  ⚠ "}{item.observacoes}
              </div>
            )}
          </div>
        );
      })}

      {pedido.observacoes && (
        <>
          <hr />
          <div className={`small ${tipo === "cozinha" ? "bold" : "italic"}`}>
            <strong>Obs. geral:</strong> {pedido.observacoes}
          </div>
        </>
      )}
    </div>
  );
}

function Totais({ pedido }: { pedido: PedidoData }) {
  const subtotal = Number(pedido.subtotal);
  const desconto = Number(pedido.desconto);
  const taxa     = Number(pedido.taxa_entrega);
  const total    = Number(pedido.total);
  return (
    <>
      <hr />
      <div className="line">
        <span>Subtotal</span>
        <span>{fmtBRL(subtotal)}</span>
      </div>
      {desconto > 0 && (
        <div className="line">
          <span>Desconto</span>
          <span>−{fmtBRL(desconto)}</span>
        </div>
      )}
      {taxa > 0 && (
        <div className="line">
          <span>Taxa de entrega</span>
          <span>{fmtBRL(taxa)}</span>
        </div>
      )}
      <div className="line bold large">
        <span>TOTAL</span>
        <span>{fmtBRL(total)}</span>
      </div>
      {pedido.forma_pagamento && (
        <div className="line bold">
          <span>Pagamento</span>
          <span>{pedido.forma_pagamento.toUpperCase()}</span>
        </div>
      )}
    </>
  );
}

function Rodape({ tipo }: { tipo: string }) {
  return (
    <>
      <hr />
      <div className="center small">
        {tipo === "cozinha" ? "PREPARAR COM ATENÇÃO" :
         tipo === "comanda" ? "PRÉ-CONTA · NÃO É CUPOM FISCAL" :
         "Obrigado pela preferência!"}
      </div>
      <div className="center small">
        impresso em {fmtDateTime(new Date().toISOString())}
      </div>
      <div className="spacer" />
    </>
  );
}

function ErroAuth() {
  return (
    <html><body>
      <div style={{ padding: 40, fontFamily: "monospace", textAlign: "center" }}>
        <h1>Token inválido ou expirado</h1>
        <p>Reabra a impressão no painel.</p>
      </div>
    </body></html>
  );
}

function ErroPedido() {
  return (
    <html><body>
      <div style={{ padding: 40, fontFamily: "monospace", textAlign: "center" }}>
        <h1>Pedido não encontrado</h1>
      </div>
    </body></html>
  );
}

// ─── CSS para impressora térmica de 80mm ──────────────────────────────────────

const cssCupom = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff; color: #000;
    font-family: 'Courier New', Consolas, monospace;
    font-size: 11px; line-height: 1.3;
  }
  .cupom {
    width: 76mm; padding: 2mm;
    margin: 0 auto;
  }
  hr {
    border: none; border-top: 1px dashed #000;
    margin: 4px 0;
  }
  .center { text-align: center; }
  .bold   { font-weight: 700; }
  .small  { font-size: 10px; }
  .large  { font-size: 14px; }
  .italic { font-style: italic; }
  .line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    margin: 1px 0;
  }
  .item    { margin: 4px 0; }
  .itens   { margin: 4px 0; }
  .spacer  { height: 20mm; }

  /* Tela: simula a largura para preview */
  @media screen {
    body { background: #444; padding: 20px; }
    .cupom {
      background: #fff;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      min-height: 200mm;
      padding: 6mm;
    }
  }

  @media print {
    body { background: #fff; padding: 0; }
    .cupom { box-shadow: none; padding: 2mm; }
  }
`;
