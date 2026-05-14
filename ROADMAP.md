# Roadmap — Cardápio SaaS

Próximas features planejadas, em ordem de prioridade. Itens marcados ✅
já estão em produção.

---

## 🚧 Próximo ciclo (alta prioridade)

### Mensalidades + cobrança recorrente (Mercado Pago Checkout Pro)

**Por quê:** master precisa visibilidade + cobrança automática das
mensalidades das empresas SaaS. Hoje não há gestão financeira recorrente.

**Decisão técnica: Checkout Pro vs Transparente** → **Checkout Pro**
recomendado:
- Suporta `PreApproval` (assinatura mensal recorrente)
- MP cobra automaticamente (cartão tokenizado) ou gera boleto/PIX manual
- Cobertura completa de métodos
- Sem PCI compliance pra nós (MP hospeda)
- Lib base já configurada (`MERCADOPAGO_ACCESS_TOKEN` em uso pra módulos)

**Escopo:**
1. Schema `mensalidades` (empresa_id, mes_ref, valor, vencimento, status,
   mp_preference_id, mp_payment_id, pago_em)
2. Cron mensal dia 1: gera mensalidade pra cada empresa ativa, cria
   preferência MP, salva URL pagamento
3. Email automático `fatura_mensal` (template novo) com link MP + dados
   do dono SaaS + valor + vencimento. Reenvio D-3, D-1, D+1
4. Webhook MP estendido pra processar mensalidades (split por
   external_reference prefix MENS- vs MOD-)
5. Page `/admin/financeiro/mensalidades`: lista por empresa, filtros
   (status, mês), cards (total/aberto/atrasado), ações manuais
6. Page `/painel/financeiro/mensalidades`: empresa vê próprias faturas
   + botão "Pagar agora" → redirect Checkout Pro
7. Cron suspensão D+15 (suspensa) e D+30 (inadimplente)

**Pendência decisão:** assinatura recorrente automática (PreApproval)
vs cobrança manual mensal. Recorrente é melhor UX mas exige cartão
tokenizado no MP. Pode fazer híbrido (oferece os 2).

### ✅ SMTP / E-mail transacional (entregue v2.x)

