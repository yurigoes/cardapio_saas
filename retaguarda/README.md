# Retaguarda — Cardápio SaaS

Reverse-proxy + cache local pra reduzir carga no servidor principal. Cada
restaurante grande roda 1 instância num mini-PC na própria loja. Totens,
PDVs e painéis chamam essa retaguarda no IP local; ela cacheia o que
pode (cardápio, imagens) e proxia o resto pro master.

```
[ totens / PDVs / painéis ]
        ↓ LAN (1ms)
   RETAGUARDA (este pacote)
   nginx-cache + redis
        ↓ HTTPS internet
   VPS PRINCIPAL (app.tthreedigital.com.br)
```

**O master continua sendo a fonte de verdade.** A retaguarda só acelera
leitura e diminui banda. Nenhum dado é gravado local — se internet cair,
mutations falham (próxima etapa terá buffer offline).

---

## Pré-requisitos no mini-PC

- Linux limpo (Ubuntu 22+, Debian 12+, Raspberry Pi OS) — **o instalador faz o resto**
- 2 vCPU, 4 GB RAM, **20 GB SSD** (cache cresce até ~5 GB)
- Conexão de internet (sem IP fixo, sem port-forward — usa Cloudflare Tunnel)

---

## Instalação em 1 comando

Na máquina nova, como root:

```bash
curl -fsSL https://raw.githubusercontent.com/yurigoes/cardapio_saas/main/retaguarda/install.sh | sudo bash
```

Ele faz tudo:
1. **Instala** Docker + dependências
2. **Clona** o repo em `/opt/cardapio_saas`
3. **Pergunta** dados (empresa, master, CF token)
4. **Cria** Cloudflare Tunnel próprio dessa loja via API
5. **Configura** DNS CNAME `loja-X.tthreedigital.com.br` → tunnel
6. **Sobe** containers (nginx-cache + redis + reporter + cloudflared)
7. **Testa** acesso público via HTTPS

Tempo total: ~3 minutos.

### Pré-requisitos no Cloudflare (1 vez só, antes da 1ª loja)

Em https://dash.cloudflare.com/profile/api-tokens cria um **API Token** com:
- **Account** → Cloudflare Tunnel → **Edit**
- **Zone** → DNS → **Edit** (zona `tthreedigital.com.br`)

Anota também:
- **Account ID** (sidebar do dashboard CF)
- **Zone ID** da zona principal

O mesmo token serve pra **N lojas** — cada loja vira um tunnel separado.

### Pré-requisitos no master (1 vez só)

```bash
# Na VPS principal:
cd /opt/cardapio_saas && git pull
echo "RETAGUARDA_HEARTBEAT_SECRET=$(openssl rand -hex 24)" >> .env

# Migration
docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas \
  < database/migrations/081_retaguardas.sql

# Rebuild
docker build -t cardapio-saas:latest .
docker rm -f cardapio_app
docker run -d --name cardapio_app --network cardapio_net --network-alias app \
  -p 127.0.0.1:3000:3000 --restart unless-stopped \
  --env-file /opt/cardapio_saas/.env cardapio-saas:latest

# Anota o HEARTBEAT_SECRET — você usa em TODAS as instalações de retaguarda
grep ^RETAGUARDA_HEARTBEAT_SECRET .env
```

## Configuração no master (VPS principal)

**Só uma vez** — o mesmo secret serve pra TODAS as retaguardas:

```bash
# Na VPS principal:
ssh root@vps
cd /opt/cardapio_saas

# Adiciona ao .env (se ainda não tiver)
echo "RETAGUARDA_HEARTBEAT_SECRET=abc123..." >> .env

# Roda a migration 081
docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas \
  < database/migrations/081_retaguardas.sql

# Restart pra ler nova env
docker restart cardapio_app
```

Agora a retaguarda do restaurante já consegue mandar heartbeat. Confere
em `https://app.tthreedigital.com.br/admin/retaguardas` (master).

---

## Cloudflare Tunnel — como funciona com várias lojas

**1 Cloudflare account = N tunnels = N lojas.** Cada execução do `install.sh`
cria um tunnel novo na sua conta, associa ao domínio único da loja e o
container `cloudflared` conecta-se com aquele token específico.

```
loja1.tthreedigital.com.br ─┐
loja2.tthreedigital.com.br ─┼─→ Cloudflare edge ─→ tunnel-N ─→ mini-PC da lojaN ─→ nginx → app principal
loja3.tthreedigital.com.br ─┘
```

