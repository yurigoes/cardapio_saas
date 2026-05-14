# Backup Automático → Cloudflare R2

Estratégia de DR (Disaster Recovery): backup diário do Postgres
(pg_dumpall comprimido) enviado pra um bucket Cloudflare R2 fora da VPS.

R2 = S3-compatível, **10 GB grátis**, **zero egress fees**.

---

## 1. Criar bucket no R2

1. Acesse https://dash.cloudflare.com → R2 Object Storage
2. **Create bucket** → nome: `cardapio-backups` (ou outro)
3. Em **Manage R2 API Tokens** → **Create API token**:
   - Permissões: **Object Read & Write**
   - Scope: o bucket criado
   - Salve `Access Key ID` e `Secret Access Key`
   - Anote o **Account ID** (URL do dashboard mostra)
4. **Endpoint S3**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

---

## 2. Instalar rclone na VPS

```bash
sudo apt update && sudo apt install -y rclone jq
rclone version  # confirma que instalou
```

## 3. Configurar remote `r2`

```bash
rclone config
```

Roteiro interativo:

```
n) New remote
name> r2
Storage> 5     (Amazon S3 Compliant Storage Providers)
provider> Cloudflare
env_auth> 1    (no — entra credenciais)
access_key_id> <ACCESS_KEY_ID do passo 1>
secret_access_key> <SECRET_ACCESS_KEY>
region>        (deixa vazio)
endpoint> https://<ACCOUNT_ID>.r2.cloudflarestorage.com
location_constraint>  (vazio)
acl>           (vazio)
Edit advanced config? n
Keep this "r2" remote? y
Quit config? q
```

Testa:
```bash
rclone lsd r2:cardapio-backups   # deve listar (vazio inicialmente, sem erro)
```

---

## 4. Configurar `.env`

Adicione no `/opt/cardapio_saas/.env`:

```bash
BACKUP_R2_REMOTE=r2
BACKUP_R2_BUCKET=cardapio-backups
BACKUP_R2_PATH=cardapio-saas/db
BACKUP_RETENTION_DAYS=30
```

---

## 5. Testar

```bash
cd /opt/cardapio_saas
sudo bash scripts/backup-to-r2.sh --check
# Deve imprimir: {"ok":true,"mensagem":"config OK", ...}

sudo bash scripts/backup-to-r2.sh
# Deve imprimir: {"ok":true,"arquivo":"r2:.../...sql.gz","tamanho_mb":...}
```

Confere no dashboard R2 que o arquivo apareceu em `cardapio-saas/db/YYYY/MM/`.

---

## 6. Instalar cron diário

```bash
sudo bash scripts/install-backup-cron.sh
```

Isso cria `/etc/cron.d/cardapio-backup-r2` que roda **03:00 UTC todo dia**.
Logs em `/var/log/cardapio-backup-r2.log`.

Pra desinstalar: `sudo bash scripts/install-backup-cron.sh --uninstall`

---

## 7. Verificar que está funcionando

- **/admin/vps** → painel "Backup pra Cloudflare R2 (DR)" mostra config OK
- Botão **"Rodar backup agora"** dispara via vps-agent (visível na UI)
- Próximo backup automático: amanhã 03:00 UTC
- Logs: `tail -f /var/log/cardapio-backup-r2.log`

---

## Restore (em caso de desastre)

```bash
# Lista backups disponíveis
rclone ls r2:cardapio-backups/cardapio-saas/db/

# Baixa o último
rclone copy r2:cardapio-backups/cardapio-saas/db/2026/05/cardapio-backup-20260514-030000.sql.gz /tmp/

# Restaura no Postgres novo
gunzip -c /tmp/cardapio-backup-*.sql.gz | docker exec -i cardapio_postgres psql -U cardapio
```

---

## Custos

- **10 GB grátis** Class A operations + storage
- Acima disso: $0.015/GB/mês storage, $0 egress (Cloudflare = zero egress)
- Backup típico: 50-500 MB/dia (depende do volume) → 30 dias = 1.5-15 GB
- **Conclusão**: provavelmente fica dentro do tier grátis indefinidamente

---

## Troubleshooting

| Sintoma | Causa | Fix |
|---|---|---|
| `remote 'r2:' não configurado` | rclone config não rodou | `rclone config` (passo 3) |
| `sem acesso ao bucket` | API token sem permissão ou bucket errado | Recheck API token + nome do bucket |
| `pg_dumpall falhou` | container postgres com nome diferente | ajuste `POSTGRES_CONTAINER` no .env |
| backup vazio (`< 10000B`) | dump rolou mas sem dados — banco quebrado | investiga o postgres antes de blamear o script |
| Cron não roda | service cron parado | `systemctl enable --now cron` |
