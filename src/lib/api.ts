import { Categoria, Empresa, LicencaResponse, Produto } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Erro na API: ${response.status}`);
  }

  return response.json();
}

export async function getEmpresas(): Promise<Empresa[]> {
  const data = await apiGet<{ list: Empresa[] }>("/api/db/empresas_cardapio?limit=100");
  return data.list || [];
}

export async function getEmpresaBySlug(slug: string): Promise<Empresa | null> {
  const data = await apiGet<{ list: Empresa[] }>(
    `/api/db/empresas_cardapio?where=(slug,eq,${slug})~and(status,eq,Ativo)&limit=1`
  );

  return data.list?.[0] || null;
}

export async function getEmpresaBySubdominio(subdominio: string): Promise<Empresa | null> {
  const data = await apiGet<{ list: Empresa[] }>(
    `/api/db/empresas_cardapio?where=(subdominio,eq,${subdominio})~and(status,eq,Ativo)&limit=1`
  );

  return data.list?.[0] || null;
}

export async function getEmpresaByDominio(host: string): Promise<Empresa | null> {
  const data = await apiGet<{ list: Empresa[] }>(
    `/api/db/empresas_cardapio?where=(dominio_proprio,eq,${host})~and(status,eq,Ativo)&limit=1`
  );

  return data.list?.[0] || null;
}

export async function getCategorias(empresaId: number): Promise<Categoria[]> {
  const data = await apiGet<{ list: Categoria[] }>(
    `/api/db/categorias_cardapio?where=(empresa_id,eq,${empresaId})&limit=100`
  );

  return (data.list || []).sort((a, b) => Number(a.ordem) - Number(b.ordem));
}

export async function getProdutos(empresaId: number): Promise<Produto[]> {
  const data = await apiGet<{ list: Produto[] }>(
    `/api/db/produtos_cardapio?where=(empresa_id,eq,${empresaId})~and(disponivel,eq,true)&limit=200`
  );

  return data.list || [];
}

export async function getLicenca(empresaId: number): Promise<LicencaResponse> {
  return apiGet<LicencaResponse>(`/api/cardapio/licenca/${empresaId}`);
}
export async function getInsumos(empresaId: number) {
  const data = await apiGet<{ list: any[] }>(
    `/api/db/insumos_cardapio?where=(empresa_id,eq,${empresaId})~and(ativo,eq,true)&limit=500`
  );

  return data.list || [];
}

export async function getTrialStatus(empresaId: number) {
  return apiGet<{
    trial_ativo: boolean;
    restante_segundos: number;
    restante_minutos: number;
  }>(`/api/cardapio/trial/status/${empresaId}`);
}
