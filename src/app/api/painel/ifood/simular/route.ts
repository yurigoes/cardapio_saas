/**
 * POST /api/painel/ifood/simular
 *
 * Cria um pedido fake como se viesse do iFood — bypassa a API do iFood,
 * vai direto pro importer. Útil pra testar fluxo (impressão, cozinha,
 * notificações) sem precisar do portal sandbox iFood.
 *
 * Body: { items?: [{ nome, qty, preco }], cliente_nome?, cliente_telefone?,
 *         endereco?, total?, mode?: "delivery" | "takeout" }
 *
 * Retorna pedido_id criado + número do pedido interno.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { importarPedidoIfood } from "@/lib/ifood/import-pedido";

const ALLOWED = ["master", "admin"];

const itemSchema = z.object({
  nome:  z.string().min(1).max(200),
  qty:   z.number().int().min(1).max(99),
  preco: z.number().min(0).max(9999),
});

const schema = z.object({
  items: z.array(itemSchema).min(1).optional(),
  cliente_nome:     z.string().max(200).optional(),
  cliente_telefone: z.string().max(30).optional(),
  endereco_rua:     z.string().max(200).optional(),
  endereco_numero:  z.string().max(20).optional(),
  endereco_bairro:  z.string().max(100).optional(),
  endereco_cidade:  z.string().max(100).optional(),
  mode: z.enum(["delivery", "takeout"]).optional().default("delivery"),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json().catch(() => ({}))); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  // Defaults pra teste rápido
  const items = body.items ?? [
    { nome: "X-Burger Especial",  qty: 1, preco: 28.90 },
    { nome: "Batata frita média", qty: 1, preco: 14.90 },
    { nome: "Coca-Cola lata",     qty: 2, preco: 6.50 },
  ];
  const subtotal = items.reduce((a, i) => a + i.preco * i.qty, 0);
  const taxaEntrega = body.mode === "delivery" ? 8.0 : 0;

  // Monta payload no formato iFood IOrderDetail
  const fakeId = `SIM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const displayId = String(Math.floor(1000 + Math.random() * 9000));

  const payload = {
    id:        fakeId,
    displayId,
    customer: {
      name:  body.cliente_nome     ?? "Cliente Simulado",
      phone: body.cliente_telefone ?? "11999999999",
    },
    items: items.map(i => ({
      name:      i.nome,
      quantity:  i.qty,
      unitPrice: { value: i.preco, currency: "BRL" },
      totalPrice: { value: i.preco * i.qty, currency: "BRL" },
    })),
    total: {
      orderAmount: { value: subtotal + taxaEntrega, currency: "BRL" },
      subTotal:    { value: subtotal, currency: "BRL" },
      deliveryFee: { value: taxaEntrega, currency: "BRL" },
    },
    delivery: body.mode === "delivery" ? {
      mode: "DEFAULT",
      deliveredBy: "MERCHANT",
      deliveryAddress: {
        streetName:   body.endereco_rua    ?? "Rua de Teste",
        streetNumber: body.endereco_numero ?? "123",
        neighborhood: body.endereco_bairro ?? "Centro",
        city:         body.endereco_cidade ?? "São Paulo",
        state:        "SP",
        country:      "BR",
        formattedAddress: `${body.endereco_rua ?? "Rua de Teste"}, ${body.endereco_numero ?? "123"}`,
      },
    } : undefined,
    takeout: body.mode === "takeout" ? { mode: "DEFAULT" } : undefined,
    payments: {
      methods: [{ type: "ONLINE", method: "CREDIT", value: subtotal + taxaEntrega }],
    },
    createdAt: new Date().toISOString(),
    isTest: true,
  };

  try {
    // Salva evento simulado
    const evId = `SIM-EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await queryOne(
      `INSERT INTO ifood_eventos
         (empresa_id, evento_id, tipo, pedido_ifood_id, payload)
       VALUES ($1, $2, 'PLACED', $3, $4::jsonb)
       ON CONFLICT (empresa_id, evento_id) DO NOTHING`,
      [empresaId, evId, fakeId, JSON.stringify({ id: evId, code: "PLACED", orderId: fakeId, createdAt: new Date().toISOString() })]
    );

    // Importa pedido
    const r = await importarPedidoIfood(empresaId, payload);

    // Marca evento como processado
    await queryOne(
      `UPDATE ifood_eventos SET pedido_id = $1, processado_em = NOW(), ack_em = NOW()
        WHERE empresa_id = $2 AND evento_id = $3`,
      [r.pedido_id, empresaId, evId]
    );

    return ok({
      simulado:        true,
      pedido_id:       r.pedido_id,
      pedido_numero:   r.numero,
      ifood_order_id:  fakeId,
      display_id:      displayId,
      mensagem:        `✓ Pedido SIMULADO #${r.numero} criado. Cheque /painel/pedidos e a impressora.`,
    });
  } catch (err) {
    console.error("[Ifood/Simular]", err);
    return serverError(err instanceof Error ? err.message : "erro ao simular");
  }
}
