# Three Digital Mídia — Landing + SaaS self-service

Site comercial **e** plataforma self-service de mídia indoor. O cliente assina,
paga, faz upload de mídia e pareia as TVs — tudo sozinho. Por trás, a API
conversa com o Xibo CMS (mesma VPS, rede Docker interna) e provisiona tudo.

Roda na porta **3100** (não conflita com o Three Digital na 3000).

## Fluxo completo

```
/cadastro  ──signup──▶  conta+assinatura (pendente)  +  JWT
           ──pagamento/criar──▶  Mercado Pago PreApproval (recorrente)
           ──redirect──▶  checkout do Mercado Pago
                                │
                  (cliente paga)│
                                ▼
   /api/pagamento/webhook ◀── MP notifica "authorized"
        │  marca assinatura = ativa
        └─ provisionarConta(): cria Folder + Display Group no Xibo
                                ▼
/painel  ──login──▶  upload de mídia (vai pra pasta Xibo do cliente)
                     parear TVs (autoriza display + vincula ao grupo)
```

## Endpoints

| Rota | O que faz |
|------|-----------|
| `POST /api/auth/signup` | cria conta + assinatura (pendente), devolve JWT |
| `POST /api/auth/login` | email+senha → JWT |
| `POST /api/pagamento/criar` | cria PreApproval no MP, devolve `init_point` *(auth)* |
| `POST/GET /api/pagamento/webhook` | MP notifica → ativa assinatura + provisiona Xibo |
| `GET /api/painel/me` | dados da conta + status da assinatura *(auth)* |
| `GET/POST /api/painel/midias` | lista / faz upload de mídia na pasta do cliente *(auth)* |
| `GET/POST /api/painel/telas` | lista telas + pendentes / pareia uma TV *(auth)* |
| `POST /api/leads` | captação de lead (marketing) |

## Variáveis de ambiente

Veja `.env.example`. Essenciais:

- `DATABASE_URL` — Postgres (tabelas `midia_*` criadas no boot)
- `APP_URL` — URL pública (back_url do MP)
- `JWT_SECRET` — segredo forte
- `XIBO_URL` / `XIBO_CLIENT_ID` / `XIBO_CLIENT_SECRET` — API do Xibo
- `MP_ACCESS_TOKEN` — Mercado Pago

### Criar as credenciais do Xibo

No CMS: **Administration → Applications → Add Application**
- Name: `Three Digital Landing`
- Client Credentials: **Sim** (grant `client_credentials`)
- Marque os escopos necessários (library, displays, displaygroups, folders)
- Copie `Client ID` e `Client Secret` → `.env`

### Configurar o Webhook do Mercado Pago

No painel MP → **Suas integrações → Webhooks**, aponte para:
```
https://midiaindoor.tthreedigital.com.br/api/pagamento/webhook
```
Evento: **Assinaturas (preapproval)**.

## Rodar local

```bash
cd landing
cp .env.example .env   # preencher
npm install
npm run dev            # http://localhost:3100
```

## Deploy na VPS (Docker — recomendado)

O compose junta o container à rede `midia_net` (criada pelo stack do Xibo),
então a landing fala com o CMS por dentro via `http://midia_xibo_web`.

```bash
cd /opt/midia-indoor/landing       # ajuste ao seu path na VPS
git pull
cp .env.example .env               # editar: DATABASE_URL (host.docker.internal),
                                   #         JWT_SECRET, XIBO_*, MP_ACCESS_TOKEN, APP_URL
docker compose up -d --build
docker logs -f midia_landing       # conferir boot
```

Confirme que a rede do Xibo já existe (`docker network ls | grep midia_net`).
Se a landing precisar do Postgres do host, `DATABASE_URL` deve usar
`host.docker.internal:5432` (o compose já adiciona o `host-gateway`).

### Cloudflare Tunnel

A rota `midiaindoor.tthreedigital.com.br → localhost:3100` já foi adicionada
em `/etc/cloudflared/config.yml` (ver `../setup-tunnel-routes.sh`). Se não,
adicione o ingress e rode `cloudflared tunnel route dns <tunnel> midiaindoor.tthreedigital.com.br`.

## Editar planos

`src/lib/planos.ts` — muda preço, nome, recursos. Reflete na landing + cadastro.
