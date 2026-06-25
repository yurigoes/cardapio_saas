# Three Pay — app do terminal Cielo Smart (L400)

App Android que roda **no terminal Cielo Smart (L400)** e faz a ponte entre o
nosso backend (fila de cobranças) e o SDK de pagamento da Cielo (OrderManager).

## O que ele faz

```
Totem (web) ──cria pedido──> Backend (terminal_transacoes: processando)
                                  ↑ GET /api/terminal-agent/proxima   (polling)
                           Three Pay (este app, rodando no L400)
                                  ↓ OrderManager.placeOrder() (SDK Cielo)
                              Cliente passa o cartão no L400
                                  ↓ POST /api/terminal-agent/resultado
                              Backend atualiza a transação → totem vê "aprovado"
```

- Faz **polling** de `GET {BACKEND}/api/terminal-agent/proxima?token={AGENT_TOKEN}` a cada ~3s.
- Quando vem uma cobrança, chama o **OrderManager SDK** (cobra crédito/débito/PIX no terminal).
- Recebe o resultado via callback do SDK e faz `POST {BACKEND}/api/terminal-agent/resultado`.
- Tela "Aguardando pedido…" quando ocioso; "Cobrando R$ X" durante a transação.

## Credenciais (Cielo Dev Portal → Perfil → Client-IDs Cadastrados)

Coloque em `local.properties` (NÃO commitar) ou em `BuildConfig`:

```
CIELO_CLIENT_ID=...          # Client-Id gerado no portal (app "Three Pay")
CIELO_ACCESS_TOKEN=...       # Access-Token do mesmo app
BACKEND_URL=https://SEU_DOMINIO
AGENT_TOKEN=...              # token do terminal (Painel > Integrações > Terminais)
```

> O `AGENT_TOKEN` também pode ser digitado na 1ª abertura do app (tela de
> pareamento) em vez de embutir — recomendado pra reaproveitar o mesmo APK em
> vários terminais.

## Dependência do SDK Cielo

Adicione o SDK Order Manager no `app/build.gradle.kts` (versão conforme o portal
Cielo / repositório fornecido na homologação). O ponto de integração está
isolado em `CieloPayment.kt` (hoje é um STUB que simula aprovação) — troque a
implementação `cobrar()` pela chamada real do `OrderManager` quando tiver o SDK.

## Build / instalação

- **Dev/teste:** Build APK no Android Studio e instale via **QR code do Cielo Dev Console** no terminal (adb direto NÃO funciona em terminal de produção).
- **Produção:** suba o APK no Dev Console → homologação Cielo (~48h úteis) → publique na **Cielo Store** (pública ou privada) → instale no L400 pela conta do EC.

## Status

⚠️ **Scaffold.** A rede (polling + post resultado) e a UI estão prontas. A
chamada real do SDK Cielo está marcada com `TODO` em `CieloPayment.kt` — precisa
do SDK + credenciais + homologação pra finalizar.
