# Three Digital — Mídia Indoor (Xibo CMS)

Servidor de mídia indoor (digital signage) self-hosted, rodando na MESMA
VPS do Three Digital sem interferir no sistema de restaurante.

- Rede Docker própria (`midia_net`) — isolada dos containers do restaurante
- Limites de memória: ~2.3 GB total (db 1G + web 1.3G + xmr 256M),
  deixando ~5.5 GB pro Three Digital
- Bind local 127.0.0.1:8080 → Cloudflare Tunnel expõe `midia.tthreedigital.com.br`

## Pré-requisitos

- VPS com 8 GB RAM (✓ já tem)
- Docker + docker compose (✓ já tem, do Three Digital)
- ~10 GB de disco livre pra biblioteca de mídia (cresce com vídeos)

## Instalação

```bash
# 1. Copia os arquivos pra VPS
mkdir -p /opt/midia-indoor
# (suba a pasta xibo/ pra /opt/midia-indoor/xibo via git ou scp)
cd /opt/midia-indoor/xibo

# 2. Config
cp .env.example .env
nano .env
#   - MYSQL_PASSWORD: openssl rand -hex 16
#   - CMS_SERVER_NAME: midia.tthreedigital.com.br

# 3. Sobe (primeira vez demora ~2min pra inicializar o banco)
docker compose up -d

# 4. Acompanha a inicialização
docker compose logs -f cms-web
#   Espera aparecer "Xibo upgraded to ..." e o Apache subir

# 5. Confere memória — não pode estourar o sistema
docker stats --no-stream
free -h
```

## Cloudflare Tunnel — rotear midia.tthreedigital.com.br

Você já tem um tunnel rodando pro Three Digital. Adicione mais um hostname
nele apontando pro Xibo. Duas formas:

### Via dashboard (mais fácil)
1. https://one.dash.cloudflare.com → Networks → Tunnels
2. Abra o tunnel existente → Public Hostnames → **Add a public hostname**
3. Subdomain: `midia` · Domain: `tthreedigital.com.br`
4. Service: `HTTP` → `localhost:8080`
5. Save

### Via API (se preferir automatizar)
```bash
# Pega o tunnel ID atual e adiciona ingress (precisa CF_API_TOKEN + ACCOUNT_ID)
# Veja /opt/cardapio_saas/retaguarda/install.sh pra o padrão de chamada da API CF.
```

Aguarde ~1min de propagação DNS, depois acesse `https://midia.tthreedigital.com.br`.

## Primeiro acesso

- Login padrão Xibo: usuário **xibo_admin**
- Senha inicial: gerada na 1ª subida — veja no log:
  ```bash
  docker compose logs cms-web | grep -i "password"
  ```
- **TROQUE a senha imediatamente** em Administration → Users

## Sua marca (white-label)

1. **Logo + cores + nome do painel:** Administration → Settings → aba "Theme",
   ou jogue arquivos de tema custom em `xibo_web` (volume mapeado pra
   `/var/www/cms/web/theme/custom`)
2. **Conteúdo nas TVs = 100% seu** — você desenha os layouts, nenhuma marca
   do Xibo aparece na tela do cliente
3. Detalhes: https://xibo.org.uk/docs/setup/theming-the-cms

## API REST

- Habilitar: Administration → Applications → **Add Application** (OAuth2)
- Escolha `Client Credentials` pra integração server-to-server
- Guarde client_id + client_secret
- Endpoints: `https://midia.tthreedigital.com.br/api/...`
- Docs: https://xibo.org.uk/manual/en/api.html

Exemplo — listar displays:
```bash
# 1. Pega token
TOKEN=$(curl -s -X POST https://midia.tthreedigital.com.br/api/authorize/access_token \
  -d "client_id=XXX&client_secret=YYY&grant_type=client_credentials" | jq -r .access_token)

# 2. Lista displays
curl -s https://midia.tthreedigital.com.br/api/display \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## Players (as TVs nas lojas)

- **Android** (recomendado, igual seus totens): app "Xibo for Android" na Play Store
  - Aponta pra `https://midia.tthreedigital.com.br`
  - Insere o código exibido → você autoriza no CMS (Displays → autorizar)
- Windows, Linux, webOS (LG), Tizen (Samsung) também suportados
- Versão grátis do player Android tem marca d'água pequena; licença comercial
  remove (paga uma vez por display). Pra produção, vale comprar a licença do
  player (~£/display único).

## Backup

```bash
# Banco
docker exec midia_xibo_db mysqldump -u cms -p"$MYSQL_PASSWORD" cms | gzip > xibo-db-$(date +%F).sql.gz

# Biblioteca de mídia
docker run --rm -v xibo_library:/lib -v $(pwd):/bkp alpine tar czf /bkp/xibo-library-$(date +%F).tar.gz -C /lib .
```

## Manutenção / monitoramento

```bash
docker compose ps                    # status
docker compose logs -f cms-web       # logs ao vivo
docker stats --no-stream             # uso de RAM/CPU
docker compose restart cms-web       # reinicia só o CMS
docker compose down                  # para tudo (não apaga dados)
```

## Atenção à RAM

VPS tem 8 GB. Three Digital usa ~2-3 GB, Xibo cap em ~2.3 GB. Folga de ~2.5 GB.
Monitore `free -h` na 1ª semana. Se swap subir muito, reduza `mem_limit` do
cms-web ou mova mídia pesada pra storage externo.