**Vantagens:**
- ✅ SEM IP público no restaurante
- ✅ SEM port-forwarding no roteador
- ✅ SEM cert SSL local (Cloudflare termina HTTPS)
- ✅ Resiliente — Cloudflare tem 300+ POPs, baixíssima latência
- ✅ Mesma conta CF gerencia todas as lojas

**Limites do plano gratuito do Cloudflare:**
- Tunnels: **ilimitado**
- Throughput: ilimitado
- HTTP requests via Tunnel: **50/dia/grátis** com Zero Trust gratuito (suficiente)

## Latência LAN < 1ms — opcional (DNS split-horizon)

Por padrão tudo passa por Cloudflare (50-80ms). Pra totens dentro da loja
ganharem latência LAN (~1ms), aponta o subdomínio pro IP local **dentro
do Wi-Fi da loja**, mantendo o tunnel pra acesso de fora:

### Roteador (Mikrotik/OpenWrt/Unifi/pfSense)
DNS estático:
```
loja-shopping.tthreedigital.com.br → 192.168.0.50
```
Totens dentro da loja resolvem pra LAN, fora da loja resolvem pelo CF Tunnel.

### Roteador residencial simples (sem split-DNS)
Não tem split-DNS? Tudo bem — segue via tunnel, latência 50-80ms,
ainda assim a maior parte do conteúdo vem do cache local da retaguarda.

---

## Cache — o que é cacheado

| Rota                                   | TTL    | Onde |
|----------------------------------------|--------|------|
| `/api/pub/media/*` (imagens MinIO)     | 7 dias | disk |
| `/api/pub/cardapio/{slug}`             | 5 min  | disk |
| `/_next/static/*` (JS/CSS Next)        | 30 dias| disk |
| `*.png/.jpg/.webp/.svg`                | 7 dias | disk |
| `/api/pub/cardapio/{slug}/*` (sub)     | —      | pass-through |
| POST/PATCH/DELETE                      | —      | pass-through |
| HTML painel/totem                      | —      | pass-through |

**Imagens novas** aparecem em até 7 dias na retaguarda. Pra forçar refresh:
```bash
docker exec retaguarda_nginx nginx -s reload
# ou nuclear:
docker compose restart nginx-cache
```

Próxima versão: invalidação automática via webhook do master.

---

## Verificação

```bash
# Cache hit/miss em tempo real:
docker logs -f retaguarda_nginx

# Estado das requests (header X-Retaguarda-Cache):
curl -I http://localhost/api/pub/cardapio/top-cozinha-oriental
# X-Retaguarda-Cache: HIT  ← excelente
# X-Retaguarda-Cache: MISS ← buscou no master e cacheou

# Espaço usado pelos caches:
du -sh /var/lib/docker/volumes/retaguarda_*

# Heartbeat funcionando?
docker logs retaguarda_reporter
```

---

## Manutenção

```bash
# Atualizar (puxa nova imagem nginx, reinicia)
git -C /opt/cardapio_saas pull
docker compose pull
docker compose up -d

# Limpar caches (vai re-popular conforme uso)
docker compose down
docker volume rm retaguarda_cache_html retaguarda_cache_media retaguarda_cache_static
docker compose up -d

# Logs
docker compose logs -f --tail 100

# Parar tudo
docker compose down
```

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| Cardápio aparece desatualizado | Cache TTL 5min | Espera ou `nginx -s reload` |
| Imagem não atualiza | Cache TTL 7d (URL antiga) | Re-upload no master gera URL nova (hash) |
| Não aparece em /admin/retaguardas | Secret diferente ou firewall | Confere log: `docker logs retaguarda_reporter` |
| 502 Bad Gateway em todas rotas | Master fora do ar OU DNS errado | `curl https://app.tthreedigital.com.br` do mini-PC |
| Tunnel não conecta | Token inválido OU rede bloqueia outbound 443/7844 | `docker logs retaguarda_cloudflared` |
| Domínio não responde | Propagação DNS (5-10min após install) | `dig loja-X.tthreedigital.com.br` confere CNAME |
| POST de pedido falha | Internet caiu | Próxima etapa: buffer offline |
| HTTPS dá erro de cert | Cert expirado/wildcard errado | Renovar com certbot |

---

## Próximas etapas (roadmap)

- [ ] Buffer offline de POSTs com Redis (pedidos não perdidos se internet cair)
- [ ] Invalidação automática de cache via webhook do master
- [ ] Mirror do MinIO local (imagens 100% offline)
- [ ] Métricas de cache hit reportadas no heartbeat
- [ ] Auto-update via Watchtower
- [ ] Modo "slave full" com Postgres local pra restaurantes 100% offline-first
