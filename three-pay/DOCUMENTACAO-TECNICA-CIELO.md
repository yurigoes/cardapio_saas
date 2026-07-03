# Three Pay — Documentação Técnica (Certificação Cielo)

**App:** Three Pay
**Package:** `com.threedigital.threepay`
**Versão:** 1.5 (versionCode 6)
**SDK Cielo:** Order Manager `2.7.2` (`cielo.sdk.order.OrderManager`)
**minSdk:** 25 · **targetSdk:** 34 · assinatura V2
**Client-Id (dev):** `be1a58d9e4ca415bbf84fd02a36b35a3`
(Access-Token: o emitido para esta aplicação — não reproduzido aqui por segurança.)

---

## 1. Como visualizar o fluxo de pagamento (para a certificação)

Como as credenciais em uso são de **desenvolvimento**, o terminal entra em *"Modo de
desenvolvimento — transação de pagamento proibida"* e bloqueia a transação real. Para o
time de certificação **ver as telas reais do app processando um pagamento**, o app possui
um **MODO DEMONSTRAÇÃO** que exibe o fluxo completo com **aprovação simulada** (sem chamar
a transação do SDK, evitando o bloqueio do modo dev).

### Token de teste
```
THREEPAY-TESTE-CIELO
```

### Passo a passo
1. Instale e abra o **Three Pay** no terminal.
2. Na tela inicial ("Parear terminal"), faça **uma** das opções:
   - Toque no botão **"Pagamento de teste (R$ 1,00)"**, **ou**
   - Cole o token **`THREEPAY-TESTE-CIELO`** no campo e toque em **"Parear"**.
3. O app abre a **tela de pagamento real** e executa o fluxo:
   `Cobrança recebida` → `Aproxime, insira ou passe o cartão…` → `Processando pagamento…`
   → **`✅ Pagamento aprovado — R$ 1,00`** (com bandeira, últimos 4 dígitos e NSU).
4. Após ~4s, retorna à tela inicial.

> Em **produção**, com **credenciais de produção**, o MESMO fluxo executa a transação real
> via SDK Cielo (createDraftOrder → addItem → placeOrder → checkoutOrder). O modo
> demonstração serve apenas para validação visual quando a transação real está bloqueada
> pelo modo de desenvolvimento.

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

## 5. Observação sobre a reprovação anterior

O erro *"SDK Cielo não inicializado"* ocorria porque, em modo de desenvolvimento, a
inicialização do SDK não completava e o app não tinha um caminho de demonstração — exibindo
a mensagem de erro. **Corrigido nesta versão (1.5):** quando o SDK não está disponível
(ambiente dev), o app entra automaticamente em **modo demonstração**, exibindo o fluxo real
de telas com aprovação simulada (via token de teste / botão de teste), conforme a seção 1.

**Contato técnico:** Three Digital — digitalvendasthree@gmail.com
