/**
 * Re-compressão em lote de imagens já enviadas para MinIO.
 *
 * Para cada imagem-alvo (produtos.imagem_url, empresas.logo_url, banner_url):
 *   1. Pula se URL externa (https://images.unsplash.com etc) — só toca arquivos nossos
 *   2. Pula se já é .webp E está dentro do limite de tamanho (compressão duplicada não ajuda)
 *   3. Baixa do MinIO, comprime via sharp (mesmas opções do upload), grava como novo .webp
 *   4. UPDATE da row para apontar pro novo arquivo
 *   5. Mantém o arquivo original (não deleta — segurança caso algo dê errado)
 *
 * Idempotente — rodar duas vezes não quebra nada (segunda execução pula tudo).
 *
 * Uso direto (CLI): `npx tsx scripts/recomprimir-imagens.ts [--apply] [--empresa <id>]`
 * Uso via API:      `POST /api/admin/imagens/recomprimir` (master only)
 */
import sharp from "sharp";
import crypto from "crypto";
import * as Minio from "minio";
import { query } from "@/lib/db/client";

const MAX_DIMENSION = 1600;
const WEBP_QUALITY  = 80;

// Apenas re-comprime se ARQUIVO ORIGINAL maior que isto E não-webp,
// OU se webp mas acima de 500KB (provavelmente upload antigo sem otimizar)
const MIN_BYTES_TO_RECOMPRESS_NONWEBP = 50 * 1024;
const MIN_BYTES_TO_RECOMPRESS_WEBP    = 500 * 1024;

export interface RecompressTarget {
  table:  "produtos" | "empresas";
  column: "imagem_url" | "logo_url" | "banner_url";
  id:     string;
  url:    string;
  empresa_id: string | null;
}

export interface RecompressResult {
  table:  string;
  column: string;
  id:     string;
  status: "ok" | "skipped" | "error";
  reason?: string;
  size_antes?:  number;
  size_depois?: number;
  url_antes?:  string;
  url_depois?: string;
}

function getMinioClient(): Minio.Client {
  return new Minio.Client({
    endPoint:  process.env.MINIO_ENDPOINT  || "localhost",
    port:      parseInt(process.env.MINIO_PORT || "9000"),
    useSSL:    process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "",
    secretKey: process.env.MINIO_SECRET_KEY || "",
  });
}

