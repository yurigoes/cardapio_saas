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
import sharp from "sharp";

// Tipos de arquivo permitidos
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_MB   = 10;                    // raw upload (antes de compressão)
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_DIMENSION = 1600;                   // px (lado maior)
const WEBP_QUALITY  = 80;

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
  // Always use the internal proxy route so browsers can load images
  // regardless of MinIO's network location
  return `/api/pub/media/${bucket}/${objectName}`;
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

  const hash      = crypto.randomBytes(8).toString("hex");
  const folder    = empresaId ? `empresa/${empresaId}` : "public";
  const bucket    = process.env.MINIO_BUCKET || "cardapio";

  try {
    // Converte File para Buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // ── Compressão e conversão para WebP ────────────────────────────────────
    // GIFs animados não são convertidos (perderiam animação) — só comprimidos.
    let outputBuffer: Buffer;
    let outputType:   string;
    let outputExt:    string;

    if (file.type === "image/gif") {
      // GIF preserva (pode ser animado); só limita tamanho lateral
      outputBuffer = await sharp(inputBuffer, { animated: true })
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .gif()
        .toBuffer();
      outputType = "image/gif";
      outputExt  = "gif";
    } else {
      // JPEG/PNG/WebP → WebP otimizado
      outputBuffer = await sharp(inputBuffer)
        .rotate()                    // respeita EXIF orientation
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      outputType = "image/webp";
      outputExt  = "webp";
    }

    const objectName = `${folder}/${Date.now()}-${hash}.${outputExt}`;
    const client = getMinioClient();

    // Garante que o bucket existe
    const exists = await client.bucketExists(bucket).catch(() => false);
    if (!exists) {
      await client.makeBucket(bucket, "us-east-1");
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

    // Upload do buffer já comprimido
    await client.putObject(bucket, objectName, outputBuffer, outputBuffer.length, {
      "Content-Type":  outputType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-amz-acl":     "public-read",
    });

    const url = getPublicUrl(objectName);
    const economiaPct = Math.round((1 - outputBuffer.length / inputBuffer.length) * 100);

    return ok({
      url,
      objectName,
      size_original:    inputBuffer.length,
      size_otimizado:   outputBuffer.length,
      economia_pct:     Math.max(0, economiaPct),
      mime_type:        outputType,
    });
  } catch (err) {
    console.error("[Upload/POST]", err);
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND") {
      return serverError(
        `Serviço de armazenamento indisponível (host: ${process.env.MINIO_ENDPOINT}). ` +
        `Verifique se o container do MinIO está rodando e acessível pelo nome configurado em MINIO_ENDPOINT.`
      );
    }
    if (err instanceof Error && err.message.includes("unsupported")) {
      return badRequest("Formato de imagem não suportado ou arquivo corrompido");
    }
    return serverError("Falha no upload da imagem");
  }
}
