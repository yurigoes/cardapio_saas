# Cloud backup opcional (Google Drive, Dropbox, S3, B2)

Por padrão, `scripts/deploy.sh` salva backups em `/opt/cardapio_saas/backups/`
(disco local). Se quiser que cada backup também suba pra nuvem, instale
e configure **rclone** — funciona com 50+ provedores (Google Drive,
Dropbox, OneDrive, S3, Backblaze B2, etc).

## Instalar rclone

```bash
sudo apt install -y rclone
# ou versão mais nova:
curl https://rclone.org/install.sh | sudo bash
```

## Configurar (interativo)

```bash
sudo rclone config
```

Segue o wizard. Exemplo pra Google Drive:
1. `n` (new remote)
2. nome: `gdrive` (ou o que quiser)
3. tipo: `drive`
4. client_id / secret: deixa vazio (usa default rclone — ok pra uso pessoal)
5. scope: `1` (full access)
6. autoriza no navegador
7. confirm

Pra **Backblaze B2** (mais barato pra backup):
1. `n`
2. nome: `b2`
3. tipo: `b2`
4. account ID + application key (criados em b2.backblazeb2.com)

Pra **AWS S3**:
1. tipo: `s3`
2. provider: `AWS`
3. access_key + secret + region

## Testa

```bash
rclone lsd gdrive:    # lista pastas raiz
rclone copy /etc/hosts gdrive:teste/   # upload de teste
rclone ls gdrive:teste/
```

## Como o deploy usa

O `scripts/deploy.sh` automaticamente detecta o rclone:
- Se não tem rclone instalado → ignora
- Se tem rclone mas sem config → ignora
- Se tem rclone + 1+ remote configurado → faz `rclone copy <backup> <primeiro_remote>:cardapio-backups/` após cada backup local

Sem código pra ajustar — basta configurar rclone e os backups começam a subir.

## Limpeza automática na cloud

Pra que a cloud não acumule infinito, adiciona um cron:

```bash
sudo crontab -e
```

```
# Limpa backups na cloud com mais de 60 dias
0 4 * * * rclone delete gdrive:cardapio-backups/ --min-age 60d --quiet
```

## Restaurar de backup cloud

```bash
# Lista
rclone lsl gdrive:cardapio-backups/

# Baixa
rclone copy gdrive:cardapio-backups/db-20260513-120000.sql.gz /tmp/

# Restaura
gunzip -c /tmp/db-*.sql.gz | docker exec -i cardapio_postgres psql -U cardapio
```

## Quanto vai custar

| Provedor | Preço aproximado | Quando faz sentido |
|---|---|---|
| Google Drive | 15 GB grátis, depois R$ 9,90/100 GB | Pequeno volume |
| Dropbox | 2 GB grátis, depois R$ 60/2 TB | Médio |
| Backblaze B2 | $0.005/GB/mês (≈ R$ 0,03) | Recomendado pra backup |
| AWS S3 Glacier | $0.004/GB/mês | Backup arquivamento |
| OneDrive | 5 GB grátis | Já tem M365 |

Pra um SaaS de restaurante começando, **Backblaze B2** é o melhor custo-benefício
(R$ 0,03 por GB/mês, primeiros 10 GB grátis). 100 GB de backup ≈ R$ 3/mês.
