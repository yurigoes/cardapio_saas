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

## Build com credenciais

As credenciais Cielo (Client-Id/Access-Token) entram via `local.properties`
(NÃO commitar):

```
CIELO_CLIENT_ID=seu_client_id
CIELO_ACCESS_TOKEN=seu_access_token
```

Build: `./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.

## Testar na maquininha real (antes da homologação)

1. No **Cielo Dev Console**, registre o APK do app (modo teste/sandbox).
2. O console gera um **QR code de instalação** — abra no L400 pra instalar o app de teste (não precisa adb nem homologação completa pra testar).
3. Abra o Three Pay no L400, cole o `agent_token` do terminal (Painel > Integrações > Terminais).
4. Faça um pedido no totem pagando "Cartão (maquininha)" → o L400 abre a tela de pagamento da Cielo → passe o cartão → comprovante imprime no terminal → o totem conclui.

> Pra produção: homologação Cielo (~48h) → publicar na Cielo Store → instalar pela conta do EC.

## Status

✅ Rede (polling + resultado), UI e fluxo de pagamento com o **SDK Cielo real**
(`OrderManager` + `PaymentListener`) + impressão do comprovante no terminal
(`PrinterManager`) implementados em `CieloPayment.kt`.

⚠️ Os nomes de classe/método do SDK podem variar conforme a versão
(`com.cielo.lio:order-manager`). Ao compilar no Android Studio, se algo divergir,
ajuste contra o sample oficial: https://github.com/DeveloperCielo/LIO-SDK-Sample-Integracao-Local
(veja `PaymentActivity` e `PrintSampleActivity`). Pra testar o fluxo sem o
terminal, ligue `USAR_SIMULADOR = true` em `CieloPayment.kt`.