/** Extrai bucket + objectName de URL no formato /api/pub/media/{bucket}/{path} */
function parseInternalUrl(url: string): { bucket: string; objectName: string } | null {
  const m = url.match(/\/api\/pub\/media\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { bucket: m[1], objectName: m[2] };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Lista todos os candidatos a re-compressão */
export async function listarCandidatos(empresaId?: string): Promise<RecompressTarget[]> {
  const targets: RecompressTarget[] = [];
  const empresaFilter = empresaId ? "AND empresa_id = $1" : "";
  const params = empresaId ? [empresaId] : [];

  const produtos = await query<{ id: string; imagem_url: string; empresa_id: string }>(
    `SELECT id, imagem_url, empresa_id
       FROM produtos
      WHERE imagem_url IS NOT NULL AND imagem_url <> ''
        AND deleted_at IS NULL
        ${empresaFilter}`,
    params
  );
  for (const p of produtos) {
    targets.push({ table: "produtos", column: "imagem_url", id: p.id, url: p.imagem_url, empresa_id: p.empresa_id });
  }

  const empresaWhere = empresaId ? "AND id = $1" : "";
  const empresas = await query<{ id: string; logo_url: string | null; banner_url: string | null }>(
    `SELECT id, logo_url, banner_url
       FROM empresas
      WHERE deleted_at IS NULL
        AND (logo_url IS NOT NULL OR banner_url IS NOT NULL)
        ${empresaWhere}`,
    params
  );
  for (const e of empresas) {
    if (e.logo_url)   targets.push({ table: "empresas", column: "logo_url",   id: e.id, url: e.logo_url,   empresa_id: e.id });
    if (e.banner_url) targets.push({ table: "empresas", column: "banner_url", id: e.id, url: e.banner_url, empresa_id: e.id });
  }

  return targets;
}

/**
 * Processa um único alvo. Em modo dry-run, faz tudo exceto UPDATE/PUT.
 */
export async function recomprimirAlvo(t: RecompressTarget, dryRun: boolean): Promise<RecompressResult> {
  const base = { table: t.table, column: t.column, id: t.id };

  // 1. URL externa? pula
  const parsed = parseInternalUrl(t.url);
  if (!parsed) {
    return { ...base, status: "skipped", reason: "url externa", url_antes: t.url };
  }

  const { bucket, objectName } = parsed;
  const client = getMinioClient();

  try {
    // 2. Stat para checar tamanho atual + content-type
    const stat = await client.statObject(bucket, objectName);
    const isWebp     = objectName.toLowerCase().endsWith(".webp");
    const sizeAntes  = stat.size;

    if (isWebp && sizeAntes < MIN_BYTES_TO_RECOMPRESS_WEBP) {
      return { ...base, status: "skipped", reason: "já webp e pequeno", size_antes: sizeAntes };
    }
    if (!isWebp && sizeAntes < MIN_BYTES_TO_RECOMPRESS_NONWEBP) {
      return { ...base, status: "skipped", reason: "já pequeno", size_antes: sizeAntes };
    }

    // 3. Baixa
    const stream = await client.getObject(bucket, objectName);
    const inputBuffer = await streamToBuffer(stream);

    // 4. Comprime
    const outputBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    // Sem ganho? pula (margem de 5% pra não trocar arquivo por nada)
    if (outputBuffer.length >= sizeAntes * 0.95) {
      return { ...base, status: "skipped", reason: "ganho irrelevante", size_antes: sizeAntes, size_depois: outputBuffer.length };
    }

    if (dryRun) {
      return {
        ...base, status: "ok", reason: "dry-run",
        size_antes: sizeAntes, size_depois: outputBuffer.length,
        url_antes: t.url,
      };
    }

    // 5. Upload novo
    const folder    = t.empresa_id ? `empresa/${t.empresa_id}` : "public";
    const newName   = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.webp`;
    await client.putObject(bucket, newName, outputBuffer, outputBuffer.length, {
      "Content-Type":  "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-amz-acl":     "public-read",
    });
    const newUrl = `/api/pub/media/${bucket}/${newName}`;

    // 6. UPDATE row
    await query(
      `UPDATE ${t.table} SET ${t.column} = $1, updated_at = NOW() WHERE id = $2`,
      [newUrl, t.id]
    );

    return {
      ...base, status: "ok",
      size_antes: sizeAntes, size_depois: outputBuffer.length,
      url_antes:  t.url, url_depois: newUrl,
    };
  } catch (err) {
    return {
      ...base, status: "error",
      reason: err instanceof Error ? err.message : String(err),
      url_antes: t.url,
    };
  }
}

/** Roda em todos os candidatos. Retorna sumário + por-item. */
export async function recomprimirTudo(opts: {
  dryRun:   boolean;
  empresaId?: string;
  limit?:   number;
}): Promise<{
  total: number; ok: number; skipped: number; error: number;
  bytes_antes: number; bytes_depois: number;
  itens: RecompressResult[];
}> {
  const todos = await listarCandidatos(opts.empresaId);
  const lista = opts.limit ? todos.slice(0, opts.limit) : todos;

  const itens: RecompressResult[] = [];
  let okN = 0, skipN = 0, errN = 0;
  let bAntes = 0, bDepois = 0;

  // Sequencial pra não martelar MinIO
  for (const t of lista) {
    const r = await recomprimirAlvo(t, opts.dryRun);
    itens.push(r);
    if (r.status === "ok")      okN++;
    if (r.status === "skipped") skipN++;
    if (r.status === "error")   errN++;
    if (r.size_antes)  bAntes  += r.size_antes;
    if (r.size_depois) bDepois += r.size_depois;
  }

  return {
    total: lista.length, ok: okN, skipped: skipN, error: errN,
    bytes_antes: bAntes, bytes_depois: bDepois,
    itens,
  };
}
