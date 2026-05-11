/**
 * POST /api/upload — Upload de imagens para MinIO
 *
 * Aceita multipart/form-data com campo "file".
 * Retorna URL pública da imagem.
 *
 * Auth: requer token de usuário (admin/gerente)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { ok, badRequest, forbidden, serverError } from "@/lib/utils/response";
import * as Minio from "minio";
import crypto from "crypto";

// Tipos de arquivo permitidos
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_MB   = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function getMinioClient(): Minio.Client {
  return new Minio.Client({
    endPoint:  process.env.MINIO_ENDPOINT  || "localhost",
    port:      parseInt(process.env.MINIO_PORT || "9000"),
    useSSL:    process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "",
    secretKey: process.env.MINIO_SECRET_KEY || "",
  });
}

function getPublicUrl(objectName: string): string {
  const bucket = process.env.MINIO_BUCKET || "cardapio";
  // MINIO_PUBLIC_URL is the external-facing base URL (e.g. https://s3.domain.com or http://host:9010)
  const publicBase = process.env.MINIO_PUBLIC_URL;
  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${bucket}/${objectName}`;
  }
  // Fallback: build from endpoint/port
  const endpoint = process.env.MINIO_ENDPOINT || "localhost";
  const port     = process.env.MINIO_PORT;
  const useSSL   = process.env.MINIO_USE_SSL === "true";
  const proto    = useSSL ? "https" : "http";
  const portPart = port && port !== "443" && port !== "80" ? `:${port}` : "";
  return `${proto}://${endpoint}${portPart}/${bucket}/${objectName}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;

  // Apenas roles com permissão de editar cardápio
  const allowedRoles = ["master","admin","gerente"];
  if (!allowedRoles.includes(role)) {
    return forbidden("Sem permissão para fazer upload");
  }

  // Parse multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return badRequest("Request deve ser multipart/form-data");
  }

  const file = formData.get("file") as File | null;
  if (!file) return badRequest("Campo 'file' obrigatório");

  // Validações
  if (!ALLOWED_TYPES.includes(file.type)) {
    return badRequest(`Tipo não permitido. Use: ${ALLOWED_TYPES.join(", ")}`);
  }

  if (file.size > MAX_SIZE_BYTES) {
    return badRequest(`Arquivo muito grande. Máximo: ${MAX_SIZE_MB}MB`);
  }

  // Gera nome único
  const ext       = file.type.split("/")[1].replace("jpeg", "jpg");
  const hash      = crypto.randomBytes(8).toString("hex");
  const folder    = empresaId ? `empresa/${empresaId}` : "public";
  const objectName = `${folder}/${Date.now()}-${hash}.${ext}`;
  const bucket    = process.env.MINIO_BUCKET || "cardapio";

  try {
    const client = getMinioClient();

    // Garante que o bucket existe
    const exists = await client.bucketExists(bucket).catch(() => false);
    if (!exists) {
      await client.makeBucket(bucket, "us-east-1");
      // Torna o bucket público para leitura
      await client.setBucketPolicy(bucket, JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect:    "Allow",
          Principal: { AWS: ["*"] },
          Action:    ["s3:GetObject"],
          Resource:  [`arn:aws:s3:::${bucket}/*`],
        }],
      }));
    }

    // Converte File para Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload
    await client.putObject(bucket, objectName, buffer, buffer.length, {
      "Content-Type": file.type,
      "x-amz-acl":   "public-read",
    });

    const url = getPublicUrl(objectName);

    return ok({
      url,
      objectName,
      size:     file.size,
      mimeType: file.type,
    });
  } catch (err) {
    console.error("[Upload/POST]", err);
    // Se MinIO não está configurado, retorna erro amigável
    if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
      return serverError("Serviço de armazenamento indisponível");
    }
    return serverError("Falha no upload da imagem");
  }
}
