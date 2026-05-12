# Cardápio SaaS

Plataforma multi-tenant para restaurantes: cardápio digital, autoatendimento (totem), KDS,
gestão de pedidos, mesas, caixa PDV, fidelidade, pagamentos online com 4 gateways,
impressão térmica, observabilidade completa.

**Stack:** Next.js 14 (App Router) · TypeScript · PostgreSQL 16 · Redis · MinIO · Docker

---

## Sumário

- [Stack & arquitetura](#stack--arquitetura)
- [Módulos](#módulos)
- [Setup de desenvolvimento](#setup-de-desenvolvimento)
- [Deploy em produção](#deploy-em-produção)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Migrations](#migrations)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Convenções](#convenções)

---

## Stack & arquitetura

### Backend
- **Next.js 14 App Router** com Server Components + Route Handlers (API routes)
- **PostgreSQL 16** com pool `pg` (sem ORM — SQL direto)
- **JWT** com `jose` (access token + refresh)
- **Multi-tenant** por `empresa_id` em toda query (FK + RBAC)
- **Web Push** (VAPID) para notificações reais
- **Sharp** para compressão de imagens (WebP automático)

### Frontend
- **TailwindCSS 3** com cor `brand` lendo `--color-primary-rgb` (CSS var por tenant)
- **Framer Motion** para animações
- **Lucide React** para ícones (consistência visual)
- **Service Worker** (`/public/sw.js`) com fila offline em IndexedDB

### Infraestrutura
- **Docker Compose** com app + Postgres + Redis + MinIO + Evolution API + Traefik
- **MinIO** como S3 local para imagens
- **Evolution API** para WhatsApp Business
- **Web Push VAPID** para notificações fora-do-browser

### Multi-tenant
- Cada empresa tem `slug` único
- JWT carrega `empresaId` + `role` + `sub` (user id)
- Toda query filtra por `empresa_id` (defesa em profundidade)
- Master role (`master`) tem acesso cross-tenant via `(admin-master)`

---

## Módulos

### Para o restaurante (`/painel`)

| Módulo | Caminho | O que faz |
|---|---|---|
| **Dashboard** | `/painel` | Cockpit consolidado: saúde, alertas acionáveis, atalhos, KPIs do dia, pedidos pendentes |
| **Pedidos** | `/painel/pedidos` | Lista paginada, filtros, detalhe completo (com variações), reabertura de cancelados, alertas de novo pedido (som + notificação + push) |
| **KDS Cozinha** | `/painel/cozinha` | Cards por status, beep em pedido novo, botão "chamar cliente", auto-print configurável |
| **Cardápio** | `/painel/cardapio` | CRUD de produtos e categorias com upload de imagens, **editor visual de variações** (tamanhos, adicionais), pontos de fidelidade |
| **Mesas** | `/painel/mesas` | CRUD, abrir/fechar/transferir mesa, comandas acumuladas, histórico do dia, QR Code para totem |
| **Caixa PDV** | `/painel/caixa` | Abertura/fechamento com troco, sangria, reforço, integração automática com vendas (online via webhook + presencial via "entregue"), histórico auditável |
| **Financeiro** | `/painel/financeiro` | KPIs, breakdown por forma de pagamento, gráfico de pico por hora, top produtos/clientes, export CSV (pedidos + movimentos de caixa) |
| **Cobranças** | `/painel/pagamentos` | Log de todas as transações dos gateways, sincronização manual, **reprocessamento forçado** quando webhook falha |
| **Gateways** | `/painel/gateways` | CRUD de gateways online (Mercado Pago, Pagar.me, Asaas, Stone), webhook URL com botão copiar, definir padrão |
| **Estoque** | `/painel/estoque` | Inventário com edição inline, **consumo automático em vendas** (com auditoria), entradas/perdas/ajustes manuais, alertas de baixo, export CSV |
| **Clientes** | `/painel/clientes` | Lista, perfil completo, ajuste manual de pontos |
| **Cupons** | `/painel/cupons` | CRUD com tipos (percentual/fixo/frete), uso por cliente, resgate por pontos |
| **Painel TV** | `/painel-tv/[slug]` | Tela fullscreen para chamar cliente após pedido pronto (cozinha aciona) |
| **Saúde** | `/painel/saude` | Status real-time de DB, gateways, WhatsApp, caixa, estoque, pedidos. Auto-refresh 30s |
| **Auditoria** | `/painel/auditoria` | Visualizador de `audit_log` com filtros, diff JSON antes/depois |
| **Backup** | `/painel/backup` | Export/import JSON da configuração completa (não-destrutivo) |
| **Configurações** | `/painel/config` | Identidade, contato, pagamentos aceitos, fidelidade (pontos + cashback), totem |
| **Integrações** | `/painel/integracoes` | WhatsApp Evolution (QR + envio), N8N |

### Para o cliente final

| Tela | Caminho | O que faz |
|---|---|---|
| **Totem autoatendimento** | `/totem/[slug]` | PWA offline-first, identificação cliente, fluxo completo, **PIX integrado**, cupom + cashback no checkout, variações de produto, fila local em IndexedDB se offline |
| **Painel cliente** | `/cliente/[slug]` | PWA instalável, login telefone/CPF, saldo de pontos + cashback, cupons disponíveis, **resgate de cupom por pontos**, histórico de pedidos |
| **QR Mesa** | `/totem/[slug]?mesa=X` | Cliente escaneia → faz pedido direto no celular, pedidos acumulam na mesma mesa |

### Para garçom

| Tela | Caminho | O que faz |
|---|---|---|
| **Lista de mesas** | `/garcom` | Status de cada mesa, abrir pedido novo |
| **Detalhe mesa** | `/garcom/mesa/[id]` | Adicionar itens (acumula no pedido aberto), enviar para cozinha |

### Para o dono do SaaS (`(admin-master)`)

| Tela | Caminho | O que faz |
|---|---|---|
| **Master Dashboard** | `/admin` | KPIs cross-tenant, alertas de empresas (suspensa/expirando), top 10, gráfico 24h |
| **Empresas** | `/admin/empresas` | CRUD de tenants, status, plano |
| **Planos** | `/admin/planos` | CRUD de planos com módulos ativos |
| **Webhooks** | `/admin/webhooks` | Log cross-tenant de todos os webhooks recebidos (filtros + diagnóstico) |
| **Auditoria/Logs** | `/admin/auditoria`, `/admin/logs` | Cross-tenant |
| **Financeiro** | `/admin/financeiro` | Receita consolidada da plataforma |

---

## Pagamentos

4 gateways implementados com interface comum (`IGateway`):

| Gateway | PIX | Cartão | Boleto | Webhook |
|---|:---:|:---:|:---:|:---:|
| **Mercado Pago** | ✅ | ✅ | — | ✅ HMAC SHA256 |
| **Pagar.me** v5 | ✅ | ✅ tokenizado | — | ✅ HMAC SHA1 |
| **Asaas** v3 | ✅ | ✅ | ✅ | ✅ token compartilhado |
| **Stone** OpenBank | ✅ | ✅ | — | ✅ HMAC SHA256 |
| **PIX Direto** (EMV) | ✅ | — | — | — (estático) |

Para cada gateway: configuração via `/painel/gateways` com webhook URL pronta para copiar.

### Fluxo do pagamento online

1. Cliente confirma pedido no totem com PIX
2. `POST /api/pub/pagamentos/[slug]` cria cobrança via gateway escolhido (ou padrão)
3. Cliente vê QR code, paga
4. Gateway envia webhook → `/api/webhooks/{gateway}` → atualiza pedido,
   registra venda no caixa, dispara push, registra em `webhook_log`
5. Se webhook falhar, admin pode usar **Sincronizar** ou **Forçar reprocessamento**
   na tela de `/painel/pagamentos`

---

## Setup de desenvolvimento

### Pré-requisitos
- Node.js 20+
- Docker + Docker Compose
- Git

### Subir tudo

```bash
git clone <repo>
cd cardapio_saas

# Variáveis (copiar e ajustar)
cp .env.example .env

# Subir Postgres + Redis + MinIO + Evolution
docker compose up -d postgres redis minio evolution

# Rodar migrations
for f in database/migrations/*.sql; do
  docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas < "$f"
done

# Instalar deps + rodar app
npm install
npm run dev
```

App em `http://localhost:3000`. Login master padrão definido nas migrations seed.

---

## Deploy em produção

Veja `DEPLOY.md` para guia completo. Resumo:

```bash
cd /mnt/cardapio
git pull origin main

# Aplicar migrations pendentes (cada uma só roda 1×, IF NOT EXISTS protege)
for f in database/migrations/*.sql; do
  docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas < "$f"
done

# Rebuild e restart
docker build -t cardapio_app:latest .
docker rm -f cardapio_app
docker run -d --name cardapio_app \
  --network cardapio_cardapio_net \
  --env-file /mnt/cardapio/.env \
  -p 3000:3000 \
  --restart unless-stopped \
  cardapio_app:latest
```

### Setup VAPID (Web Push) — uma vez

```bash
docker run --rm node:22-alpine npx --yes web-push generate-vapid-keys
# Copie e adicione ao .env:
echo "VAPID_PUBLIC_KEY=..." >> .env
echo "VAPID_PRIVATE_KEY=..." >> .env
echo "VAPID_SUBJECT=mailto:contato@seudominio.com" >> .env
```

---

## Estrutura de pastas

```
src/
├── app/                              Next.js App Router
│   ├── (admin-master)/               Painel do dono do SaaS (cross-tenant)
│   │   └── admin/
│   ├── (empresa)/                    Painel da empresa (tenant)
│   │   └── painel/                   Dashboard, módulos
│   ├── (garcom)/                     Interface mobile do garçom
│   ├── totem/[slug]/                 PWA totem público
│   ├── cliente/[slug]/               PWA cliente (saldo, cupons, histórico)
│   ├── painel-tv/[slug]/             Tela TV de chamada
│   ├── imprimir/                     Páginas de impressão térmica (HTML 80mm)
│   └── api/
│       ├── auth/                     Login, refresh, me, logout
│       ├── admin/                    Endpoints master
│       ├── painel/                   Endpoints do tenant
│       ├── pub/                      Endpoints públicos (totem, cliente)
│       ├── pedidos/                  CRUD de pedidos (auth)
│       ├── gateways/                 CRUD de configurações de gateway
│       ├── webhooks/                 Receivers dos gateways
│       ├── upload/                   MinIO + sharp (compressão WebP)
│       └── cozinha/, mesas/          ...
├── lib/
│   ├── auth/                         JWT, RBAC, middleware
│   ├── db/                           Pool pg + helpers query/transaction
│   ├── gateways/                     PixGateway, MercadoPago, Pagarme, Asaas, Stone
│   ├── caixa/                        Helper venda/estorno
│   ├── estoque/                      Helper consumo/movimento
│   ├── cashback/                     Helper credita/debita
│   ├── push/                         Web Push (VAPID + sendNotification)
│   ├── webhook/                      Helper logWebhook
│   ├── hooks/                        useTheme, useNewOrderAlerts, useWebPush
│   ├── security/                     audit, encrypt, rate-limit, sanitize
│   ├── modules/                      Checker de módulos ativos
│   └── utils/                        validators (zod), response (NextResponse helpers)
└── components/                       UI compartilhada (mínimo — preferir client por página)

database/
├── init/                             setup inicial do Postgres
└── migrations/                       SQL incrementais (001 → 020)

public/
├── sw.js                             Service Worker (PWA totem + cliente)
├── manifest.json                     PWA manifest base
├── icon.svg, favicon.ico
└── sons/
```

---

## Migrations

Numeradas sequencialmente. Cada migration é idempotente (`IF NOT EXISTS` em criação,
`ADD COLUMN IF NOT EXISTS`, etc).

| # | Migração | Descrição |
|---|---|---|
| 004 | seed_demo | Empresa demo + planos iniciais |
| 005 | slave_support | Suporte a réplicas |
| 006 | custom_domains_and_upload | `dominios_customizados`, MinIO config |
| 007 | clientes_cupons_config | Tabelas clientes, cupons, cupons_uso |
| 008 | totem_delivery_estoque | Customização totem, motoboys, estoque inicial |
| 009 | gateways_evolution_pix | `gateways_config`, evolution_url, pix_chave |
| 010 | painel_chamada_consumo | `chamados_painel`, tipo_consumo, forma_pagamento |
| 011 | pagamentos | Tabela `pagamentos` + webhook_secret |
| 012 | variacoes_produto | `produtos.variacoes` JSONB |
| 013 | caixa | Tabelas `caixas` + `caixa_movimentos` |
| 014 | caixa_obrigatorio | Flag para bloquear pedidos sem caixa |
| 015 | auto_print | Flag de impressão automática KDS |
| 016 | auto_print_cupom | Flag de impressão automática do cupom cliente |
| 017 | estoque_movimentos | Tabela `estoque_movimentos` (auditoria) |
| 018 | push_subscriptions | Tabela para Web Push VAPID |
| 019 | cashback | `clientes.saldo_cashback` + `cashback_movimentos` |
| 020 | webhook_log | Tabela `webhook_log` para diagnóstico cross-tenant |
| 021 | trials | `empresas.trial_inicio/fim/dias` + cron expiração 14d |

---

## Variáveis de ambiente

```bash
# App
PORT=3000
NODE_ENV=production
JWT_SECRET=...                         # 32+ chars random
ENCRYPTION_KEY=...                     # 32 chars (para encrypt de credenciais)

# Database
DB_HOST=cardapio_postgres
DB_PORT=5432
DB_NAME=cardapio_saas
DB_USER=cardapio
DB_PASSWORD=...
DB_POOL_MAX=20
DB_SSL=false

# Redis (opcional, para rate-limit distribuído)
REDIS_URL=redis://cardapio_redis:6379

# Cron interno (trials, jobs futuros)
CRON_SECRET=...                        # 32+ chars random; chamar com header x-cron-secret

# MinIO (storage de imagens)
MINIO_ENDPOINT=cardapio_minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=cardapio

# Evolution API (WhatsApp) — opcional
EVOLUTION_API_URL=http://cardapio_evolution:8080
EVOLUTION_API_KEY=...

# Web Push (gerar com `npx web-push generate-vapid-keys`)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contato@seudominio.com
```

---

## Convenções

### Padrão de API
- Sempre retornar `{ success: boolean, data?, error?, meta? }` via helpers em `src/lib/utils/response.ts`
- Validação de input com **zod** (`src/lib/utils/validators.ts`)
- `requireAuth(req)` no início de toda rota protegida
- `temPermissao(role, "x:y")` para RBAC granular
- Multi-tenant: SEMPRE filtrar por `empresa_id` do JWT (nunca do body)

### Idempotência
- Webhooks de gateway são idempotentes (mesmo evento 2× não duplica)
- Vendas no caixa: `(pedido_id, tipo='venda')` UNIQUE check
- Estoque: `(pedido_id, produto_id, tipo='saida')` UNIQUE check
- Cashback: `(pedido_id, tipo)` UNIQUE check

### Não-destrutivo
- DELETE é sempre `soft delete` (`deleted_at = NOW()`)
- Restore de backup nunca apaga, só atualiza/insere
- Reabertura de pedido cancelado é manual, com motivo + audit

### Segurança
- Credenciais de gateway encriptadas em repouso (`encrypt()` de `src/lib/security/`)
- CSP estrita em `next.config.js`
- Rate limit por IP/rota
- Audit log para ações sensíveis (CRUD, login, webhook reprocess, restore)
- Multi-tenant defense-in-depth (JWT + WHERE empresa_id em tudo)

### Testes manuais
Não há suite de testes automatizada formal. Fluxo de validação:
1. Login com usuário do tenant
2. Criar pedido pelo totem
3. Marcar status no KDS
4. Conferir caixa registrou venda
5. Ver auditoria

Para testar gateway: usar credenciais de sandbox.

---

## Histórico de versões

Veja commits no GitHub. Releases significativos:
- v2.0+: módulo SaaS multi-tenant
- v2.6+: 4 gateways online + observabilidade completa
- v2.7+: cashback dual com pontos, backup/restore, dashboard cockpit
