/**
 * GET /api/pub/terminal/drivers
 * Lista drivers disponíveis pra UI mostrar no cadastro.
 * Público (não tem secret nenhum aqui).
 */
import { ok } from "@/lib/utils/response";
import { DRIVER_META } from "@/lib/payments/terminal/registry";

export async function GET() {
  return ok(DRIVER_META);
}
