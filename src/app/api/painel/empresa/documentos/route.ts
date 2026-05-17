/**
 * GET  /api/painel/empresa/documentos  → lista documentos da empresa do usuário logado
 * POST /api/painel/empresa/documentos  → upload novo documento (multipart, campo 'file' + 'tipo')
 *
 * Tipos válidos: cnpj | identidade_frente | identidade_verso | selfie_com_documento
 *                contrato_social | comprovante_endereco | outro
 */
import { NextRequest } from "next/server";
import * as Minio from "minio";
import crypto from "crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, serverError, forbidden } from "@/lib/utils/response";

const TIPOS_VALIDOS = [
  "cnpj","identidade_frente","identidade_verso","selfie_com_documento",
  "contrato_social","comprovante_endereco","outro",
];
const ALLOWED_TYPES = ["image/jpeg","image/png","image/webp","application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

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

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const rows = await query(
      `SELECT id, tipo, nome_arquivo, url, tamanho, mime,
              validado, validado_em, observacao, created_at
         FROM empresa_documentos
        WHERE empresa_id = $1
        ORDER BY created_at DESC`,
      [empresaId]
    );
    return ok(rows);
  } catch (err) {
    console.error("[Empresa/Docs/GET]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const form = await req.formData();
    const file = form.get("file");
    const tipo = String(form.get("tipo") ?? "outro");
    if (!(file instanceof File)) return badRequest("Campo 'file' obrigatório");
    if (!TIPOS_VALIDOS.includes(tipo)) return badRequest(`Tipo inválido: ${tipo}`);

    const buf  = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.includes(mime)) return badRequest(`Tipo MIME não permitido: ${mime}`);
    if (buf.length > MAX_SIZE) return badRequest(`Arquivo muito grande (máx ${MAX_SIZE/1024/1024}MB)`);

    const ext = (file.name.split(".").pop() || mime.split("/")[1] || "bin").toLowerCase();
    const objectName = `empresa-docs/${empresaId}/${tipo}-${crypto.randomUUID()}.${ext}`;

    const m = mc();
    const exists = await m.bucketExists(BUCKET).catch(() => false);
    if (!exists) await m.makeBucket(BUCKET).catch(() => {});
    await m.putObject(BUCKET, objectName, buf, buf.length, { "Content-Type": mime });

    const url = `/api/pub/media/${BUCKET}/${objectName}`;

    const doc = await queryOne<{ id: string }>(
      `INSERT INTO empresa_documentos
         (empresa_id, tipo, nome_arquivo, url, tamanho, mime, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [empresaId, tipo, file.name, url, buf.length, mime, sub]
    );

    // Marca cadastro como em_analise se ainda estava pendente
    await queryOne(
      `UPDATE empresas
          SET cadastro_status = 'em_analise', updated_at = NOW()
        WHERE id = $1 AND cadastro_status = 'pendente'`,
      [empresaId]
    ).catch(() => {});

    return ok({ id: doc?.id, url, tipo, nome: file.name });
  } catch (err) {
    console.error("[Empresa/Docs/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
