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
  video_fundo_url?: string;
  whatsapp_pedidos?: string;
  pagamento_dinheiro?: boolean;
  pagamento_pix?: boolean;
  pagamento_cartao_pinpad?: boolean;
  mercado_pago_public_key?: string;
  pinpad_provider?: string;
  sistema_restaurante_provider?: string;
  orientacao_totem?: "Horizontal" | "Vertical";
};

export type Categoria = {
  Id: number;
  empresa_id: number;
  nome: string;
  ordem: number;
  tipo?: string | null;
  disponivel?: boolean;
  pontos_fidelidade?: number;
};

export type Produto = {
  Id: number;
  produto_id?: number | string | null;
  empresa_id: number;
  categoria_id: number;
  nome: string;
  descricao?: string;
  preco: number;
  modelo_3d_url?: string;
  disponivel: boolean;
  imagem_url?: string;
  tipo?: string | null;
  pontos_fidelidade?: number;
};

export type LicencaResponse = {
  ativa: boolean;
  status: string;
  licenca?: any;
  motivo?: string;
};
export type Insumo = {
  Id: number;
  empresa_id: number;
  produto_id: number | string | any;
  nome: string;
  tipo: "Adicional" | "Remover" | "Observacao";
  preco: number;
  descricao?: string;
  obrigatorio?: boolean;
  multipla_escolha?: boolean;
  minimo?: number;
  maximo?: number;
  ativo?: boolean;
};
