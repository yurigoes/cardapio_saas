import { expect, expectRejeita, type Suite } from "./harness";

import {
  ok, created, noContent, badRequest, unauthorized, forbidden,
  notFound, conflict, unprocessable, serverError, paginatedOk,
} from "@/lib/utils/response";
import {
  AppError, AuthError, ForbiddenError, NotFoundError, ValidationError,
  ConflictError, RateLimitError, ModuleDisabledError,
  isAppError, isDatabaseError, isDuplicateKeyError, isForeignKeyError,
} from "@/lib/utils/errors";
import {
  emailSchema, senhaSchema, telefoneSchema, cnpjSchema, cpfSchema,
  slugSchema, colorSchema, precoSchema, paginacaoSchema,
  produtoCreateSchema, pedidoCreateSchema, parseOrThrow,
} from "@/lib/utils/validators";
import {
  sanitizeString, sanitizeHtml, detectSqlInjection, detectPathTraversal,
  sanitizeFilename, sanitizeSlug, sanitizePhone, sanitizeCpfCnpj,
  sanitizeObject, validateContentType, validateUploadedFile,
} from "@/lib/security/sanitize";
import { temPermissao, temRole, assertPermissao, assertRole, ROLE_HIERARCHY } from "@/lib/auth/rbac";
import { extractBearerToken, signAccessToken, verifyAccessToken } from "@/lib/auth/jwt";
import { rateLimitHeaders } from "@/lib/security/rate-limit";
import { getModuloInfo, getAllModulos, getModulosByCategoria } from "@/lib/modules/registry";
import { isGatewaySupported, GATEWAYS_INFO } from "@/lib/gateways/registry";
import { calcularSubtotal, calcularTotal } from "@/lib/pedidos/calculo";
import { sha256, extractAgentToken } from "@/lib/agentes/token";
import { cardapioCacheKey } from "@/lib/cache/cardapio";
import { parseUserModules, canAccessModule, firstAllowedModule } from "@/lib/adminModules";
import { calcularCashback, aplicarCredito, aplicarDebito } from "@/lib/cashback/calculo";
import { calcularTrial } from "@/lib/billing/trial";

