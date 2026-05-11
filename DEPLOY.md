# Cardápio SaaS — Guia de Deploy

## Requisitos da VPS

| Item | Mínimo | Recomendado |
|------|--------|-------------|
| RAM | 2GB | 4GB |
| Disco | 20GB | 50GB |
| CPU | 2 vCPUs | 4 vCPUs |
| OS | Ubuntu 22.04 | Ubuntu 22.04 |
| Docker | 24+ | 24+ |

---

## 1. Configuração de DNS (antes de instalar)

Configure os seguintes registros no seu provedor de DNS.
Substitua `SEU_IP` pelo IP da VPS.

| Tipo | Nome | Destino |
|------|------|---------|
| A | `@` ou `cardapio.suaempresa.com.br` | `SEU_IP` |
| A | `*` ou `*.cardapio.suaempresa.com.br` | `SEU_IP` |
| A | `s3` | `SEU_IP` |
| A | `minio` | `SEU_IP` |
| A | `evolution` | `SEU_IP` |
| A | `n8n` | `SEU_IP` |

> O wildcard `*` permite que subdomínios de empresas funcionem automaticamente.
> Se seu provedor não suporta wildcard, crie registros individuais conforme necessário.

---

## 2. Instalação na VPS

```bash
# 1. Copie o projeto para a VPS
scp -r cardapio_saas/ root@SEU_IP:/opt/cardapio

# 2. Execute o instalador
bash /opt/cardapio/install.sh
```

O instalador irá perguntar:
- **Domínio principal** (ex: `cardapio.suaempresa.com.br`)
- **E-mail para SSL** (Let's Encrypt)
- **Senha do banco de dados** (ou gera automaticamente)
- **E-mail do admin master**
- **Senha do admin master**

Ao final, todos os serviços sobem automaticamente com SSL.

---

## 3. URLs dos serviços

| Serviço | URL | Acesso |
|---------|-----|--------|
| App principal | `https://DOMINIO` | Público |
| Admin master | `https://DOMINIO/admin` | Master only |
| MinIO S3 | `https://s3.DOMINIO` | Público (leitura) |
| MinIO Console | `https://minio.DOMINIO` | IP restrito |
| Evolution API | `https://evolution.DOMINIO` | API key |
| N8N | `https://n8n.DOMINIO` | Login/senha |

---

## 4. Atualizar o sistema

```bash
cd /opt/cardapio
bash update.sh
```

---

## 5. Slave Windows

### Baixar o instalador
Após o deploy, o instalador `.exe` ficará disponível em:
```
https://DOMINIO/downloads/slave-setup.exe
```

### Gerar o .exe localmente (desenvolvimento)
```powershell
cd slave\
.\build-windows.ps1
# Gera: slave\dist\cardapio-slave.exe
```

### Como usar no restaurante
1. Copie `cardapio-slave.exe` para o computador
2. Execute como administrador (duplo clique)
3. O navegador abre em `http://localhost:7878`
4. Escolha o modo:
   - **Nuvem Direta**: abre o sistema cloud no browser (sem impressão local)
   - **Slave Local**: sincroniza pedidos + impressão térmica automática

### Modo Slave — obter a Slave Key
1. Faça login no painel master: `https://DOMINIO/admin`
2. Vá em **Empresas → [empresa] → Integrações**
3. Clique em **Gerar Slave Key**
4. Cole a chave no instalador do Windows

---

## 6. Domínios personalizados por empresa

O fluxo para empresa usar domínio próprio:

1. **Empresa solicita**: preenche `dominio_proprio` no painel da empresa
2. **Status inicial**: `pendente`
3. **Empresa configura DNS**: aponta domínio para `SEU_IP`
4. **Master aprova**: no painel admin → Empresas → Domínios pendentes
5. **Sistema age automaticamente**:
   - Atualiza `dominio_status = 'aprovado'`
   - Regenera `/infra/traefik/dynamic/custom-domains.yml`
   - Traefik detecta o arquivo e gera SSL via Let's Encrypt
6. **Domínio ativo em ~1 minuto**

---

## 7. WhatsApp por empresa

1. Faça login como admin/gerente da empresa
2. Vá em **Configurações → WhatsApp**
3. Clique em **Conectar WhatsApp**
4. Escaneie o QR code com o celular
5. A Evolution API mantém a sessão ativa

---

## 8. N8N — Automações

Acesse `https://n8n.DOMINIO` com as credenciais geradas no install.

Workflows recomendados (importar os templates):
- **Aniversariante do dia**: busca clientes e envia mensagem às 9h
- **Consulta de pontos**: responde automaticamente quando cliente pergunta pontos
- **Cupom automático**: envia cupom no aniversário ou X pedidos

Os workflows podem usar as variáveis de ambiente:
```
CARDAPIO_API_URL  →  http://app:3000
CARDAPIO_API_KEY  →  (chave gerada no install)
EVOLUTION_API_URL →  http://evolution:8080
EVOLUTION_API_KEY →  (chave gerada no install)
```

---

## 9. Backup

```bash
# Backup do banco de dados
docker exec cardapio_postgres pg_dump -U cardapio cardapio_saas \
  | gzip > /opt/cardapio/backups/backup-$(date +%Y%m%d).sql.gz

# Backup das imagens (MinIO)
docker exec cardapio_minio mc mirror local/cardapio /backup/minio/
```

---

## 10. Comandos úteis

```bash
# Ver todos os containers
docker ps

# Logs da aplicação
docker logs cardapio_app -f

# Logs do Traefik (SSL)
docker logs traefik -f

# Reiniciar um serviço
docker compose -f /opt/cardapio/docker-compose.prod.yml restart evolution

# Acessar o banco de dados
docker exec -it cardapio_postgres psql -U cardapio -d cardapio_saas

# Verificar saúde geral
curl https://DOMINIO/api/health
```
