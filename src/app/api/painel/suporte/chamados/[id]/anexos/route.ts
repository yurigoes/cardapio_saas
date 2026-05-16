/**
 * POST /api/painel/suporte/chamados/[id]/anexos
 * Body: multipart/form-data com campo 'file' (uma imagem/doc por vez)
 * OU JSON { dataUrl, nome } pra upload via Ctrl+V (paste de print)
 *
 * Salva no MinIO + cria mensagem no chat com anexo embed.
 * Retorna { url, mensagem_id }.
 */
import { NextRequest } from "next/server";
import * as Minio from "minio";
import crypto from "crypto";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

function minioClient() {
  return new Minio.Client({
    endPoint:  process.env.MINIO_ENDPOINT  || "localhost",
    port:      parseInt(process.env.MINIO_PORT || "9000"),
    useSSL:    process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "",
    secretKey: process.env.MINIO_SECRET_KEY || "",
  });
}

const BUCKET = process.env.MINIO_BUCKET || "cardapio";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, sub, role } = auth.payload;

  // Verifica acesso ao chamado
  const isAgent = role === "master" || role === "suporte";
  const chamado = await queryOne<{ id: string }>(
    `SELECT id FROM suporte_chamados
      WHERE id = $1 ${!isAgent ? "AND empresa_id = $2" : ""}`,
    !isAgent ? [params.id, empresaId] : [params.id]
  ).catch(() => null);
  if (!chamado) return notFound("Chamado não encontrado");

  let buffer: Buffer;
  let mime:   string;
  let nome:   string;

  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      // Paste (Ctrl+V): JSON com { dataUrl, nome }
      const body = await req.json();
      const dataUrl = String(body.dataUrl || "");
      const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (!m) return badRequest("dataUrl inválido");
      mime   = m[1];
      buffer = Buffer.from(m[2], "base64");
      nome   = String(body.nome || `paste-${Date.now()}.png`);
    } else {
      // multipart/form-data
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return badRequest("Campo 'file' obrigatório");
      buffer = Buffer.from(await file.arrayBuffer());
      mime   = file.type || "application/octet-stream";
      nome   = file.name || `arquivo-${Date.now()}`;
    }

    if (!ALLOWED_TYPES.includes(mime)) {
      return badRequest(`Tipo não permitido: ${mime}`);
    }
    if (buffer.length > MAX_SIZE) {
      return badRequest(`Arquivo muito grande (máx ${MAX_SIZE / 1024 / 1024}MB)`);
    }

    // Gera nome único
    const ext = nome.split(".").pop() || mime.split("/")[1] || "bin";
    const objectName = `suporte-anexos/${params.id}/${crypto.randomUUID()}.${ext}`;

    // Upload pro MinIO
    const m = minioClient();
    const exists = await m.bucketExists(BUCKET).catch(() => false);
    if (!exists) await m.makeBucket(BUCKET).catch(() => {});
    await m.putObject(BUCKET, objectName, buffer, buffer.length, { "Content-Type": mime });

    const url = `/api/pub/media/${BUCKET}/${objectName}`;

    // Cria mensagem com anexo embed
    const operador = await queryOne<{ nome: string }>(
      `SELECT nome FROM usuarios WHERE id = $1`, [sub]
    );
    const autorTipo = isAgent ? "agente" : "cliente";

    // Texto: pra imagem, mostra "[imagem]"; pra outros, nome do arquivo
    const ehImagem = mime.startsWith("image/");
    const textoMsg = ehImagem ? "📎 (imagem)" : `📎 ${nome}`;

    const msg = await queryOne<{ id: string }>(
      `INSERT INTO suporte_mensagens
         (chamado_id, autor_id, autor_tipo, autor_nome, texto, anexos)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id`,
      [params.id, sub, autorTipo, operador?.nome ?? "?", textoMsg,
       JSON.stringify([{ url, nome, mime, tamanho: buffer.length }])]
    );

    // Log na tabela de anexos
    await queryOne(
      `INSERT INTO suporte_anexos (mensagem_id, chamado_id, url, nome_original, mime, tamanho_bytes, uploaded_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [msg?.id, params.id, url, nome, mime, buffer.length, sub]
    ).catch(() => {});

    // Atualiza chamado
    await queryOne(
      `UPDATE suporte_chamados SET ultima_msg_em = NOW(), ultima_msg_por = $1, atualizado_em = NOW()
        WHERE id = $2`,
      [sub, params.id]
    ).catch(() => {});

    return ok({ url, mensagem_id: msg?.id, mime, nome, tamanho: buffer.length });
  } catch (err) {
    console.error("[Anexo/upload]", err);
    return serverError(err instanceof Error ? err.message : "erro upload");
  }
}
