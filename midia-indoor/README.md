# Three Digital — Mídia Indoor

Projeto **separado** do sistema de restaurante (Three Digital / cardapio_saas).
Plataforma própria de mídia indoor (digital signage), rodando na mesma VPS.

## Componentes

```
midia-indoor/
├── xibo/        Motor de digital signage (Xibo CMS) — Docker isolado
│                Gerencia o conteúdo das TVs. Você controla tudo daqui.
│                → midia.tthreedigital.com.br
│
└── landing/     Site comercial + captação de leads (Next.js)
                 Landing page, planos, formulário de cadastro.
                 → midiaindoor.tthreedigital.com.br (ou o que escolher)
```

## Arquitetura

```
                   ┌─────────────────────────────────────┐
   Cliente vê  →   │  landing (porta 3100)               │
   planos e cadastra│  capta lead → salva PG + avisa você │
                   └─────────────────────────────────────┘
                                  │ (você aprova manualmente por enquanto)
                                  ↓
   Você gerencia →   ┌─────────────────────────────────────┐
   o conteúdo        │  Xibo CMS (porta 8080)              │
                     │  cria empresa/pasta/display          │
                     │  sobe conteúdo, agenda               │
                     └─────────────────────────────────────┘
                                  │ players conectam
                                  ↓
                     ┌─────────────────────────────────────┐
                     │  TVs nas lojas (Xibo Player Android) │
                     └─────────────────────────────────────┘
```

## Isolamento do Three Digital

- Rede Docker própria (`midia_net`) — não toca em `cardapio_net`
- Portas próprias: Xibo 8080, landing 3100 (Three Digital usa 3000)
- Limites de memória: Xibo cap ~2.3 GB (sobra ~5.5 GB pro resto na VPS de 8 GB)
- Containers com prefixo `midia_*` (não conflita com `cardapio_*`)

## Ordem de instalação

1. **Xibo** (`xibo/README.md`) — sobe o CMS, configura tunnel, sua marca
2. **Landing** (`landing/README.md`) — sobe o site comercial
3. **Cloudflare** — adiciona 2 hostnames no tunnel existente:
   - `midia.tthreedigital.com.br` → localhost:8085 (Xibo)
   - `midiaindoor.tthreedigital.com.br` → localhost:3100 (landing)

## Estado atual

- ✅ Xibo: stack Docker pronto pra deploy
- ✅ Landing: MVP com planos + captação de leads (salva PG + notifica WhatsApp)
- ⏳ Próximo: pagamento recorrente + área do cliente + auto-provisionamento
  Xibo via API (ver landing/README.md → Roadmap)

## Você gerencia tudo daqui

Por enquanto o fluxo é semi-manual (do seu jeito):
1. Cliente cadastra na landing → você recebe no WhatsApp
2. Você cobra (link de pagamento manual ou Mercado Pago)
3. Você cria a conta/pasta/display dele no Xibo
4. Manda o cliente instalar o Xibo Player na TV + código de pareamento
5. Você sobe o conteúdo e agenda

Quando o volume crescer, automatizamos os passos 2-4 (roadmap).
