/**
 * /api/painel/whatsapp — use sub-routes:
 *   /api/painel/whatsapp/instancia  (GET, POST, DELETE)
 *   /api/painel/whatsapp/qr         (GET)
 */
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { success: false, error: "Use /api/painel/whatsapp/instancia ou /api/painel/whatsapp/qr" },
    { status: 404 }
  );
}
