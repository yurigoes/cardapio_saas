// ─────────────────────────────────────────────
// Tipos legados mantidos para compatibilidade
// com o cardápio público existente
// ─────────────────────────────────────────────

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
  licenca?: unknown;
  motivo?: string;
};

// ─────────────────────────────────────────────
// Tipos do cardápio público (PostgreSQL / UUID)
// ─────────────────────────────────────────────

export type EmpresaPublica = {
  id: string;
  nome_fantasia: string;
  logo_url: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  whatsapp: string | null;
};

export type CategoriaPublica = {
  id: string;
  nome: string;
  descricao?: string | null;
  imagem_url?: string | null;
  ordem: number;
};

export type ProdutoPublico = {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao?: string | null;
  preco: number;
  imagem_url?: string | null;
  tempo_preparo?: number | null;
  tipo?: string;
  destaque?: boolean;
};

// ─────────────────────────────────────────────
// Tipos do novo sistema interno
// ─────────────────────────────────────────────

export type JWTRole =
  | "master" | "admin" | "gerente" | "garcom" | "cozinha"
  | "atendente" | "financeiro" | "delivery" | "motoboy" | "cliente";

export interface UsuarioAutenticado {
  id:        string;
  nome:      string;
  email:     string;
  role:      JWTRole;
  empresaId: string | null;
}

export interface PaginationMeta {
  total:   number;
  page:    number;
  limit:   number;
  pages:   number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data:    T;
  meta?:   { pagination?: PaginationMeta } & Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error:   string;
  code?:   string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
