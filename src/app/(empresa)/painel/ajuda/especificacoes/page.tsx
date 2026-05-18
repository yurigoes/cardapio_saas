"use client";

/**
 * /painel/ajuda/especificacoes
 *
 * Especificações técnicas detalhadas do sistema: stack, infra,
 * banco de dados, segurança, multi-tenant, módulos opcionais,
 * APIs, integrações, padrões internos.
 *
 * Pra desenvolvedores, suporte técnico avançado, ou clientes que
 * querem entender o que está rodando por baixo.
 */
import { useState, useMemo } from "react";
import {
  Cpu, Layers, Database, Server, Shield, Network, Boxes,
  Webhook, Lock, Globe, Smartphone, Printer, Workflow, FileText,
  Search, Code2, Activity, Building2,
} from "lucide-react";

interface Spec {
  id:    string;
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  itens: Array<{
    chave:    string;
    valor:    React.ReactNode;
    detalhe?: React.ReactNode;
  }>;
}

const SPECS: Spec[] = [
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "stack",
    titulo: "Stack & runtime",
    icone: Cpu,
    itens: [
      { chave: "Framework",        valor: "Next.js 14 (App Router)", detalhe: "SSR + Server Components + Route Handlers. Build standalone." },
      { chave: "Linguagem",        valor: "TypeScript 5", detalhe: "Strict mode ligado. Sem any implícito." },
      { chave: "Runtime servidor", valor: "Node.js 20+", detalhe: "Imagem Alpine pequena no Docker." },
      { chave: "UI",               valor: "React 18 + Tailwind CSS + Framer Motion" },
      { chave: "Ícones",           valor: "lucide-react (consistente em todo painel)" },
      { chave: "Validação",        valor: "Zod 3 (input/body de toda rota)" },
      { chave: "Auth",             valor: "JWT HS256 (jose) + refresh token + sessions table revogáveis" },
      { chave: "Senhas",           valor: "bcrypt (custo 10)" },
      { chave: "PWA",              valor: "Service Worker + manifest + install prompt" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "banco",
    titulo: "Banco de dados",
    icone: Database,
    itens: [
      { chave: "SGBD",        valor: "PostgreSQL 16 (Alpine)" },
      { chave: "Connection pool", valor: "node-postgres (pg) com pool size = DB_POOL_MAX (default 20)" },
      { chave: "Migrations",  valor: "SQL puro versionado em /database/migrations/NNN_*.sql", detalhe: "Aplicação manual via psql. Idempotente quando possível (IF NOT EXISTS)." },
      { chave: "Seeds",       valor: "/database/seeds/*.sql (rodam manual, idempotentes)" },
      { chave: "Tabelas-chave", valor: (
        <code className="text-xs">
          empresas · usuarios · clientes · produtos · categorias · pedidos · pedido_itens · cupons · mesas · caixas · caixa_movimentos · impressoras · impressao_jobs · gateways_pagamento · pagamentos · planos · mensalidades · redes · transferencias_estoque · sessoes_jwt · auditoria_log · webhooks_externos · eventos_evolution · cashback_movimentos · vales_cliente · motoboys
        </code>
      )},
      { chave: "Multi-tenant", valor: "Coluna empresa_id em toda tabela operacional. Filtragem por JWT.empresaId em TODA rota protegida." },
      { chave: "Rede de filiais", valor: "Coluna rede_id opcional em empresas/produtos/clientes. Helpers em /src/lib/rede/* abstraem se opera por empresa_id ou rede_id." },
      { chave: "Encryption-at-rest", valor: "Campos sensíveis (api_keys de gateways/integrações) gravados com prefixo 'encrypted:' + AES-256-GCM. Chave em ENCRYPTION_KEY." },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "auth",
    titulo: "Autenticação & permissões",
    icone: Shield,
    itens: [
      { chave: "Access token", valor: "JWT HS256, 15min (configurável JWT_EXPIRES_IN)" },
      { chave: "Refresh token", valor: "JWT HS256, 7 dias (JWT_REFRESH_EXPIRES_IN)" },
      { chave: "Sessão",       valor: "Linha em sessoes_jwt — permite revogar (logout em todos dispositivos)" },
      { chave: "Roles",        valor: "master · suporte · admin · gerente · atendente · motoboy · cliente" },
      { chave: "Permissões",   valor: "Definidas em /src/lib/auth/rbac.ts (Permissao = 'cardapio:editar' etc)" },
      { chave: "Middleware",   valor: "requireAuth(req) + temPermissao(role, perm) em toda rota /api/painel/*" },
      { chave: "Multi-empresa", valor: "JWT carrega empresaId atual + role. Trocar filial gera novo JWT." },
      { chave: "Self-registration cliente", valor: "OTP via WhatsApp em /api/pub/cliente/otp" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "api",
    titulo: "Estrutura de APIs",
    icone: Code2,
    itens: [
      { chave: "/api/painel/*", valor: "Autenticadas, escopadas por empresa do JWT (multi-tenant strict)" },
      { chave: "/api/admin/*",  valor: "Apenas role=master. CRUD cross-tenant (empresas, planos, redes, integrações master)" },
      { chave: "/api/pub/*",    valor: "Públicas. Identificam empresa por slug. Sem JWT (totem, cardápio público, OTP cliente)" },
      { chave: "/api/auth/*",   valor: "Login, refresh, logout, recuperar senha" },
      { chave: "/api/cron/*",   valor: "Protegidas por header x-cron-secret. Disparadas por scheduler externo (cron, n8n, etc)" },
      { chave: "/api/agent/*",  valor: "Endpoints do agente de impressão. Auth via x-agent-key (token único por instalação)" },
      { chave: "/api/sync/*",   valor: "Slave/replicação pra cardápios espelhados (legado)" },
      { chave: "Padrão response", valor: "{ success, data?, error?, meta? } — helpers em /src/lib/utils/response.ts" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "infra",
    titulo: "Infraestrutura",
    icone: Server,
    itens: [
      { chave: "Container app",  valor: "Docker (single image cardapio-saas:latest)" },
      { chave: "Container db",   valor: "postgres:16-alpine (cardapio_postgres)" },
      { chave: "Container cache", valor: "redis:7-alpine (cardapio_redis) — usado pra rate limit + idempotency" },
      { chave: "Container storage", valor: "MinIO (S3 compatible) — armazena imagens/vídeos do cardápio" },
      { chave: "WhatsApp",       valor: "evolution-api (cardapio_evolution) — instâncias por empresa" },
      { chave: "Automação",      valor: "n8n (cardapio_n8n) — opcional, pra integrações e crons" },
      { chave: "Proxy",          valor: "Cloudflare Tunnel + DNS no domínio principal" },
      { chave: "Backup",         valor: "Cron exporta dump PostgreSQL + arquivos MinIO pra R2 (BACKUP_R2_*)" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "armazenamento",
    titulo: "Imagens & arquivos (MinIO)",
    icone: Boxes,
    itens: [
      { chave: "Upload",       valor: "POST /api/upload — multipart/form-data, max 10 MB" },
      { chave: "Pipeline",     valor: "sharp processa: rotate (EXIF) → resize 1600px (fit inside) → webp quality 80" },
      { chave: "Bucket",       valor: "MINIO_BUCKET (default 'cardapio'). Policy pública leitura." },
      { chave: "URL servida",  valor: "/api/pub/media/[bucket]/[path] — proxy do Next pro MinIO, evita expor host interno" },
      { chave: "Path pattern", valor: "empresa/{empresa_id}/{timestamp}-{hash}.webp ou public/..." },
      { chave: "Cache",        valor: "Cache-Control: public, max-age=31536000, immutable (imutável pelo hash)" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "impressao",
    titulo: "Impressão",
    icone: Printer,
    itens: [
      { chave: "Arquitetura",   valor: "Job queue no banco (impressao_jobs) — agente local consome via long-polling" },
      { chave: "Agente",        valor: "Node.js standalone (/print-agent/) — conecta via api/agent/* com x-agent-key" },
      { chave: "Backends",      valor: "TCP (impressora rede 9100) e Windows (printer instalada no SO)" },
      { chave: "Formato",       valor: "Texto plano + ESC/POS quando necessário. Logo/QR via popup HTML (universal)" },
      { chave: "Fallback",      valor: "Cascata setor preferido → balcao → qualquer impressora ativa (evita 'nada imprime')" },
      { chave: "Tipos cupom",   valor: "cozinha (sem preços) · cliente (com totais + link tracking) · fechamento_caixa · motoboy" },
      { chave: "Dispatch",      valor: "Síncrono pra dinheiro/pinpad/PIX-no-totem; aguarda webhook pra PIX/cartão online" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "pagamentos",
    titulo: "Pagamentos",
    icone: Activity,
    itens: [
      { chave: "Mercado Pago",  valor: "Checkout Pro (single) + PreApproval (assinatura mensalidade). SDK oficial." },
      { chave: "Cielo eCommerce", valor: "API REST direta. PIX + cartão crédito." },
      { chave: "Cielo LIO",     valor: "Order Manager API — pareia maquininha LIO com pedido." },
      { chave: "Cielo TEF",     valor: "Android Intent (POS Cielo no totem Android)." },
      { chave: "Driver pattern", valor: "Cada gateway implementa interface PaymentDriver (criar, status, webhook)" },
      { chave: "Webhook",       valor: "POST /api/pub/pagamentos/webhook/[gateway] — verifica assinatura e atualiza status" },
      { chave: "Idempotency",   valor: "Redis lock por chave externa (gateway_id + reference)" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "fidelidade",
    titulo: "Fidelidade & cashback",
    icone: Workflow,
    itens: [
      { chave: "Sistema de pontos", valor: "clientes.pontos (INTEGER). Crédito calculado por pontos_por_real × valor pedido." },
      { chave: "Troca por cupom", valor: "POST /api/pub/cliente/[id]/trocar-pontos { pontos } → cupom valor = pts × real_por_ponto" },
      { chave: "Cupom-template",  valor: "Cupons com pontos_resgatados > 0 viram opção de resgate no painel do cliente" },
      { chave: "Cashback",        valor: "Sistema paralelo. clientes.saldo_cashback (NUMERIC). cashback_movimentos audita." },
      { chave: "Cross-filial",    valor: "rede.fidelidade_cross_filial=true → cliente único compartilhado por rede_id" },
      { chave: "Atomic",          valor: "Trocas usam transaction + FOR UPDATE no cliente pra evitar double-spend" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "rede",
    titulo: "Rede de filiais",
    icone: Network,
    itens: [
      { chave: "Conceito",  valor: "1 rede tem N empresas (filiais). Uma é matriz (is_matriz=true)." },
      { chave: "Cardápio sincronizado", valor: "Quando true, produtos+categorias compartilhados via rede_id." },
      { chave: "Exclusivo de filial", valor: "produtos.exclusivo_filial_id permite produto só na filial X mesmo com cardápio sincronizado." },
      { chave: "Fidelidade compartilhada", valor: "rede.fidelidade_cross_filial controla se pontos acumulam cross-loja." },
      { chave: "Operadores cross-filial", valor: "usuario.opera_todas_filiais → dropdown na header pra trocar empresa ativa (gera novo JWT)" },
      { chave: "Mensalidade unificada", valor: "Quando rede.plano_id presente, fatura única na matriz com desconto progressivo por filial." },
      { chave: "Caixa",     valor: "Sempre por filial. Cada empresa tem suas próprias caixas/movimentações." },
      { chave: "Transferências", valor: "transferencias_estoque entre filiais com workflow pendente→em_transito→recebido" },
      { chave: "Dashboard rede", valor: "/painel/rede agrega métricas de todas as filiais (totais, breakdown, top produtos)" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "integracoes",
    titulo: "Integrações externas",
    icone: Webhook,
    itens: [
      { chave: "WhatsApp Evolution", valor: "Cada empresa tem instância. Provisionamento auto via /api/admin/empresas POST (env EVOLUTION_AUTO_PROVISION)" },
      { chave: "iFood",      valor: "OAuth client_credentials. Puxa pedidos via polling /events. Acks confirmam recebimento." },
      { chave: "Mercado Pago", valor: "OAuth + webhook /api/pub/pagamentos/webhook/mercadopago" },
      { chave: "Cielo",      valor: "API keys por gateway. Webhook por modo." },
      { chave: "n8n / Zapier", valor: "Webhooks externos cadastrados em /painel/integracoes — disparam em eventos do sistema" },
      { chave: "Sync slaves", valor: "Cardápios espelhados em sites externos (legacy yugochat). Replicação via /api/sync/*" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "modulos",
    titulo: "Módulos opcionais (por plano)",
    icone: Layers,
    itens: [
      { chave: "Como funciona",  valor: "empresa.modulos_ativos JSONB com lista de slugs habilitados. assertModuloAtivo() em cada API." },
      { chave: "Módulos comuns", valor: (
        <code className="text-xs">
          delivery · mesas · totem · pdv · cozinha · estoque · fidelidade · cashback · cupons · ifood · rede · multi-loja · whatsapp_marketing · mala_direta · relatorios_avancados · backup · api_keys
        </code>
      )},
      { chave: "Bloqueio UI", valor: "ModuloLockedModal mostra paywall com upgrade plan quando rota requer módulo desativado" },
      { chave: "Modificação", valor: "Master controla módulos por empresa em /admin/empresas/[id]. Cliente vê em /painel/empresa/contrato" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "totem",
    titulo: "Totem (kiosk)",
    icone: Smartphone,
    itens: [
      { chave: "Rota",          valor: "/totem/[slug] — pública, sem auth" },
      { chave: "Fluxo",         valor: "start → identificacao → tipoConsumo → cardapio → carrinho → pagamento → sucesso" },
      { chave: "Idiomas",       valor: "PT-BR / EN / ES (toggle no header)" },
      { chave: "Pagamentos no totem", valor: "Dinheiro · PIX (QR) · Cartão pinpad (Cielo TEF/LIO) · Cartão maquininha externa" },
      { chave: "Offline",       valor: "Service Worker armazena pedidos quando rede cai, sincroniza ao voltar (queueCount no header)" },
      { chave: "PIX no local",  valor: "Imprime cupom imediato (cliente está presente). Delivery aguarda webhook." },
      { chave: "Upsell bebida", valor: "Modal automático antes do checkout se cart não tem bebida (detecta por tipo OU categoria)" },
      { chave: "Scrollbars",    valor: ".totem-root esconde todas scrollbars (touch UX limpa)" },
      { chave: "Temas",         valor: "Claro / escuro. Cores derivadas de cor_primaria via color-mix() (sem filter brightness pra evitar serrilhado)" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "seguranca",
    titulo: "Segurança & compliance",
    icone: Lock,
    itens: [
      { chave: "Rate limit",    valor: "Redis-based, configurável por rota. Default 100req/min/IP em /api/auth/*" },
      { chave: "Sanitização",   valor: "Todo input passa por zod. Strings normalizadas (sanitizeSlug, etc)" },
      { chave: "Auditoria",     valor: "auditoria_log grava ação + usuário + dados antes/depois pra mutações sensíveis" },
      { chave: "LGPD",          valor: "Exportação + exclusão de dados pessoais via /painel/lgpd" },
      { chave: "CORS",          valor: "Origins controlados via NEXT_PUBLIC_APP_URL + headers customizados" },
      { chave: "Secrets",       valor: "Variáveis sensíveis no .env, criptografia adicional em campos críticos com ENCRYPTION_KEY" },
      { chave: "Hooks Git",     valor: "Nunca commit de .env. .gitignore protege." },
      { chave: "Cron auth",     valor: "Header x-cron-secret (CRON_SECRET) obrigatório em todas rotas /api/cron/*" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "build-deploy",
    titulo: "Build & deploy",
    icone: Workflow,
    itens: [
      { chave: "Build",        valor: "next build (standalone) — empacota Node.js minimal pra container" },
      { chave: "Dockerfile",   valor: "Multi-stage: deps → build → runner (produção em ~150MB)" },
      { chave: "Deploy VPS",   valor: "git pull + docker build + docker run com --env-file .env" },
      { chave: "Health check", valor: "GET /api/health — verifica db/redis/minio" },
      { chave: "Logs",         valor: "stdout/stderr — capturados via docker logs cardapio_app" },
      { chave: "Versionamento", valor: "Commit hash exposto em /api/version + VersaoFooter no painel" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "variaveis",
    titulo: "Variáveis de ambiente",
    icone: FileText,
    itens: [
      { chave: "DB_*",           valor: "DB_HOST · DB_PORT · DB_USER · DB_PASSWORD · DB_NAME · DB_POOL_MAX" },
      { chave: "REDIS_*",        valor: "REDIS_HOST · REDIS_PORT · REDIS_PASSWORD" },
      { chave: "MINIO_*",        valor: "MINIO_ENDPOINT · MINIO_PORT · MINIO_USE_SSL · MINIO_ACCESS_KEY · MINIO_SECRET_KEY · MINIO_BUCKET · MINIO_PUBLIC_URL" },
      { chave: "JWT_*",          valor: "JWT_SECRET · JWT_REFRESH_SECRET · JWT_EXPIRES_IN · JWT_REFRESH_EXPIRES_IN" },
      { chave: "CRON_SECRET",    valor: "Token compartilhado pra rotas /api/cron/*" },
      { chave: "ENCRYPTION_KEY", valor: "32-byte hex pra AES-256-GCM em campos sensíveis" },
      { chave: "EVOLUTION_*",    valor: "EVOLUTION_API_URL · EVOLUTION_API_KEY · EVOLUTION_PUBLIC_URL · EVOLUTION_AUTO_PROVISION" },
      { chave: "VAPID_*",        valor: "Push notification keys (web push)" },
      { chave: "MERCADOPAGO_*",  valor: "ACCESS_TOKEN · WEBHOOK_SECRET (override gateway global)" },
      { chave: "BACKUP_R2_*",    valor: "Bucket Cloudflare R2 pra backup off-site" },
      { chave: "NEXT_PUBLIC_*",  valor: "APP_URL · BASE_DOMAIN — expostos pro browser (sem segredos)" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "manutencao",
    titulo: "Manutenção & monitoramento",
    icone: Activity,
    itens: [
      { chave: "Logs cron",     valor: "Cada rota /api/cron/* imprime console.info com totais. Ver via docker logs" },
      { chave: "Saúde",         valor: "/painel/saude — última sincronia, jobs print pendentes, status agentes" },
      { chave: "Auditoria",     valor: "/painel/auditoria — log filtrado de mutações" },
      { chave: "Backup automático", valor: "Cron diário (gerar mensalidades + backup_db). Verificar última execução no Saúde" },
      { chave: "Atualização",   valor: "git pull + docker build + restart. Migrations rodadas manualmente." },
      { chave: "Rollback",      valor: "git revert + docker build + restart. Migrations precisam compensatória manual." },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "cache",
    titulo: "Cache (Redis no master + edge na retaguarda)",
    icone: Layers,
    itens: [
      { chave: "Camada 1 — Redis (master)", valor: "Cardápio público cacheado em Redis com TTL 5min. Chave: cardapio:pub:{slug}." },
      { chave: "Invalidação automática", valor: "Mutations em produto/categoria/disponibilidade chamam invalidarCardapioPorEmpresa(empresaId) que resolve todos slugs da rede e deleta as chaves Redis." },
      { chave: "Camada 2 — Nginx disk (retaguarda)", valor: "Quando há retaguarda local, ela cacheia em disco: imagens 7d, cardápio 5min, estáticos 30d." },
      { chave: "Fallback gracioso", valor: "Se Redis cair, master serve direto do PG (sem erro). Header X-Retaguarda-Cache (HIT/MISS/BYPASS) mostra origem da resposta." },
      { chave: "Cache hit esperado", valor: "Master Redis: ~95% das leituras de cardápio. Retaguarda Nginx: ~98% das imagens, ~80% das leituras de cardápio (TTL curto)." },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "retaguarda",
    titulo: "Retaguarda (proxy local na loja)",
    icone: Network,
    itens: [
      { chave: "Conceito",   valor: "Mini-PC na loja do cliente roda Nginx + Redis local. Totens/PDVs batem nele em vez de irem direto ao master. Reduz acessos simultâneos no servidor central." },
      { chave: "Hardware mínimo", valor: "2 vCPU, 4 GB RAM, 20 GB SSD. Raspberry Pi 4 ou Mini PC Intel NUC." },
      { chave: "Stack",      valor: "Docker Compose 7 containers: nginx-cache (cache+proxy) + redis (buffer+idem) + worker (offline queue) + purger (invalidação) + reporter (heartbeat+métricas Node) + cloudflared (tunnel) + watchtower (auto-update)" },
      { chave: "Buffer offline", valor: "Worker Node :3001 — nginx detecta master fora (5xx/timeout) → fallback @offline_queue → POST /__queue → Redis LIST + Idempotency-Key gerado → 202 sintético pro totem. Drainer 5s replaya com header pra master deduplicar." },
      { chave: "Idempotency",  valor: "Master usa lib/idempotency.ts em POST /api/pub/pedidos + /api/pub/cliente. Header Idempotency-Key → Redis idem:{ns}:{key} TTL 24h. Replay devolve cache sem reprocessar." },
      { chave: "Invalidação remota", valor: "Purger Node :3002 recebe POST /__purge {slug} → md5('v1:/api/pub/cardapio/{slug}') → unlink no /cache/html. Master fire-and-forget após mutation." },
      { chave: "Métricas heartbeat", valor: "Reporter Node coleta /__queue/status (worker) + /__stats (purger) e empacota em metricas JSONB no heartbeat 60s. Master persiste em retaguardas.metricas." },
      { chave: "Wizard install", valor: "Master /admin/retaguardas → '+ Nova retaguarda' → POST install-token cria token em retaguardas_install_tokens (TTL 24h, uso único). install.sh com INSTALL_TOKEN consome via /api/retaguarda/install-config." },
      { chave: "Auto-update",   valor: "Watchtower polla Docker Hub 12h, atualiza containers com image: tagged. Containers com build: (worker/purger/reporter) são pulados automaticamente." },
      { chave: "Cron cleanup",  valor: "/api/cron/cleanup-retaguardas marca ativo=false se ultimo_heartbeat >24h. Configurar no crontab da VPS." },
      { chave: "Conectividade", valor: "Cloudflare Tunnel — SEM IP fixo, SEM port-forward, SEM cert SSL local. CF termina HTTPS na borda." },
      { chave: "Multi-loja", valor: "1 conta CF = N tunnels = N lojas. Cada install.sh cria um tunnel próprio (retaguarda-{slug}) e CNAME único." },
      { chave: "Provisão CF API", valor: "install.sh chama POST /accounts/{id}/cfd_tunnel pra criar tunnel + PUT /cfd_tunnel/{id}/configurations pra rota + POST/PUT /zones/{id}/dns_records pra CNAME. Idempotente — reusa tunnel se já existir." },
      { chave: "Heartbeat",  valor: "Reporter manda POST a cada 60s pra /api/retaguarda/heartbeat com x-retaguarda-secret. UPSERT em retaguardas com IP público." },
      { chave: "Status",     valor: "/admin/retaguardas lista todas com online (<90s) / instável (90-180s) / offline (>180s). Auto-refresh 30s." },
      { chave: "Detalhe + ações", valor: "/admin/retaguardas/[id]: métricas live (queue + cache disk), purge remoto por slug, desativar. Auto-refresh 15s." },
      { chave: "Tabela DB",  valor: "retaguardas (retaguarda_id UUID UNIQUE, empresa_id, dominio, ip_publico, ultimo_heartbeat, metricas JSONB)" },
      { chave: "Acesso interno LAN", valor: "Totem pode usar IP direto: http://192.168.x.x/totem/{slug}. Sem PWA mas funciona 100% (Chrome 'add to home' dá fullscreen)." },
      { chave: "Acesso PWA + LAN", valor: "Split-DNS no roteador: loja-X.tthreedigital.com.br → IP local. Dentro da loja resolve LAN (1ms), fora resolve via CF tunnel." },
      { chave: "Cache TTLs", valor: "Imagens /api/pub/media/* 7d · Cardápio /api/pub/cardapio/{slug} 5min · /_next/static/* 30d · POSTs pass-through" },
      { chave: "Instalação", valor: "1 comando: curl -fsSL .../install.sh | sudo bash. Tempo: ~3min. Instala Docker, cria tunnel CF, sobe containers." },
      { chave: "Não cacheado", valor: "Mutations (POST/PATCH/DELETE), HTML painel/totem (auth dinâmica), SSE/streams, /api/pub/cardapio/{slug}/taxa-entrega" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "monitor",
    titulo: "Monitor de saturação",
    icone: Activity,
    itens: [
      { chave: "Endpoint",  valor: "GET /api/health/limits — público, sem auth (proxy externo decide)" },
      { chave: "Retorna",   valor: "JSON com pool_db, postgres, node, redis, alerta_nivel (ok/atencao/critico), alertas []" },
      { chave: "HTTP code", valor: "200 quando ok/atencao, 503 quando crítico — compatível com uptime-kuma/n8n" },
      { chave: "Thresholds", valor: "Pool >75% atenção, >90% crítico · Cache PG <95% atenção · Redis offline crítico · RSS Node >800MB atenção" },
      { chave: "Uso típico", valor: "uptime-kuma roda http check a cada 1min → se 503 dispara workflow n8n → envia mensagem WhatsApp pro admin" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "fluxo-pedido",
    titulo: "Fluxo completo de um pedido (totem → cozinha)",
    icone: Workflow,
    itens: [
      { chave: "1. Cliente identifica", valor: "Totem GET /api/pub/cliente?slug=&tipo=&valor= (telefone/cpf) ou cadastra via POST /api/pub/cliente?slug=" },
      { chave: "2. Carrega cardápio",   valor: "GET /api/pub/cardapio/{slug} → bate no Redis cache (5min); retaguarda cacheia em disco" },
      { chave: "3. Adiciona ao carrinho", valor: "Estado React local; imagens vêm de /api/pub/media/* (cacheado 7d na retaguarda)" },
      { chave: "4. Sugestão de bebida", valor: "Se cart sem bebida, modal automático mostra 3-6 produtos da categoria 'bebidas'" },
      { chave: "5. Finaliza",          valor: "POST /api/pub/pedidos/{slug} com itens, forma_pagamento, tipo_consumo. Pedido criado com status 'pendente'" },
      { chave: "6. PIX (se aplicável)", valor: "POST /api/pub/pagamentos/{slug} cria cobrança no gateway, retorna QR" },
      { chave: "7. Imprime cupom",      valor: "Se forma síncrona (dinheiro/pinpad) OU totem (tipo_consumo ≠ delivery), dispatch imediato: cupom cozinha (sem preço) + cupom cliente (com totais)" },
      { chave: "8. Agente puxa job",    valor: "print-agent local faz long-polling /api/agent/jobs → recebe job → imprime na impressora cadastrada" },
      { chave: "9. Notifica cliente",   valor: "Se cliente_id presente, notificarEvolution dispara mensagem WhatsApp ('Recebemos seu pedido')" },
      { chave: "10. Status updates",    valor: "PATCH /api/pedidos/{id}/status muda fase (confirmado→preparando→pronto→entregue). Cada transição dispara notify WhatsApp" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "limites",
    titulo: "Limites técnicos",
    icone: Globe,
    itens: [
      { chave: "Upload imagem", valor: "10 MB raw → comprimido pra ~100-300 KB WebP" },
      { chave: "Tempo de sessão", valor: "15 min access, 7 dias refresh" },
      { chave: "Pool DB",        valor: "20 conexões simultâneas (DB_POOL_MAX)" },
      { chave: "Rate limit auth", valor: "5 tentativas / 5 min por IP" },
      { chave: "Timeout fetch externa", valor: "8s checks, 15s actions (AbortSignal.timeout)" },
      { chave: "Max produtos por categoria", valor: "Sem limite hard; UI pagina 20-50" },
      { chave: "Max instances WhatsApp", valor: "1 por empresa (limitação Evolution single-instance)" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function EspecificacoesPage() {
  const [busca, setBusca]     = useState("");
  const [ativaId, setAtivaId] = useState(SPECS[0].id);

  const specsFiltradas = useMemo(() => {
    if (!busca.trim()) return SPECS;
    const b = busca.toLowerCase();
    return SPECS.filter(s =>
      s.titulo.toLowerCase().includes(b) ||
      s.itens.some(i =>
        i.chave.toLowerCase().includes(b) ||
        (typeof i.valor === "string" && i.valor.toLowerCase().includes(b))
      )
    );
  }, [busca]);

  return (
    <div className="flex gap-6">
      {/* Sumário */}
      <aside className="sticky top-4 hidden lg:block h-fit w-64 flex-shrink-0 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-2 px-2 py-1 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Layers className="h-3.5 w-3.5" />
          Capítulos
        </div>
        <nav className="space-y-0.5 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          {specsFiltradas.map(s => {
            const ativa = ativaId === s.id;
            const Icon = s.icone;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setAtivaId(s.id)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  ativa ? "bg-brand/15 text-brand" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{s.titulo}</span>
              </a>
            );
          })}
        </nav>
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 space-y-6">
        <header className="space-y-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <Cpu className="h-6 w-6 text-brand" />
              Especificações técnicas
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Detalhamento do que roda por baixo do sistema: stack, banco, infra,
              segurança, integrações, padrões internos.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar (ex: postgres, jwt, evolution, minio)…"
              className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand/40 focus:outline-none"
            />
          </div>
        </header>

        {specsFiltradas.map(s => {
          const Icon = s.icone;
          return (
            <section key={s.id} id={s.id} className="scroll-mt-4 rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <Icon className="h-5 w-5 text-brand" />
                {s.titulo}
              </h2>
              <div className="space-y-1.5">
                {s.itens.map((it, i) => (
                  <div key={i} className="rounded-lg bg-slate-900/40 px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-white">{it.chave}</p>
                      <div className="text-xs text-slate-300 break-words text-right max-w-full">
                        {it.valor}
                      </div>
                    </div>
                    {it.detalhe && (
                      <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{it.detalhe}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <footer className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center text-xs text-slate-500">
          Pra dúvidas funcionais de cada tela, veja o{" "}
          <a href="/painel/ajuda/guia" className="text-brand hover:underline">guia do sistema</a>.
        </footer>
      </div>
    </div>
  );
}
