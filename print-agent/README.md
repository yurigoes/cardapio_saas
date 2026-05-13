# Cardápio SaaS — Print Agent

Agente local que roda na rede do restaurante e imprime os pedidos nas
impressoras térmicas via TCP (ESC/POS porta 9100).

Substitui os popups de impressão que abrem no navegador.

## Requisitos

- Node.js ≥ 18 (sem dependências externas)
- Impressoras térmicas com IP fixo na rede local
- Uma `agent_key` (`pak_...`) gerada no painel SaaS em
  **Painel → Impressoras → Novo agente**

## Setup

```bash
cd print-agent
node setup-wizard.js   # responde URL, agent_key e IP por setor
node index.js          # roda em loop
```

A configuração fica em `./config.json` (não comite — está no .gitignore).

## Setores suportados

- `autoatendimento` — totem de autoatendimento
- `pdv` / `caixa`
- `cozinha`
- `bar`
- `balcao` / `retirada`

Cada um pode ser ativado/desativado individualmente neste agente.
Se você tem dois prédios, pode rodar **dois agentes** com keys
diferentes — cada um com sua configuração de IPs.

## Rodando como serviço

### Linux (systemd)

```ini
# /etc/systemd/system/cardapio-print-agent.service
[Unit]
Description=Cardapio SaaS Print Agent
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

### Windows

Use [nssm](https://nssm.cc/) ou rode pelo Agendador de Tarefas com
gatilho "Ao iniciar".

## Troubleshooting

- **`não foi possível autenticar`** → key errada ou agente desativado
  no painel.
- **`TCP timeout`** → impressora desligada, IP errado, ou porta diferente
  de 9100. Teste com `nc -vz 192.168.x.x 9100`.
- **Imprime caracteres errados** → algumas impressoras antigas exigem
  CP850 em vez de UTF-8. Edite `montarPayloadTexto()` em `index.js`.
