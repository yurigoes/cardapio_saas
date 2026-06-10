# Xibo v4 POC — paralelo ao v3 em produção

Stack isolada pra testar **Xibo CMS v4.2** sem encostar no v3.3.3 que está
rodando. Permite validar nosso código (`lib/xibo.ts`) contra a API nova,
descobrir quebras e decidir se vale fazer cutover.

## Portas e nomes (sem conflito com v3)

| Recurso | v3 (produção) | v4 (POC) |
|---|---|---|
| CMS web | `127.0.0.1:8085` | `127.0.0.1:8086` |
| XMR | `127.0.0.1:9505` | `127.0.0.1:9506` |
| Container db | `midia_xibo_db` | `midia_xibo_db_v4` |
| Container cms | `midia_xibo_web` | `midia_xibo_web_v4` |
| Container xmr | `midia_xibo_xmr` | `midia_xibo_xmr_v4` |
| Rede | `midia_net` | `xibo_v4_net` |
| Volumes | `xibo_*` | `xibo4_*` |

## Passos na VPS

```bash
cd /opt/cardapio_saas/midia-indoor/xibo-v4-poc
cp .env.example .env
# Edita .env — define MYSQL_PASSWORD (use uma SO pro POC)
nano .env

docker compose up -d
docker compose logs -f cms-web   # acompanha boot — leva 2-3min na 1ª vez
# Ctrl+C quando ver "Memcached connection successful" e "Apache started"
```

Acessa `http://127.0.0.1:8086` (ou via SSH tunnel se VPS remota):

```bash
# No teu PC, faz tunnel:
ssh -L 8086:127.0.0.1:8086 root@<vps>
# Aí abre http://localhost:8086 no navegador
```

Login inicial:
- **Usuário**: `xibo_admin`
- **Senha**: aparece no log do CMS na 1ª inicialização (procura `Initial password:` em `docker compose logs cms-web`)

## Cria credenciais OAuth pro nosso teste

No painel CMS v4:
1. **Administration → Applications → Add Application**
2. Nome: `SaaS POC v4`
3. Marca **Client Credentials** (sim)
4. Escopos: marque todos (pro POC ler tudo)
5. Salva, copia **Client ID** e **Client Secret**

## Aponta o SaaS pro POC (sem mexer em produção)

Adiciona ao `.env` da landing (`/opt/cardapio_saas/midia-indoor/landing/.env`):

```
XIBO_V4_URL=http://midia_xibo_web_v4
XIBO_V4_CLIENT_ID=<copiou_do_passo_anterior>
XIBO_V4_CLIENT_SECRET=<copiou_do_passo_anterior>
```

Conecta a landing à rede do POC (pra resolver `midia_xibo_web_v4`):

```bash
docker network connect xibo_v4_net midia_landing
```

Restart da landing pra pegar o env novo:
```bash
cd /opt/cardapio_saas/midia-indoor/landing
docker compose restart
```

## Roda a suite de smoke test

```bash
SECRET=$(grep CRON_SECRET /opt/cardapio_saas/midia-indoor/landing/.env | cut -d= -f2)
curl -sS "http://127.0.0.1:3100/api/admin/xibo-v4-test?key=$SECRET" | jq .
```

Output esperado:
```json
{
  "ok": true,
  "url_testada": "http://midia_xibo_web_v4",
  "duracao_ms": 850,
  "resumo": { "total": 14, "passou": 13, "falhou": 1 },
  "shape_layout": ["layoutId", "name", "campaignId", ...],
  "shape_display": ["displayId", "display", "loggedIn", ...],
  "testes": [
    { "nome": "/api/layout?length=3", "ok": true, "status": 200, "sample": [...] },
    { "nome": "/api/syncgroup?length=3", "ok": true, "status": 200, ... },
    ...
  ]
}
```

**O que olhar**:
- `falhou: 0` → todos endpoints respondem. Próximo: testar fluxo de criação.
- `falhou > 0` → veja o array `testes` pra ver qual quebrou + mensagem
- Compara `shape_layout` / `shape_display` com o que `lib/xibo.ts` espera

## Restaurar dump do v3 no v4 (opcional, testa migração real)

⚠ FAZ ANTES de criar dados manualmente no POC, senão sobrescreve.

```bash
# 1) Dump do v3 (produção)
docker exec midia_xibo_db sh -c \
  'mysqldump -u cms -p$MYSQL_PASSWORD --single-transaction --routines --triggers cms' \
  > /tmp/dump-xibo-v3.sql
ls -lh /tmp/dump-xibo-v3.sql   # confere tamanho

# 2) Copia pro container v4 e importa
docker cp /tmp/dump-xibo-v3.sql midia_xibo_db_v4:/tmp/dump.sql
docker exec midia_xibo_db_v4 sh -c \
  'mysql -u cms -p$MYSQL_PASSWORD cms < /tmp/dump.sql'

# 3) Reinicia o CMS v4 pra rodar as migrations
docker compose -f /opt/cardapio_saas/midia-indoor/xibo-v4-poc/docker-compose.yml restart cms-web

# 4) Acompanha o log — vai mostrar "Running database migrations" e demora 1-5min
docker compose -f /opt/cardapio_saas/midia-indoor/xibo-v4-poc/docker-compose.yml logs -f cms-web
```

Quando terminar (sem erros), acessa `http://localhost:8086`. Confere se:
- Displays aparecem
- Layouts aparecem
- Campaigns aparecem
- Library tem as mídias

Roda a suite de novo: `curl ".../xibo-v4-test?key=$SECRET"` — agora com dados reais.

## Cleanup (apaga o POC todo)

```bash
cd /opt/cardapio_saas/midia-indoor/xibo-v4-poc
docker compose down -v
docker network disconnect xibo_v4_net midia_landing 2>/dev/null
# Tira as variaveis XIBO_V4_* do .env da landing
```

## Sinais pra decidir o cutover

Quando o smoke test passar **e** o fluxo manual de "criar layout → lançar campanha → display tocar" funcionar no POC:

1. Documenta as funções de `lib/xibo.ts` que precisaram ajuste
2. Adapta o código (pode usar feature flag `XIBO_V4=true` no env)
3. Agenda janela de manutenção (~1h)
4. **Backup** completo do v3 (DB + library)
5. Cutover: atualiza imagem do `docker-compose.yml` de produção pra `release-4.2`
6. CMS roda migrations automaticamente no boot
7. Re-testa fluxos críticos
