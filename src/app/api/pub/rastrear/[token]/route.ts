/**
 * GET /api/pub/rastrear/[token]
 *
 * Endpoint público para o cliente acompanhar a entrega do seu pedido.
 * Token único por pedido (gerado em pub/pedidos quando tipo=delivery).
 *
 * Retorna: dados do pedido + endereço destino + última localização do motoboy.
 *
 * Sem auth — token funciona como bearer.
 */
import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db/client";
import { ok, notFound, serverError } from "@/lib/utils/response";

interface RastreioRow {
  id:               string;
  numero:           number | null;
  status:           string;
  status_entrega:   string | null;
  cliente_nome:     string | null;
  cliente_endereco: Record<string, unknown> | null;
  total:            string;
  atribuido_em:     string | null;
  coletado_em:      string | null;
  entregue_em:      string | null;

  empresa_nome:     string;
  empresa_lat:      string | null;
  empresa_lng:      string | null;
  empresa_whatsapp: string | null;

  motoboy_id:       string | null;
  motoboy_nome:     string | null;
  motoboy_telefone: string | null;
  motoboy_lat:      string | null;
  motoboy_lng:      string | null;
  motoboy_loc_em:   string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  if (!params.token || params.token.length < 10) {
    return notFound("Token inválido");
  }

  try {
    const row = await queryOne<RastreioRow>(
      `SELECT p.id, p.numero, p.status, p.status_entrega, p.cliente_nome,
              p.cliente_endereco, p.total,
              p.atribuido_em::text, p.coletado_em::text, p.entregue_em::text,
              e.nome_fantasia       AS empresa_nome,
              e.endereco_lat::text  AS empresa_lat,
              e.endereco_lng::text  AS empresa_lng,
              e.whatsapp            AS empresa_whatsapp,
              p.motoboy_id,
              m.nome                AS motoboy_nome,
              m.telefone            AS motoboy_telefone,
              m.lat_atual::text     AS motoboy_lat,
              m.lng_atual::text     AS motoboy_lng,
              m.localizado_em::text AS motoboy_loc_em
         FROM pedidos p
         JOIN empresas e ON e.id = p.empresa_id
         LEFT JOIN motoboys m ON m.id = p.motoboy_id
        WHERE p.tracking_token = $1 AND p.deleted_at IS NULL`,
      [params.token]
    );

    if (!row) return notFound("Pedido não encontrado");

    return ok({
      pedido: {
        id:             row.id,
        numero:         row.numero,
        status:         row.status,
        status_entrega: row.status_entrega,
        cliente_nome:   row.cliente_nome,
        endereco:       row.cliente_endereco,
        total:          Number(row.total),
        atribuido_em:   row.atribuido_em,
        coletado_em:    row.coletado_em,
        entregue_em:    row.entregue_em,
      },
      empresa: {
        nome:     row.empresa_nome,
        whatsapp: row.empresa_whatsapp,
        lat:      row.empresa_lat ? Number(row.empresa_lat) : null,
        lng:      row.empresa_lng ? Number(row.empresa_lng) : null,
      },
      motoboy: row.motoboy_id ? {
        id:       row.motoboy_id,
        nome:     row.motoboy_nome,
        telefone: row.motoboy_telefone,
        lat:      row.motoboy_lat ? Number(row.motoboy_lat) : null,
        lng:      row.motoboy_lng ? Number(row.motoboy_lng) : null,
        atualizado_em: row.motoboy_loc_em,
      } : null,
    });
  } catch (err) {
    console.error("[Pub/Rastrear]", err);
    return serverError();
  }
}
