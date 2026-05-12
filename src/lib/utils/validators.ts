import { z } from "zod";

// ─────────────────────────────────────────────
// Schemas reutilizáveis
// ─────────────────────────────────────────────

export const uuidSchema = z.string().uuid("ID inválido");

export const emailSchema = z
  .string()
  .email("E-mail inválido")
  .toLowerCase()
  .max(255);

export const senhaSchema = z
  .string()
  .min(8,  "Senha deve ter no mínimo 8 caracteres")
  .max(128, "Senha muito longa")
  .regex(/[A-Z]/, "Senha deve conter ao menos uma letra maiúscula")
  .regex(/[a-z]/, "Senha deve conter ao menos uma letra minúscula")
  .regex(/[0-9]/, "Senha deve conter ao menos um número");

export const telefoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{10,15}$/, "Telefone inválido (10-15 dígitos)"));

export const cnpjSchema = z
  .string()
  .regex(/^\d{14}$/, "CNPJ inválido (apenas dígitos, 14 caracteres)");

export const cpfSchema = z
  .string()
  .regex(/^\d{11}$/, "CPF inválido (apenas dígitos, 11 caracteres)");

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]{3,100}$/, "Slug inválido (apenas letras minúsculas, números e hífens)");

export const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida (formato: #RRGGBB)");

// Aceita number OU string numérica (pg NUMERIC vem como string e o frontend
// pode repassar sem converter). Coerce + valida intervalo.
export const precoSchema = z.preprocess(
  (v) => (typeof v === "string" ? parseFloat(v) : v),
  z.number()
    .min(0, "Preço não pode ser negativo")
    .max(99999.99, "Preço muito alto")
);

export const paginacaoSchema = z.object({
  // nullish() aceita null|undefined antes do coerce → .default() funciona corretamente
  page:  z.preprocess(v => v ?? undefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(v => v ?? undefined, z.coerce.number().int().min(1).max(500).default(20)),
  q:     z.string().max(255).nullish().transform(v => v ?? undefined),
});

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────
export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1, "Senha obrigatória").max(128),
});

// ─────────────────────────────────────────────
// Empresa
// ─────────────────────────────────────────────
export const empresaCreateSchema = z.object({
  nome_fantasia:  z.string().min(2).max(255).trim(),
  razao_social:   z.string().max(255).trim().optional(),
  cnpj:           cnpjSchema.optional(),
  slug:           slugSchema,
  subdominio:     slugSchema.optional(),
  cor_primaria:   colorSchema.optional(),
  cor_secundaria: colorSchema.optional(),
  whatsapp:       telefoneSchema.optional(),
  telefone:       telefoneSchema.optional(),
  email:          emailSchema.optional(),
  plano_id:       uuidSchema.optional(),
});

export const empresaUpdateSchema = empresaCreateSchema.partial().omit({ slug: true });

// ─────────────────────────────────────────────
// Produto
// ─────────────────────────────────────────────
// Variações de produto (tamanhos, adicionais, complementos)
export const opcaoVariacaoSchema = z.object({
  id:           z.string().min(1).max(50),
  nome:         z.string().min(1).max(100),
  preco_extra:  z.number().min(-99999.99).max(99999.99).default(0),
  disponivel:   z.boolean().optional().default(true),
});

export const grupoVariacaoSchema = z.object({
  id:           z.string().min(1).max(50),
  nome:         z.string().min(1).max(100),
  tipo:         z.enum(["single", "multiple"]).default("single"),
  obrigatorio:  z.boolean().optional().default(false),
  min:          z.number().int().min(0).max(50).optional().default(0),
  max:          z.number().int().min(1).max(50).optional().default(1),
  opcoes:       z.array(opcaoVariacaoSchema).min(1, "Grupo precisa de ao menos 1 opção"),
});

export const variacoesSchema = z.object({
  grupos: z.array(grupoVariacaoSchema).default([]),
}).default({ grupos: [] });

export const produtoCreateSchema = z.object({
  categoria_id:      uuidSchema.optional(),
  nome:              z.string().min(2).max(255).trim(),
  descricao:         z.string().max(2000).trim().optional(),
  preco:             precoSchema,
  preco_custo:       precoSchema.optional(),
  disponivel:        z.boolean().optional().default(true),
  destaque:          z.boolean().optional().default(false),
  tempo_preparo:     z.number().int().min(1).max(999).optional(),
  imagem_url:        z.string().url().optional(),
  tipo:              z.enum(["produto","combo","bebida","sobremesa","porcao"]).default("produto"),
  pontos_fidelidade: z.number().int().min(0).max(99999).optional().default(0),
  variacoes:         variacoesSchema.optional(),
});

export const produtoUpdateSchema = produtoCreateSchema.partial();

// ─────────────────────────────────────────────
// Pedido
// ─────────────────────────────────────────────
export const pedidoItemSchema = z.object({
  produto_id:     uuidSchema.optional(),
  nome:           z.string().min(1).max(255).trim(),
  preco_unitario: precoSchema,
  quantidade:     z.number().int().min(1).max(999),
  observacoes:    z.string().max(500).trim().optional(),
  adicionais:     z.array(z.unknown()).optional().default([]),
  complementos:   z.array(z.unknown()).optional().default([]),
});

export const pedidoCreateSchema = z.object({
  tipo: z.enum(["mesa","balcao","delivery","totem","whatsapp","app"]),
  mesa_id:           uuidSchema.optional(),
  comanda:           z.string().max(50).optional(),
  cliente_id:        uuidSchema.optional(),
  cliente_nome:      z.string().max(255).trim().optional(),
  cliente_telefone:  telefoneSchema.optional(),
  cliente_endereco:  z.unknown().optional(),
  observacoes:       z.string().max(1000).trim().optional(),
  taxa_entrega:      precoSchema.optional().default(0),
  desconto:          precoSchema.optional().default(0),
  itens: z.array(pedidoItemSchema).min(1, "Pedido deve ter ao menos 1 item"),
});

// ─────────────────────────────────────────────
// Usuário
// ─────────────────────────────────────────────
export const usuarioCreateSchema = z.object({
  nome:      z.string().min(2).max(255).trim(),
  email:     emailSchema,
  senha:     senhaSchema,
  role:      z.enum(["admin","gerente","garcom","cozinha","atendente","financeiro","delivery","motoboy"]),
  telefone:  telefoneSchema.optional(),
});

export const usuarioUpdateSchema = usuarioCreateSchema
  .partial()
  .omit({ senha: true })
  .extend({ ativo: z.boolean().optional() });

// ─────────────────────────────────────────────
// Gateway de Pagamento
// ─────────────────────────────────────────────
export const gatewayConfigSchema = z.object({
  nome:           z.string().min(2).max(100).trim(),
  slug:           slugSchema,
  client_id:      z.string().max(500).optional(),
  client_secret:  z.string().max(500).optional(),
  api_key:        z.string().max(500).optional(),
  merchant_id:    z.string().max(255).optional(),
  token:          z.string().max(500).optional(),
  webhook_url:    z.string().url().optional(),
  ambiente:       z.enum(["sandbox","producao"]).default("sandbox"),
  configuracoes:  z.record(z.unknown()).optional().default({}),
  ativo:          z.boolean().optional().default(true),
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(msg);
  }
  return result.data;
}

export async function parseBodyOrThrow<S extends z.ZodTypeAny>(
  request: Request,
  schema: S
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new Error("Corpo da requisição inválido (JSON malformado)");
  }
  return parseOrThrow(schema, body);
}