export const SUITES: Suite[] = [
  {
    modulo: "src/lib/utils/response.ts",
    nome: "Respostas da API",
    categoria: "Núcleo da API",
    descricao: "Padroniza todas as respostas HTTP do sistema: sucesso, erros e paginação.",
    casos: [
      { nome: "ok() retorna 200 com { success, data }", run: async () => {
        const r = ok({ id: "1" }); expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ success: true, data: { id: "1" }, meta: undefined }); } },
      { nome: "created() retorna 201", run: async () => {
        const r = created({ x: 1 }); expect(r.status).toBe(201); expect((await r.json()).data).toEqual({ x: 1 }); } },
      { nome: "noContent() retorna 204", run: () => { expect(noContent().status).toBe(204); } },
      { nome: "badRequest() 400 com code", run: async () => {
        const r = badRequest("faltou", "MISS"); expect(r.status).toBe(400);
        expect(await r.json()).toMatchObject({ success: false, error: "faltou", code: "MISS" }); } },
      { nome: "unauthorized() 401/UNAUTHORIZED", run: async () => {
        const r = unauthorized(); expect(r.status).toBe(401); expect((await r.json()).code).toBe("UNAUTHORIZED"); } },
      { nome: "forbidden() 403", run: () => { expect(forbidden().status).toBe(403); } },
      { nome: "notFound() 404/NOT_FOUND", run: async () => {
        const r = notFound(); expect(r.status).toBe(404); expect((await r.json()).code).toBe("NOT_FOUND"); } },
      { nome: "conflict() 409", run: () => { expect(conflict("dup").status).toBe(409); } },
      { nome: "unprocessable() 422 com details", run: async () => {
        const r = unprocessable("inv", { f: "email" }); expect(r.status).toBe(422);
        const b = await r.json(); expect(b.code).toBe("VALIDATION_ERROR"); expect(b.meta.details).toEqual({ f: "email" }); } },
      { nome: "serverError() 500/INTERNAL_ERROR", run: async () => {
        const r = serverError(); expect(r.status).toBe(500); expect((await r.json()).code).toBe("INTERNAL_ERROR"); } },
      { nome: "paginatedOk() calcula paginação", run: async () => {
        const b = await paginatedOk([{ id: 1 }], 100, 2, 20).json();
        expect(b.meta.pagination).toEqual({ total: 100, page: 2, limit: 20, pages: 5, hasNext: true, hasPrev: true }); } },
      { nome: "paginatedOk() última página: hasNext=false", run: async () => {
        const b = await paginatedOk([], 100, 5, 20).json();
        expect(b.meta.pagination.hasNext).toBe(false); expect(b.meta.pagination.hasPrev).toBe(true); } },
    ],
  },
  {
    modulo: "src/lib/utils/errors.ts",
    nome: "Tratamento de erros",
    categoria: "Núcleo da API",
    descricao: "Classes de erro padronizadas e detecção de erros do banco (duplicado, chave estrangeira).",
    casos: [
      { nome: "AppError defaults (APP_ERROR/400)", run: () => { const e = new AppError("x"); expect(e.code).toBe("APP_ERROR"); expect(e.status).toBe(400); } },
      { nome: "AuthError → 401", run: () => { const e = new AuthError(); expect(e.status).toBe(401); expect(e.code).toBe("UNAUTHORIZED"); } },
      { nome: "ForbiddenError → 403", run: () => { expect(new ForbiddenError().status).toBe(403); } },
      { nome: "NotFoundError interpola recurso", run: () => { const e = new NotFoundError("Produto"); expect(e.message).toBe("Produto não encontrado"); expect(e.status).toBe(404); } },
      { nome: "ValidationError → 422 com details", run: () => { const e = new ValidationError("inv", { f: 1 }); expect(e.status).toBe(422); expect(e.details).toEqual({ f: 1 }); } },
      { nome: "ConflictError → 409", run: () => { expect(new ConflictError("d").status).toBe(409); } },
      { nome: "RateLimitError → 429", run: () => { expect(new RateLimitError().status).toBe(429); } },
      { nome: "ModuleDisabledError cita módulo", run: () => { expect(new ModuleDisabledError("pix").message).toContain("pix"); } },
      { nome: "isAppError discrimina", run: () => { expect(isAppError(new AppError("x"))).toBe(true); expect(isAppError(new Error("y"))).toBe(false); } },
      { nome: "isDatabaseError exige Error com code", run: () => { expect(isDatabaseError(Object.assign(new Error(), { code: "23505" }))).toBe(true); expect(isDatabaseError(new Error())).toBe(false); } },
      { nome: "isDuplicateKeyError 23505", run: () => { expect(isDuplicateKeyError(Object.assign(new Error(), { code: "23505" }))).toBe(true); expect(isDuplicateKeyError(Object.assign(new Error(), { code: "23503" }))).toBe(false); } },
      { nome: "isForeignKeyError 23503", run: () => { expect(isForeignKeyError(Object.assign(new Error(), { code: "23503" }))).toBe(true); } },
    ],
  },
  {
    modulo: "src/lib/utils/validators.ts",
    nome: "Validação de dados",
    categoria: "Núcleo da API",
    descricao: "Valida os dados de entrada: e-mail, senha, CNPJ/CPF, preços e pedidos.",
    casos: [
      { nome: "emailSchema normaliza minúsculas", run: () => { expect(emailSchema.parse("USER@EXAMPLE.COM")).toBe("user@example.com"); } },
      { nome: "emailSchema rejeita inválido", run: () => { expect(emailSchema.safeParse("nope").success).toBe(false); } },
      { nome: "senhaSchema exige maiúscula/minúscula/número", run: () => { expect(senhaSchema.safeParse("Senha123").success).toBe(true); expect(senhaSchema.safeParse("senha123").success).toBe(false); } },
      { nome: "telefoneSchema 10-15 dígitos", run: () => { expect(telefoneSchema.safeParse("11987654321").success).toBe(true); expect(telefoneSchema.safeParse("abc").success).toBe(false); } },
      { nome: "cnpj/cpf por tamanho", run: () => { expect(cnpjSchema.safeParse("12345678901234").success).toBe(true); expect(cpfSchema.safeParse("12345678901").success).toBe(true); expect(cpfSchema.safeParse("1").success).toBe(false); } },
      { nome: "slugSchema só minúsculas/números/hífen", run: () => { expect(slugSchema.safeParse("meu-slug-1").success).toBe(true); expect(slugSchema.safeParse("MeuSlug").success).toBe(false); } },
      { nome: "colorSchema hex #RRGGBB", run: () => { expect(colorSchema.safeParse("#FF0000").success).toBe(true); expect(colorSchema.safeParse("FF0000").success).toBe(false); } },
      { nome: "precoSchema faixa 0..99999.99", run: () => { expect(precoSchema.safeParse(10).success).toBe(true); expect(precoSchema.safeParse(-1).success).toBe(false); } },
      { nome: "paginacaoSchema defaults/coerção", run: () => { expect(paginacaoSchema.parse({})).toMatchObject({ page: 1, limit: 20 }); expect(paginacaoSchema.parse({ page: "3" })).toMatchObject({ page: 3 }); } },
      { nome: "produtoCreateSchema defaults", run: () => { const p = produtoCreateSchema.parse({ nome: "Pizza", preco: 45.9 }); expect(p.tipo).toBe("produto"); expect(p.disponivel).toBe(true); } },
      { nome: "pedidoCreateSchema exige ≥1 item", run: () => { expect(pedidoCreateSchema.safeParse({ tipo: "mesa", itens: [] }).success).toBe(false); expect(pedidoCreateSchema.safeParse({ tipo: "mesa", itens: [{ nome: "X", preco_unitario: 10, quantidade: 1 }] }).success).toBe(true); } },
      { nome: "parseOrThrow valida e lança", run: () => { expect(parseOrThrow(emailSchema, "a@b.com")).toBe("a@b.com"); expect(() => parseOrThrow(emailSchema, "nope")).toThrow(); } },
    ],
  },
  {
    modulo: "src/lib/security/sanitize.ts",
    nome: "Sanitização de entradas",
    categoria: "Segurança",
    descricao: "Bloqueia XSS, SQL injection e path traversal; limpa nomes, slugs, telefones e uploads.",
    casos: [
      { nome: "sanitizeString remove <script> e escapa", run: () => { const o = sanitizeString("<script>x</script>ok"); expect(o).not.toContain("<script>"); expect(o).not.toContain("<"); } },
      { nome: "sanitizeString '' para não-string", run: () => { expect(sanitizeString(123)).toBe(""); } },
      { nome: "sanitizeHtml mantém <p>, remove <script>", run: () => { const o = sanitizeHtml("<p>ok</p><script>b</script>"); expect(o).toContain("<p>ok</p>"); expect(o).not.toContain("<script>"); } },
      { nome: "detectSqlInjection", run: () => { expect(detectSqlInjection("texto normal")).toBe(false); expect(detectSqlInjection("SELECT * FROM x")).toBe(true); } },
      { nome: "detectPathTraversal", run: () => { expect(detectPathTraversal("a.txt")).toBe(false); expect(detectPathTraversal("../../etc/passwd")).toBe(true); } },
      { nome: "sanitizeFilename troca especiais", run: () => { expect(sanitizeFilename("a b@c.txt")).toBe("a_b_c.txt"); } },
      { nome: "sanitizeSlug remove acentos", run: () => { expect(sanitizeSlug("Café da Casa")).toBe("cafe-da-casa"); } },
      { nome: "sanitizePhone só dígitos", run: () => { expect(sanitizePhone("(11) 98765-4321")).toBe("11987654321"); } },
      { nome: "sanitizeCpfCnpj só dígitos", run: () => { expect(sanitizeCpfCnpj("123.456.789-00")).toBe("12345678900"); } },
      { nome: "sanitizeObject recursivo", run: () => { const o = sanitizeObject({ a: "<b>", n: { c: "<i>" } }); expect(o.a).not.toContain("<"); expect((o.n as { c: string }).c).not.toContain("<"); } },
      { nome: "validateContentType case-insensitive", run: () => { expect(validateContentType("image/jpeg; charset=utf-8", "image")).toBe(true); expect(validateContentType(null, "image")).toBe(false); } },
      { nome: "validateUploadedFile aceita/rejeita", run: () => { expect(validateUploadedFile({ type: "image/jpeg", size: 1000, name: "p.jpg" }).valid).toBe(true); expect(validateUploadedFile({ type: "text/plain", size: 10, name: "a.txt" }).valid).toBe(false); } },
    ],
  },
  {
    modulo: "src/lib/auth/rbac.ts",
    nome: "Permissões (RBAC)",
    categoria: "Autenticação e acesso",
    descricao: "Controle de permissões por papel (admin, gerente, garçom...) e hierarquia de acesso.",
    casos: [
      { nome: "master tem qualquer permissão", run: () => { expect(temPermissao("master", "gateway:configurar")).toBe(true); } },
      { nome: "admin sim, garçom não (gateway)", run: () => { expect(temPermissao("admin", "gateway:configurar")).toBe(true); expect(temPermissao("garcom", "gateway:configurar")).toBe(false); } },
      { nome: "garçom cria pedido", run: () => { expect(temPermissao("garcom", "pedido:criar")).toBe(true); } },
      { nome: "temRole compara hierarquia", run: () => { expect(temRole("admin", "gerente")).toBe(true); expect(temRole("garcom", "admin")).toBe(false); } },
      { nome: "assertPermissao lança/passa", run: () => { expect(() => assertPermissao("garcom", "gateway:configurar")).toThrow(); expect(() => assertPermissao("admin", "pedido:ver")).not.toThrow(); } },
      { nome: "assertRole lança quando insuficiente", run: () => { expect(() => assertRole("delivery", "admin")).toThrow(); expect(() => assertRole("admin", "garcom")).not.toThrow(); } },
      { nome: "hierarquia master>admin>gerente", run: () => { expect(ROLE_HIERARCHY.master).toBeGreaterThan(ROLE_HIERARCHY.admin); expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.gerente); } },
    ],
  },
  {
    modulo: "src/lib/auth/jwt.ts",
    nome: "Tokens de login (JWT)",
    categoria: "Autenticação e acesso",
    descricao: "Geração e verificação dos tokens de autenticação (assina, valida e rejeita adulterado).",
    casos: [
      { nome: "extractBearerToken extrai", run: () => { expect(extractBearerToken("Bearer abc.def")).toBe("abc.def"); } },
      { nome: "extractBearerToken null sem Bearer", run: () => { expect(extractBearerToken("Basic x")).toBeNull(); expect(extractBearerToken(null)).toBeNull(); } },
      { nome: "sign+verify roundtrip", run: async () => {
        if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "harness-secret-32bytes-harness-ok";
        const tok = await signAccessToken({ sub: "u1", email: "a@b.com", role: "admin", nome: "A", sessionId: "s1" });
        const p = await verifyAccessToken(tok); expect(p.sub).toBe("u1"); expect(p.role).toBe("admin"); } },
      { nome: "verifyAccessToken rejeita adulterado", run: async () => {
        if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "harness-secret-32bytes-harness-ok";
        await expectRejeita(verifyAccessToken("nao.eh.valido")); } },
    ],
  },
  {
    modulo: "src/lib/security/rate-limit.ts",
    nome: "Limite de requisições",
    categoria: "Segurança",
    descricao: "Monta os cabeçalhos de rate limit (limite, restante, reset, retry-after).",
    casos: [
      { nome: "sucesso → Retry-After 0", run: () => { const h = rateLimitHeaders({ success: true, remaining: 50, resetAt: 60000, total: 100 }); expect(h["X-RateLimit-Limit"]).toBe("100"); expect(h["Retry-After"]).toBe("0"); expect(h["X-RateLimit-Reset"]).toBe("60"); } },
      { nome: "bloqueado → Retry-After > 0", run: () => { const h = rateLimitHeaders({ success: false, remaining: 0, resetAt: Date.now() + 30000, total: 100 }); expect(Number(h["Retry-After"]) > 0).toBe(true); } },
    ],
  },
  {
    modulo: "src/lib/modules/registry.ts",
    nome: "Catálogo de módulos",
    categoria: "Núcleo da API",
    descricao: "Registro dos módulos contratáveis do sistema (busca, listagem e agrupamento).",
    casos: [
      { nome: "getAllModulos() não-vazio", run: () => { expect(getAllModulos().length > 0).toBe(true); } },
      { nome: "getModuloInfo() existente e null", run: () => { const f = getAllModulos()[0]; expect(getModuloInfo(f.id)).toEqual(f); expect(getModuloInfo("__nope__" as never)).toBeNull(); } },
      { nome: "getModulosByCategoria() agrupa tudo", run: () => { const c = getModulosByCategoria(); const t = Object.values(c).reduce((a, arr) => a + arr.length, 0); expect(t).toBe(getAllModulos().length); } },
    ],
  },
  {
    modulo: "src/lib/gateways/registry.ts",
    nome: "Gateways de pagamento",
    categoria: "Pagamentos",
    descricao: "Registro dos gateways suportados e quais têm implementação ativa (Stone, PIX...).",
    casos: [
      { nome: "GATEWAYS_INFO não-vazio", run: () => { expect(GATEWAYS_INFO.length > 0).toBe(true); } },
      { nome: "isGatewaySupported reconhece implementados", run: () => { expect(isGatewaySupported("stone")).toBe(true); expect(isGatewaySupported("pix_bancario")).toBe(true); } },
      { nome: "isGatewaySupported rejeita inexistente", run: () => { expect(isGatewaySupported("banco_xyz")).toBe(false); } },
    ],
  },
  {
    modulo: "src/lib/pedidos/calculo.ts",
    nome: "Pedidos — cálculo de totais",
    categoria: "Operação",
    descricao: "Soma do subtotal (preço × quantidade) e total com taxa de entrega e desconto.",
    casos: [
      { nome: "subtotal soma preço×qtd", run: () => { expect(calcularSubtotal([{ preco_unitario: 50, quantidade: 2 }, { preco_unitario: 30, quantidade: 1 }])).toBe(130); } },
      { nome: "subtotal vazio = 0", run: () => { expect(calcularSubtotal([])).toBe(0); } },
      { nome: "total = subtotal + taxa − desconto", run: () => { expect(calcularTotal(130, 10, 5)).toBe(135); } },
      { nome: "total nunca negativo", run: () => { expect(calcularTotal(10, 0, 50)).toBe(0); } },
      { nome: "total sem taxa/desconto = subtotal", run: () => { expect(calcularTotal(100)).toBe(100); } },
    ],
  },
  {
    modulo: "src/lib/cashback/calculo.ts",
    nome: "Cashback — cálculo",
    categoria: "Operação",
    descricao: "Calcula o cashback gerado (% sobre o total) e atualiza o saldo (crédito/débito).",
    casos: [
      { nome: "cashback = total × percentual", run: () => { expect(calcularCashback(100, 5)).toBe(5); } },
      { nome: "arredonda para centavos", run: () => { expect(calcularCashback(33.33, 10)).toBe(3.33); } },
      { nome: "total ou percentual zero → 0", run: () => { expect(calcularCashback(0, 5)).toBe(0); expect(calcularCashback(100, 0)).toBe(0); } },
      { nome: "crédito soma ao saldo", run: () => { expect(aplicarCredito(10.1, 5.05)).toBe(15.15); } },
      { nome: "débito subtrai do saldo", run: () => { expect(aplicarDebito(10, 3)).toBe(7); } },
      { nome: "débito não fica negativo", run: () => { expect(aplicarDebito(2, 5)).toBe(0); } },
    ],
  },
  {
    modulo: "src/lib/billing/trial.ts",
    nome: "Trial / vencimento",
    categoria: "Faturamento",
    descricao: "Estado do período de teste (ativo, expirado, dias restantes) a partir do status e datas.",
    casos: [
      { nome: "trial no futuro → ativo + dias restantes", run: () => {
        const agora = new Date("2026-01-15T12:00:00Z");
        const t = calcularTrial({ status: "teste", trial_inicio: null, trial_fim: "2026-01-20T12:00:00Z" }, agora);
        expect(t.ativo).toBe(true); expect(t.expirado).toBe(false); expect(t.diasRestantes).toBe(5); } },
      { nome: "trial no passado → expirado", run: () => {
        const agora = new Date("2026-01-15T12:00:00Z");
        const t = calcularTrial({ status: "teste", trial_inicio: null, trial_fim: "2026-01-14T12:00:00Z" }, agora);
        expect(t.expirado).toBe(true); expect(t.ativo).toBe(false); expect(t.diasRestantes).toBe(0); } },
      { nome: "status 'ativo' não conta como trial", run: () => {
        const t = calcularTrial({ status: "ativo", trial_inicio: null, trial_fim: null }, new Date("2026-01-15T12:00:00Z"));
        expect(t.ativo).toBe(false); expect(t.expirado).toBe(false); } },
    ],
  },
  {
    modulo: "src/lib/agentes/token.ts",
    nome: "Tokens de agente",
    categoria: "Autenticação e acesso",
    descricao: "Hash SHA-256 determinístico e extração do token 'rdt_' do header Authorization.",
    casos: [
      { nome: "sha256 é determinístico (64 hex)", run: () => { const h = sha256("rdt_abc"); expect(h).toBe(sha256("rdt_abc")); expect(h.length).toBe(64); } },
      { nome: "sha256 muda com a entrada", run: () => { expect(sha256("rdt_abc") === sha256("rdt_abd")).toBe(false); } },
      { nome: "extractAgentToken lê 'Bearer rdt_...'", run: () => {
        const tok = "rdt_" + "a".repeat(24);
        const req = new Request("http://x", { headers: { authorization: `Bearer ${tok}` } });
        expect(extractAgentToken(req)).toBe(tok); } },
      { nome: "extractAgentToken null sem header", run: () => { expect(extractAgentToken(new Request("http://x"))).toBeNull(); } },
    ],
  },
  {
    modulo: "src/lib/cache/cardapio.ts",
    nome: "Cache do cardápio",
    categoria: "Núcleo da API",
    descricao: "Monta a chave de cache do cardápio público por slug.",
    casos: [
      { nome: "chave = cardapio:pub:{slug}", run: () => { expect(cardapioCacheKey("burgaria")).toBe("cardapio:pub:burgaria"); } },
    ],
  },
  {
    modulo: "src/lib/adminModules.ts",
    nome: "Acesso a módulos (admin)",
    categoria: "Autenticação e acesso",
    descricao: "Quais módulos do painel cada usuário pode acessar (por papel e lista de módulos).",
    casos: [
      { nome: "sem usuário → nenhum módulo", run: () => { expect(parseUserModules(null)).toEqual([]); } },
      { nome: "ADM sem restrição → todos os módulos", run: () => {
        const u = { role: "ADM" } as Parameters<typeof parseUserModules>[0];
        expect(parseUserModules(u).length > 0).toBe(true); } },
      { nome: "lista por string com vírgulas", run: () => {
        const u = { role: "garcom", modulos_acesso: "a,b,c" } as Parameters<typeof parseUserModules>[0];
        expect(parseUserModules(u)).toEqual(["a", "b", "c"]); } },
      { nome: "canAccessModule: ADM acessa tudo, anônimo nada", run: () => {
        expect(canAccessModule({ role: "ADM" } as Parameters<typeof canAccessModule>[0], "qualquer")).toBe(true);
        expect(canAccessModule(null, "dashboard")).toBe(false); } },
      { nome: "firstAllowedModule sem usuário → dashboard", run: () => { expect(firstAllowedModule(null)).toBe("dashboard"); } },
    ],
  },
];
