# Three Digital — Print Agent

Agente que roda na máquina do restaurante e imprime os pedidos nas
impressoras térmicas. Substitui os popups de impressão no navegador.

## Suporta 2 tipos de conexão

| Tipo | Quando usar |
|---|---|
| **TCP** (IP) | Impressora térmica de rede (ex: `192.168.0.100:9100`) |
| **Windows** (nome) | Impressora local USB ou compartilhada por outro PC Windows |

## Requisitos

- **Node.js 18+** — baixe o LTS em https://nodejs.org/
- Uma `agent_key` (`pak_...`) gerada no painel SaaS em
  **Painel → Impressoras → Gerar key**

---

## Instalação no Windows (recomendado)

### Passo 1 — Configurar
Duplo clique em **`setup.bat`**. Ele vai:

- Detectar suas impressoras Windows automaticamente
- Perguntar a URL do servidor e a `agent_key`
- Pra cada setor (cozinha, bar, pdv...) você escolhe:
  - Se ativa esse setor
  - Se a impressora é de rede (digita IP) ou Windows (escolhe da lista detectada)

### Passo 2 — Instalar como serviço
Clique com botão direito em **`install-service.bat`** → **"Executar como administrador"**.

Cria uma Tarefa Agendada que:
- Sobe sozinho a cada login do Windows
- Roda em segundo plano (sem janela aberta)
- Reinicia automaticamente se travar
- Logs em `agent.log` na própria pasta

Pronto — pode fechar tudo, o agente continua imprimindo.

### Comandos úteis (Windows)

```cmd
schtasks /Query /TN "CardapioPrintAgent"     :: status
schtasks /End   /TN "CardapioPrintAgent"     :: parar
schtasks /Run   /TN "CardapioPrintAgent"     :: iniciar de novo
type agent.log                                :: ver logs
uninstall-service.bat                         :: desinstalar (config preservada)
```

### Pra testar antes de instalar como serviço
Duplo clique em **`start.bat`** — abre o terminal mostrando os jobs sendo processados.
`Ctrl+C` pra parar.

---

## Instalação no Linux

### Passo 1 — Setup
```bash
cd print-agent
node setup-wizard.js
```
(no Linux só TCP é suportado — IP da impressora)

### Passo 2 — Como serviço (systemd)
```ini
# /etc/systemd/system/cardapio-print-agent.service
[Unit]
Description=Three Digital Print Agent
After=network.target

[Service]
WorkingDirectory=/opt/cardapio-print-agent
ExecStart=/usr/bin/node index.js
Restart=always
User=cardapio

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now cardapio-print-agent
journalctl -u cardapio-print-agent -f
```

---

## Setores suportados

- `autoatendimento` — totem de autoatendimento
- `pdv` — caixa / PDV
- `cozinha`
- `bar`
- `balcao` — retirada / balcão

Cada setor é ativado/desativado individualmente neste agente. Em um
restaurante com 2 PCs, instale o agente em ambos com keys diferentes
e ative só os setores que aquele PC vai imprimir.

---

## Troubleshooting

| Sintoma | Provável causa | Solução |
|---|---|---|
| `nao foi possivel autenticar` | key errada ou agente desativado | Vê em /painel/impressoras se a key ainda está ativa |
| `TCP timeout` | impressora desligada / IP errado | `ping <IP>` no servidor — depois `nc -vz <IP> 9100` |
| Imprime caracteres bizarros | encoding errado | A maioria das térmicas funciona em UTF-8. Se a sua exige CP850, edita `montarPayloadTexto()` em `index.js` pra converter |
| `print exit 1` (Windows) | nome da impressora errado | Roda `setup.bat` de novo — ele vai listar as impressoras detectadas |
| Janela do `install-service.bat` fecha sem fazer nada | falta admin | Clique direito → "Executar como administrador" |
| Job fica `pendente` no painel mas agente não pega | `Setores ativos` está vazio neste agente | Roda `setup.bat` e ative o setor certo |

## Arquivos da pasta

```
print-agent/
├── setup.bat               ← duplo clique: configura
├── start.bat               ← duplo clique: roda em primeiro plano (testar)
├── install-service.bat     ← admin: instala como tarefa agendada
├── uninstall-service.bat   ← remove a tarefa agendada
├── setup-wizard.js         ← wizard interativo (chamado pelo setup.bat)
├── index.js                ← processo principal
├── lib/
│   └── windows-printer.js  ← lista + envia pra impressora Windows
├── config.json             ← gerado pelo setup (NÃO comite)
└── agent.log               ← logs quando roda como serviço
```
