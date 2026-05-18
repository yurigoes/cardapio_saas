/**
 * POST   /api/admin/mensalidades/[id]/nota-fiscal  — upload NF (multipart 'file')
 * DELETE /api/admin/mensalidades/[id]/nota-fiscal  — remove NF
 *
 * Funciona pra mensalidades e cobranças avulsas (?tipo=avulsa)
 */
import { NextRequest } from "next/server";
import * as Minio from "minio";
import crypto from "crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "financeiro"];
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "application/xml", "text/xml"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function mc() {
  return new Minio.Client({
    endPoint:  process.env.MINIO_ENDPOINT  || "localhost",
    port:      parseInt(process.env.MINIO_PORT || "9000"),
    useSSL:    process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "",
    secretKey: process.env.MINIO_SECRET_KEY || "",
  });
}
const BUCKET = process.env.MINIO_BUCKET || "cardapio";

function tableFromTipo(tipo: string) {
  return tipo === "avulsa" ? "cobrancas_avulsas" : "mensalidades";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  const tipo = req.nextUrl.searchParams.get("tipo") ?? "mensalidade";
  const tbl = tableFromTipo(tipo);

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Campo 'file' obrigatório");
    const buf  = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/pdf";
    if (!ALLOWED_TYPES.includes(mime)) return badRequest(`Tipo não permitido: ${mime}`);
    if (buf.length > MAX_SIZE) return badRequest("Arquivo muito grande (máx 5MB)");

    const cobranca = await queryOne<{ empresa_id: string }>(
      `SELECT empresa_id FROM ${tbl} WHERE id = $1`, [params.id]
    );
    if (!cobranca) return notFound();

    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const objectName = `notas-fiscais/${cobranca.empresa_id}/${tipo}-${params.id}-${crypto.randomUUID()}.${ext}`;

    const m = mc();
    const exists = await m.bucketExists(BUCKET).catch(() => false);
    if (!exists) await m.makeBucket(BUCKET).catch(() => {});
    await m.putObject(BUCKET, objectName, buf, buf.length, { "Content-Type": mime });

    const url = `/api/pub/media/${BUCKET}/${objectName}`;

    await queryOne(
      `UPDATE ${tbl}
          SET nota_fiscal_url  = $1,
              nota_fiscal_nome = $2,
              nota_fiscal_em   = NOW(),
              nota_fiscal_por  = $3,
              atualizado_em    = NOW()
        WHERE id = $4`,
      [url, file.name, auth.payload.sub, params.id]
    );

    return ok({ url, nome: file.name });
  } catch (err) {
    console.error("[NF/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  const tipo = req.nextUrl.searchParams.get("tipo") ?? "mensalidade";
  const tbl = tableFromTipo(tipo);

  try {
    await queryOne(
      `UPDATE ${tbl}
          SET nota_fiscal_url  = NULL,
              nota_fiscal_nome = NULL,
              nota_fiscal_em   = NULL,
              nota_fiscal_por  = NULL,
              atualizado_em    = NOW()
        WHERE id = $1`,
      [params.id]
    );
    return ok({ removida: true });
  } catch (err) {
    console.error("[NF/DELETE]", err);
    return serverError();
  }
}