Implementado:
- Tabela `smtp_config` (singleton) com host/port/auth/from + telemetria
- Tabela `email_templates` com mustache simples ({{var}} + {{#var}}block{{/var}})
- Tabela `email_jobs` (queue + retry exponencial 5/25/125min)
- Tabela `password_resets` (multi-canal email/whatsapp)
- Lib `@/lib/email/smtp.ts` com `enfileirar()`, `processarQueue()`, `enviarDireto()`
- Templates default: `boas_vindas` + `reset_senha` (HTML responsivo)
- Endpoints admin: `/api/admin/email/{config,templates,logs,testar}`
- Página `/admin/email` (config + teste com botão dedicado)
- Cron `/api/cron/enviar-emails` (processa até 20/chamada, rodar 1-2min)
- Hook automático: `POST /api/auth/cadastro-empresa` enfileira boas-vindas
- Recuperação senha multi-canal: `/api/auth/{recuperar,redefinir}` + UI
  `/recuperar-senha` (escolhe email ou WhatsApp, código 6 dígitos, TTL 15min)

Pendências futuras (não bloqueantes):
- ~~Templates pra: fatura, pagamento_falhou, manutencao, trial_expirando~~ ✅
- ~~Hooks automáticos pra esses eventos~~ ✅ (pagamento OK/falhou via webhook MP-modulos, trial_expirando via cron)
- ~~Página `/admin/email/templates` (editor visual)~~ ✅
- ~~Página `/admin/email/logs` (consulta de jobs + retry)~~ ✅
- ~~Criptografia da `smtp_config.password` (hoje plaintext)~~ ✅ AES-256-GCM via `@/lib/security/encrypt`
- Hook automático pra "manutencao_aviso" (botão admin pra disparar pra todas empresas)
- Webhook de bounce/spam complaint (SES/Mailgun report pra marcar emails como inválidos)

Como configurar:
1. `/admin/email` → preencher SMTP (host/port/user/pwd/from) → ativar
2. Botão "Enviar teste" → confirmar entrega
3. VPS: instalar cron `*/2 * * * * curl -X POST -H "x-cron-secret: $CRON_SECRET" $URL/api/cron/enviar-emails`

### SMTP / E-mail transacional do master (especificação original)
**Por quê:** hoje notificações operacionais saem via WhatsApp (Evolution).
Precisamos de e-mail pra: boas-vindas em cadastro, recuperação de senha,
faturas/cobranças, comunicados gerais.

**Escopo:**
- Configuração SMTP no `/admin/config` (servidor, porta, user, senha,
  TLS/SSL, from_name, from_email, reply_to)
- Templates HTML customizáveis por evento (boas-vindas, reset senha,
  fatura, manutenção, etc.) com variáveis tipo `{{empresa_nome}}`,
  `{{link_recuperacao}}`, `{{logo_url}}`
- Queue/retry pra falhas de envio (similar ao print_jobs)
- Logs de envio com status (entregue, bounce, falha) consultáveis em
  `/admin/email/logs`
- Endpoint de teste: `POST /api/admin/email/teste` envia pra um destino

**Eventos que disparam automaticamente:**
1. **Cadastro de empresa nova** → boas-vindas com HTML branded (logo do
   master, nome do SaaS, próximos passos, links pro painel)
2. **Recuperação de senha** → link com token expirável
3. **Pagamento confirmado** → recibo
4. **Pagamento falhou** → aviso + link pra atualizar
5. **Manutenção programada** → 24h antes
6. **Trial expirando** → 3 dias e 1 dia antes

**Bibliotecas sugeridas:** `nodemailer` (suporta SMTP/SES/Mailgun),
`mjml` (templates responsivos) ou `react-email` (templates JSX).

### Recuperação de senha multi-canal (e-mail OU WhatsApp)
Usuário escolhe no formulário "esqueci senha" se quer receber código por:
- E-mail (precisa SMTP configurado — feature acima)
- WhatsApp (precisa Evolution configurado — já temos)

**Escopo:**
- UI no `/login` → link "Esqueci minha senha"
- Form pede e-mail ou telefone, oferece os 2 canais se ambos estiverem
  cadastrados pro usuário
- Endpoint `POST /api/auth/recuperar` aceita `{ identificador, canal }`
- Token de 6 dígitos com TTL 15min, salvo em tabela `password_resets`
- Envia via canal escolhido com template branded
- Endpoint `POST /api/auth/redefinir` aceita `{ identificador, codigo, nova_senha }`

---

## 📋 Backlog (média prioridade)

### ✅ Static files dinâmicos (white-label completo) — entregue v2.x
- `manifest-admin.json` → route handler `/manifest-admin.json/route.ts`
  com nome+ícone do branding
- `openapi.json` → route handler que lê `public/openapi-base.json` e
  injeta título/descrição/contact dinâmicos
- `sw.js` push fallback title trocado por "Notificação" genérica (push
  events com título customizado já enviam corretamente — fallback só
  dispara se payload omitir title)
- `totem/layout.tsx` generateMetadata dinâmica (title/description/PWA)

### ✅ Wizard onboarding completo — entregue v2.x
- 8 steps: welcome → dados → **horário** → categoria → produto → **PIX** →
  **mesa+QR** → conclusão
- Steps opcionais (PIX, mesa) têm botão "Pular" — wizard avança sem dados
- Horário de abertura/fechamento (PATCH config)
- Chave PIX direta (PATCH config: pix_chave + pix_tipo)
- Primeira mesa com capacidade (POST mesas — QR gerado automaticamente)

### Caixa compartilhado: feedback fechamento
- Quando 2 operadores compartilham caixa e um fecha, avisar o outro
  via SSE/polling pra UI dele atualizar

### ✅ Métricas Prometheus + Grafana — entregue v2.x
- Lib `@/lib/observability/metrics` com `prom-client` + collectors
- Endpoint `GET /api/metrics` protegido por `METRICS_TOKEN` (env var)
- Coletas: HTTP requests/latência, pedidos criados (tipo+origem),
  pagamentos (forma+status), caixas abertos, email queue, print queue,
  erros por origem+code, default Node metrics (CPU/mem/GC)
- Instrumentado: POST /api/pedidos com recordPedido()
- Pendência: instrumentar /api/pub/pedidos + webhooks de pagamento +
  Grafana dashboards (deferido — endpoint pronto pra scrape)

### ✅ 2FA TOTP — entregue v2.x
- Migration 051 (totp_secret cifrado AES-256-GCM, totp_enabled, recovery codes)
- Lib `@/lib/auth/totp` com otplib + qrcode (8 recovery codes one-shot)
- Endpoints `/api/auth/2fa/{setup,verify,disable,status}`
- Login `/api/auth/login` aceita `codigo_2fa` (TOTP 6 dígitos OU recovery)
- Page `/admin/seguranca` com fluxo wizard (QR, código, download recovery)
- UI `/login` mostra campo 2FA quando backend retorna `2FA_REQUIRED`
- Recovery codes consumíveis (one-shot) com fallback se perder app
- Lock por IP segue rate-limit base do login

### ✅ Manutenção broadcast — entregue v2.x
- API `/api/admin/manutencao/avisar` enfileira email pra todas empresas
  ativas/teste com email cadastrado
- Page `/admin/manutencao` com form (início/duração/impacto/detalhes) +
  preview mode + dispara broadcast
- Anti-duplicação 6h por empresa
- Reusa template `manutencao_aviso` (editável em /admin/email/templates)

### ✅ Rate limit avançado — entregue v2.x
- Novos configs em `@/lib/security/rate-limit`:
  - `PUB_PEDIDO_RATE_LIMIT` (20 req/min/IP) — anti-DoS cardápio público
  - `RECUPERAR_RATE_LIMIT` (5 req/5min/IP) — anti-spam reset senha
  - `SENSIBLE_RATE_LIMIT` (10 req/min/IP) — anti-bruteforce 2FA
- Aplicado: POST /api/pub/pedidos/[slug], POST /api/auth/recuperar,
  POST /api/auth/2fa/verify
- Configurável via env: RATE_LIMIT_PUB_PEDIDO, RATE_LIMIT_RECUPERAR,
  RATE_LIMIT_SENSIBLE
- Pendência futura: impersonate, exclusão de empresa

### App mobile nativo (PWA já existe)
- React Native ou Capacitor
- Push notification nativa
- Acesso offline primeiro pro KDS

---

## ✅ Concluído

### v2.x (atual)
- Multi-tenant + RBAC + LGPD ✅
- PDV + Caixa por usuário + entrega editável ✅
- KDS + Totem + Autoatendimento ✅
- Print agent (Windows raw) + VPS agent ✅
- Modo manutenção + health checks + diagnóstico cron ✅
- Backup local + DR pra Cloudflare R2 ✅
- Wizard onboarding + checklist ✅
- Branding white-label (logo, nome, DPO, contatos) ✅
- ConfirmModal (substitui native confirms) ✅
- Versão visível em todas as sidebars ✅
- Auto-deploy com rollback (deploy.sh) ✅
- Mala direta WhatsApp + cron aniversários ✅
- Mercado Pago Checkout Pro + webhook HMAC ✅
- Slave sync (instâncias locais) ✅
