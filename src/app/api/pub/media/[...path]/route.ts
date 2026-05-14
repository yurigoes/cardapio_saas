/**
 * GET /api/pub/media/{bucket}/{...path}
 * Proxy for MinIO files — serves them through the Next.js app
 * so the browser doesn't need direct access to MinIO
 */
import { NextRequest, NextResponse } from "next/server";
import { Client as MinioClient } from "minio";

const minio = new MinioClient({
  endPoint:  process.env.MINIO_ENDPOINT || "minio",
  port:      Number(process.env.MINIO_PORT) || 9000,
  useSSL:    process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "",
  secretKey: process.env.MINIO_SECRET_KEY || "",
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const [bucket, ...rest] = params.path;
    if (!bucket || rest.length === 0) {
      return new NextResponse("Not found", { status: 404 });
    }
    const objectName = rest.join("/");

    // Get object from MinIO as a stream
    const stream = await minio.getObject(bucket, objectName);

    // Detect content type from extension
    const ext = objectName.split(".").pop()?.toLowerCase() ?? "";
    const contentTypeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
      mp4: "video/mp4", webm: "video/webm",
    };
    const contentType = contentTypeMap[ext] || "application/octet-stream";

    // Buffer the stream
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NoSuchKey") || msg.includes("Not Found")) {
      return new NextResponse("Not found", { status: 404 });
    }
    console.error("[Media proxy]", err);
    return new NextResponse("Error", { status: 500 });
  }
}
