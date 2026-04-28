export type Empresa = {
  Id: number;
  nome_fantasia: string;
  slug: string;
  subdominio?: string;
  dominio_proprio?: string;
  usar_dominio_proprio?: boolean;
  logo_url?: string;
  cor_primaria?: string;
  status: "Ativo" | "Inativo";
};

export type Categoria = {
  Id: number;
  empresa_id: number;
  nome: string;
  ordem: number;
};

export type Produto = {
  Id: number;
  empresa_id: number;
  categoria_id: number;
  nome: string;
  descricao?: string;
  preco: number;
  modelo_3d_url?: string;
  disponivel: boolean;
};

export type LicencaResponse = {
  ativa: boolean;
  status: string;
  licenca?: any;
  motivo?: string;
};
