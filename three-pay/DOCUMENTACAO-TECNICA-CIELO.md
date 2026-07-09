# Three Pay — Documentação Técnica (Certificação Cielo)

**App:** Three Pay
**Package:** `com.threedigital.threepay`
**Versão:** 1.6 (versionCode 7)
**SDK Cielo:** Order Manager `2.7.2` + `event-tracker 1.0.1` (`cielo.sdk.order.OrderManager`)
**minSdk:** 25 · **targetSdk:** 34 · assinatura V2
**Client-Id (dev):** `be1a58d9e4ca415bbf84fd02a36b35a3`
(Access-Token: o emitido para esta aplicação — não reproduzido aqui por segurança.)

---

## 1. Como testar o fluxo de pagamento (para a certificação)

O app executa a **transação real via SDK Cielo**, acionando o terminal. Para facilitar a
validação há um botão que dispara uma transação de teste de **R$ 1,00**.

### Como disparar
1. Instale e abra o **Three Pay** no terminal.
2. Na tela inicial ("Parear terminal"), toque em **"Pagamento de teste (R$ 1,00)"**
   (ou cole o token **`THREEPAY-TESTE-CIELO`** e toque em "Parear").
3. O app chama o SDK — `createDraftOrder → addItem → placeOrder → checkoutOrder` — que
   **abre a tela de pagamento do próprio terminal Cielo** (`ExternalPaymentActivity`).
   O cliente conclui com o cartão e o resultado (aprovado/recusado/cancelado) volta ao app
   pelo `PaymentListener`.

Validação em ambiente de desenvolvimento (emulador Cielo Smart `br.com.cielosmart.orderservice`),
comprovada por log: `Cielo SDK bound` → `cielo.launcher.CHECKOUT` →
`br.com.cielosmart.orderservice/.ui.activity.ExternalPaymentActivity`.

> Observação: em ambiente de desenvolvimento o terminal pode exibir *"Modo de desenvolvimento
> — transação de pagamento proibida"* (controle do ambiente Cielo); no terminal homologado da
> certificação a transação é processada. O **acionamento do terminal** (checkoutOrder → tela de
> pagamento) já ocorre em ambos os ambientes.

---

## 2. Arquitetura e fluxo de integração

O Three Pay conecta um **totem de autoatendimento** (onde o cliente monta o pedido) ao
**terminal Cielo** (que processa o pagamento). Fluxo em produção:

```
Totem (autoatendimento)                Backend Three                 App Three Pay (terminal Cielo)
   |  cliente finaliza pedido              |                                   |
   |  e escolhe pagar no cartão            |                                   |
   |------ cria cobrança ----------------->|  (fila por terminal)             |
   |                                       |<---- GET /proxima (polling) ------|
   |                                       |----- cobrança (valor, método) --->|
   |                                       |                                   |  SDK Cielo:
   |                                       |                                   |  createDraftOrder → addItem
   |                                       |                                   |  → placeOrder → checkoutOrder
   |                                       |                                   |  (cliente passa o cartão)
   |                                       |<---- POST /resultado -------------|  onPayment/onCancel/onError
   |<----- status (aprovado/recusado) -----|                                   |
```

### 2.1 Chamada ao SDK Cielo (núcleo)
```kotlin
val creds = Credentials(CIELO_CLIENT_ID, CIELO_ACCESS_TOKEN)
val order = OrderManager(creds, activity)
order.bind(activity, serviceBindListener)          // onServiceBound / onServiceBoundError
// ao cobrar:
val draft = order.createDraftOrder("Pedido #123")
draft.addItem(sku, nome, precoCentavos, quantidade, "UN")
order.placeOrder(draft)
order.checkoutOrder(draft.id, paymentListener)     // onStart / onPayment / onCancel / onError
```

---

## 3. Endpoints do backend (fila de cobranças por terminal)

Base: `https://app.tthreedigital.com.br`
Autenticação: `agent_token` único por terminal (gerado no painel do lojista).

### GET `/api/terminal-agent/proxima?token=<AGENT_TOKEN>`
Retorna a próxima cobrança pendente do terminal (ou `null`).
```json
{ "success": true, "data": { "cobranca": {
    "transacao_id": "uuid", "valor": 47.90, "metodo": "credito",
    "parcelas": 1, "pedido_id": "uuid",
    "pedido": { "numero": 1042, "cliente_nome": "…", "total": 47.90, "itens": [ … ] }
} } }
```

### POST `/api/terminal-agent/resultado`
Devolve o resultado da transação.
```json
{ "token": "<AGENT_TOKEN>", "transacao_id": "uuid", "resultado": "aprovada",
  "authorization_id": "…", "nsu": "…", "bandeira": "VISA", "ultimos_4": "1234" }
```

---

## 4. Parâmetros / requisitos de integração

| Item | Valor |
|------|-------|
| SDK | Cielo Order Manager 2.7.2 (AAR local) |
| Credenciais | `Credentials(Client-Id, Access-Token)` |
| Permissões | INTERNET, ACCESS_NETWORK_STATE |
| Fluxo pagamento | createDraftOrder → addItem → placeOrder → checkoutOrder |
| Listener | PaymentListener: onStart, onPayment(order), onCancel, onError(PaymentError) |
| Métodos | crédito / débito, à vista ou parcelado |

---

## 5. Correção da reprovação anterior

O erro *"SDK Cielo não inicializado"* era causado por uma **dependência faltando** no APK: o
`OrderManager` depende do `event-tracker` (classe `cielo.smart.eventtracker.EventTracker`), que
não estava empacotada — gerando `NoClassDefFoundError` na inicialização do SDK, sem acionar o
terminal. **Corrigido nesta versão (1.6):** adicionadas as bibliotecas `event-tracker-1.0.1.aar`
e as dependências Datadog exigidas por ela, e **removido** o caminho de simulação. O SDK agora
**inicializa e conecta ao serviço do terminal** (`onServiceBound`) e o `checkoutOrder` **aciona a
tela de pagamento do terminal** (`ExternalPaymentActivity`) — transação real, sem simulação.

**Contato técnico:** Three Digital — digitalvendasthree@gmail.com
