/**
 * GET /api/painel/locais-capacidade?ids=uuid1,uuid2,...
 *
 * Versao do anunciante do /api/admin/locais/capacidade-batch.
 * Mesma logica — anunciante precisa ver capacidade dos locais pra escolher
 * em qual lancar a campanha.
 */
export { GET } from "@/app/api/admin/locais/capacidade-batch/route";
export const dynamic = "force-dynamic";
