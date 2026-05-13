# Checklist de produção

Use isto pra **garantir que nada vital está faltando** antes de abrir
cadastro pra clientes pagantes.

## 1. Backups críticos

```bash
# Backup do .env (contem TODAS as senhas geradas pelo install)
sudo cp /opt/cardapio_saas/.env /root/cardapio-env-$(date +%Y%m%d).backup
sudo chmod 600 /root/cardapio-env-*.backup

# Backup das credenciais do tunnel cloudflared
sudo cp -r /root/.cloudflared /root/cloudflared-$(date +%Y%m%d).backup
```

Manda os 2 arquivos pra um cofre de senhas (Bitwarden, 1Password, etc).
Sem o `.env` não dá pra restaurar o sistema do zero.

## 2. Crons obrigatórios

```bash
# Edita
sudo crontab -e
```

Cola (ajusta CRON_SECRET pegando de `grep ^CRON_SECRET /opt/cardapio_saas/.env | cut -d= -f2`):

```cron
# Expira trials de 14 dias - todo dia 03h
0 3 * * * curl -sX POST -H "x-cron-secret: SEU_SECRET_AQUI" https://app.tthreedigital.com.br/api/cron/expire-trials >> /var/log/cardapio-cron.log 2>&1

# Limpa error_log com mais de 30 dias - todo dia 04h
0 4 * * * curl -sX POST -H "x-cron-secret: SEU_SECRET_AQUI" https://app.tthreedigital.com.br/api/cron/limpar-error-log >> /var/log/cardapio-cron.log 2>&1

# Limpa localizações motoboy antigas - todo dia 04h30
30 4 * * * curl -sX POST -H "x-cron-secret: SEU_SECRET_AQUI" https://app.tthreedigital.com.br/api/cron/limpar-localizacoes >> /var/log/cardapio-cron.log 2>&1

# Manutenção noturna VPS - todo dia 02h
0 2 * * * curl -sX POST -H "x-cron-secret: SEU_SECRET_AQUI" https://app.tthreedigital.com.br/api/cron/manutencao-noturna >> /var/log/cardapio-cron.log 2>&1
```

Confere:
```bash
sudo crontab -l
```

## 3. Mercado Pago — Gateway de pagamento

1. Cria conta em https://www.mercadopago.com.br/developers (se ainda não tem)
2. Em **Suas integrações** → criar aplicação tipo "Pagamentos"
3. **Production credentials** → copia `Access Token` (começa com `APP_USR-`)
   > Pra testar, use Test (`TEST-`) — sandbox vai automaticamente
4. Adiciona no servidor:
```bash
echo "MERCADOPAGO_ACCESS_TOKEN=APP_USR-COLE_AQUI" >> /opt/cardapio_saas/.env

# Recria o app pra pegar nova env
cd /opt/cardapio_saas
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d --force-recreate app
```
5. Configura webhook em https://www.mercadopago.com.br/developers/panel/notifications/webhooks
   - **URL:** `https://app.tthreedigital.com.br/api/webhooks/mercadopago-modulos`
   - **Eventos:** `payment` (Pagamentos)

Sem MERCADOPAGO_ACCESS_TOKEN, o sistema funciona em **modo manual** (compra fica `pendente` até alguém marcar manualmente). Pra cobrar de verdade, configurar.

## 4. Email transacional (boas-vindas, reset de senha)

Usa **Resend** (3000 emails grátis/mês — recomendado) ou SendGrid.

1. Cria conta em https://resend.com
2. Adiciona domínio (cria registros DNS de verificação)
3. Cria API key
4. Adiciona no .env:
```bash
echo "RESEND_API_KEY=re_xxxxxxxx" >> /opt/cardapio_saas/.env
echo "RESEND_FROM=Cardápio SaaS <noreply@tthreedigital.com.br>" >> /opt/cardapio_saas/.env
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d --force-recreate app
```

(integração ainda não está implementada — próximo dev)

## 5. Monitoramento externo (Uptime)

Conta grátis no **UptimeRobot** ou **BetterStack**:

1. https://uptimerobot.com — sign up
2. **Add new monitor**:
   - Type: HTTPS
   - URL: `https://app.tthreedigital.com.br/api/health`
   - Friendly name: Cardápio SaaS Production
   - Interval: 5 min
3. **Alert contacts:** seu email + WhatsApp via SMS gateway
4. Salva

Vai te avisar se o site cair (Cloudflare timeout, app crashed, etc).

## 6. Webhook GitHub (auto-deploy)

```bash
SECRET=$(openssl rand -hex 32)
echo "GITHUB_WEBHOOK_SECRET=$SECRET" >> /opt/cardapio_saas/.env
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d --force-recreate app
echo "Cole no GitHub: $SECRET"
```

Em https://github.com/yurigoes/cardapio_saas/settings/hooks:
- **URL:** `https://app.tthreedigital.com.br/api/admin/vps/deploy/webhook`
- **Content type:** `application/json`
- **Secret:** o do passo acima
- **Events:** "Just the push event"
- **Save**

A partir daí, todo `git push origin main` dispara deploy automático com backup + rollback.

## 7. Cloud backup (opcional)

Veja `scripts/setup-cloud-backup.md`. Recomendo Backblaze B2 (R$ 0,03/GB/mês).

## 8. Verificação final

```bash
# 1. Crons ativos?
sudo crontab -l | grep curl

# 2. .env tem variáveis críticas?
grep -E "^(JWT_SECRET|DB_PASSWORD|MASTER_EMAIL|EVOLUTION_API_KEY|CRON_SECRET|MERCADOPAGO_ACCESS_TOKEN|GITHUB_WEBHOOK_SECRET)" /opt/cardapio_saas/.env

# 3. Containers todos rodando?
docker ps --format 'table {{.Names}}\t{{.Status}}'

# 4. Health check?
curl -sf https://app.tthreedigital.com.br/api/health && echo " ✓ App OK"

# 5. Cloudflared?
sudo systemctl status cloudflared --no-pager | head -3

# 6. vps-agent?
sudo systemctl status cardapio-vps-agent --no-pager | head -3

# 7. Backups recentes?
ls -lh /opt/cardapio_saas/backups/*.sql.gz | tail -3
```

Se tudo verde → pode receber clientes pagantes.

## 9. Comunicação

- Atualizar nas páginas `/termos` e `/privacidade`:
  - CNPJ real da Three Digital
  - E-mail real do DPO (`dpo@...`)
  - Endereço da empresa
- Definir canal de suporte (WhatsApp Business?)
- Ter resposta SLA documentada (ex: até 48h em horário comercial)

## 10. Pós-go-live

- Acompanha `/admin/erros` diariamente nas primeiras semanas
- Diagnóstico noturno automático manda relatório no WhatsApp
- Backups vão pra cloud (se configurou rclone)
- Deploy via webhook = 1 git push = produção atualizada
