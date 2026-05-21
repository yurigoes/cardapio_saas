# Three Digital Mídia — Landing + Cadastro

Site de divulgação do serviço de mídia indoor, com planos e captação de leads.
Roda na porta **3100** (não conflita com o Three Digital na 3000).

## O que faz hoje (MVP)

- Landing page completa (hero, recursos, como funciona, planos, CTA)
- Página de cadastro `/cadastro?plano=X` com formulário
- API `/api/leads` que:
  - Salva o lead no Postgres (tabela `midia_leads`, criada automática)
  - Notifica você via WhatsApp (Evolution) que chegou lead novo

## Rodar local

```bash
cd landing
cp .env.example .env   # preenche DATABASE_URL + Evolution
npm install
npm run dev            # http://localhost:3100
```

## Deploy na VPS (Docker)

```bash
# Build standalone
npm install && npm run build

# Roda em container (ou direto com node)
docker run -d --name midia_landing \
  --network cardapio_net \
  -p 127.0.0.1:3100:3100 \
  --restart unless-stopped \
  --env-file .env \
  -v $(pwd)/.next/standalone:/app \
  node:20-alpine node /app/server.js
```

Depois adiciona no Cloudflare Tunnel: `midiaindoor.tthreedigital.com.br` → `localhost:3100`
(ou use o domínio que preferir pra parte comercial).

## Editar planos

`src/lib/planos.ts` — muda preço, nome, recursos. Reflete na landing + cadastro.

## Roadmap (próximas etapas)

Esta é a fundação (marketing + captação). Pra virar SaaS self-service completo:

- [ ] **Pagamento recorrente** (Mercado Pago PreApproval — reusar lógica do Three Digital)
- [ ] **Área do cliente** (login, ver fatura, gerenciar telas)
- [ ] **Auto-provisionamento Xibo**: ao aprovar pagamento, criar via API Xibo
      o usuário + pasta + display do cliente automaticamente
- [ ] **Painel admin** pra você aprovar leads → ativar conta → cobrar
- [ ] **Onboarding**: cliente recebe instruções de instalar o player Android

Quando quiser implementar, dá pra clonar muita coisa do Three Digital
(auth JWT, gateways de pagamento, mensalidades).
