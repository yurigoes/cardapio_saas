# Roadmap — Cardápio SaaS

Próximas features planejadas, em ordem de prioridade. Itens marcados ✅
já estão em produção.

---

## 🚧 Próximo ciclo (alta prioridade)

### SMTP / E-mail transacional do master
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

### Static files dinâmicos (white-label completo)
- `public/sw.js` — push notification fallback title hardcoded
- `public/manifest-admin.json` — nome do PWA admin
- `public/openapi.json` — title da spec OpenAPI
- Solução: converter os 3 em route handlers (`/sw.js/route.ts`,
  `/manifest-admin.json/route.ts`, `/openapi.json/route.ts`) que leem
  branding e devolvem com `Cache-Control` apropriado

### Wizard onboarding mais completo
- Já existe versão básica (modal multi-step)
- Adicionar: step de configurar PIX direto, step de horário de
  funcionamento, step de cadastro de mesa+QR

### Caixa compartilhado: feedback fechamento
- Quando 2 operadores compartilham caixa e um fecha, avisar o outro
  via SSE/polling pra UI dele atualizar

### Métricas Prometheus + Grafana
- `/api/metrics` exposing Prometheus format
- Dashboards pra: pedidos/min, latência endpoints, error rate,
  caixa aberto/fechado por dia

### 2FA pro master
- TOTP (Google Authenticator) opcional pro role=master
- Recovery codes
- Lock por IP

### Rate limit avançado
- Hoje tem básico (login). Estender pra:
  - POST pedido público (anti-DoS no cardápio)
  - Webhooks de gateway (anti-replay)
  - Endpoints sensíveis (impersonate, exclusão)

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
