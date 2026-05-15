/**
 * GET /api/admin/agentes/[id]/last-frame
 * GET /api/admin/agentes/[id]/last-frame?meta=1 → retorna metadata JSON
 *
 * Master only. Devolve o PNG do último frame do kiosk como image/png OU
 * apenas metadata (dimensões, tempo) se ?meta=1.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const url = new URL(req.url);
  const onlyMeta = url.searchParams.get("meta") === "1";

  try {
    const a = await queryOne<{
      id: string; nome: string;
      ultimo_frame_data: string | null;
      ultimo_frame_em:   string | null;
      frame_w: number | null;
      frame_h: number | null;
    }>(
      `SELECT id, nome, ultimo_frame_data, ultimo_frame_em::text, frame_w, frame_h
         FROM agentes
        WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    if (!a) return notFound("Agente não encontrado");

    if (onlyMeta) {
      return ok({
        nome:           a.nome,
        ultimo_frame_em: a.ultimo_frame_em,
        tem_frame:      !!a.ultimo_frame_data,
        w:              a.frame_w,
        h:              a.frame_h,
      });
    }

    if (!a.ultimo_frame_data) {
      return new NextResponse("no frame yet", { status: 404, headers: { "Content-Type": "text/plain" } });
    }

    // Extrai apenas o base64 do data URL
    const m = a.ultimo_frame_data.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    if (!m) return serverError("frame format inválido");

    const buf = Buffer.from(m[2], "base64");
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":  `image/${m[1]}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[Admin/Agentes/LastFrame]", err);
    return serverError();
  }
}
