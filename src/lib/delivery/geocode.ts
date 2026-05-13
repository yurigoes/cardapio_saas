/**
 * Geocoding via Nominatim (OpenStreetMap, gratuito).
 *
 * Política de uso do Nominatim:
 *   - 1 request/segundo (sem batch parallel)
 *   - User-Agent identificável obrigatório
 *
 * Para produção em escala, considere self-hosted Nominatim ou Photon.
 *
 * Tipo: { lat, lng } | null se não encontrou.
 */
const UA = "CardapioSaaS/1.0 (contato@cardapio.local)";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function geocodeEndereco(endereco: {
  rua?: string; numero?: string; bairro?: string;
  cidade?: string; uf?: string; cep?: string;
} | null | undefined): Promise<{ lat: number; lng: number } | null> {
  if (!endereco) return null;

  // Monta string de busca
  const partes = [
    endereco.rua,
    endereco.numero,
    endereco.bairro,
    endereco.cidade,
    endereco.uf,
    endereco.cep,
    "Brasil",
  ].filter(Boolean).join(", ");

  if (!endereco.rua && !endereco.cep) return null;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", partes);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");

    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json() as NominatimResult[];
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) {
    console.warn("[Geocode] Nominatim falhou:", (err as Error).message);
    return null;
  }
}
