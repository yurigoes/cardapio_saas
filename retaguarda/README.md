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

- Linux (Ubuntu 22+ recomendado) **ou** Windows com WSL2
- 2 vCPU, 4 GB RAM, **20 GB SSD** (cache cresce até ~5 GB)
- IP fixo na LAN (sugestão: `192.168.0.50`)
- Portas 80 e 443 livres
- Docker + docker compose v2:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER && newgrp docker
  ```

---

## Instalação

```bash
# 1. Copia o pacote pra máquina
git clone https://github.com/yurigoes/cardapio_saas.git /opt/cardapio_saas
cd /opt/cardapio_saas/retaguarda

# 2. Roda setup (gera .env interativo + sobe containers)
bash setup.sh

# 3. Anota o HEARTBEAT_SECRET que o setup imprimir
#    Vai precisar adicionar no master (passo seguinte)
```

No fim do setup você verá algo como:
```
Adicione no master (.env da VPS principal):
  RETAGUARDA_HEARTBEAT_SECRET=abc123...
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

## DNS — como apontar restaurante.tthreedigital.com.br pro mini-PC

A retaguarda tem domínio público (ex: `loja-shopping.tthreedigital.com.br`)
mas resolve pro IP local **dentro do Wi-Fi do restaurante**. 3 estratégias:

### Estratégia 1 — DNS interno do roteador (recomendado)
Mikrotik, OpenWrt, pfSense, Unifi:
- Adicionar entrada DNS estática:
  `loja-shopping.tthreedigital.com.br → 192.168.0.50`
- Reiniciar DHCP dos terminais (ou esperar lease renovar)

### Estratégia 2 — /etc/hosts em cada terminal
Pro Android (totem):
- Roteador faz hairpin NAT ou
- Configura DNS manualmente nas configurações Wi-Fi → IP do mini-PC

### Estratégia 3 — Cloudflare com regra geo-condicional (complexo)
Não recomendado pra primeira instalação.

**Importante:** sem split-DNS funcionando, os terminais vão pro app principal.

---

## SSL / HTTPS

PWAs e Service Workers exigem HTTPS. Duas opções:

### Opção A — Let's Encrypt (recomendado se IP público existir)
```bash
docker run -it --rm \
  -v /opt/cardapio_saas/retaguarda/certs:/etc/letsencrypt \
  -p 80:80 \
  certbot/certbot certonly --standalone -d loja-shopping.tthreedigital.com.br
```
Depois descomenta o bloco HTTPS no `nginx/default.conf.template` e reinicia.

### Opção B — Certificado wildcard copiado do master
Copia `*.tthreedigital.com.br` cert do servidor principal pra
`retaguarda/certs/cert.pem` e `key.pem`. Renovação manual a cada 90d.

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
