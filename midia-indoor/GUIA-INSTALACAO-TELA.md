# Guia rápido — Instalar uma tela (player) na rede Three Digital Mídia

Passo a passo pra colocar uma TV nova no ar. Tempo médio: ~10 minutos por tela.

---

## O que você precisa

- Uma **TV** ou um **Android TV Box** (caixinha) ligado na TV via HDMI.
- **Internet** no local (Wi‑Fi ou cabo).
- Acesso ao painel admin: **https://midiaindoor.tthreedigital.com.br/admin**

> Recomendado: TV Box Android barata (ex: com Android 9+). Funciona melhor que apps de "Smart TV".

---

## Passo 1 — Cadastrar o local (se ainda não existe)

1. Entre no admin → aba **Locais** → **Novo local**.
2. Preencha nome (ex: `Padaria Central - Balcão`), cidade, endereço.
3. **Resolução**: como a tela vai ficar?
   - TV em pé (vertical) → **1080 × 1920**
   - TV deitada (horizontal) → **1920 × 1080**
4. Salvar.

---

## Passo 2 — Instalar o app player na TV

1. Na TV/Box Android, abra a **Play Store**.
2. Busque por **"Xibo for Android"** (ícone do Xibo) e **instale**.
3. Abra o app. Na primeira vez ele pede a configuração do CMS.

### Configuração do CMS (preencher no app):

| Campo | Valor |
|-------|-------|
| **CMS Address** | `https://midia.tthreedigital.com.br` |
| **Key** (CMS Secret Key) | *(ver abaixo)* |
| **Display Name** | nome da tela (ex: `Padaria Central - Balcão`) |

> **Onde achar a Key:** no painel do Xibo em *Administration → Settings → aba Network → "CMS Secret Key"*. É a mesma chave pra todas as telas. (Se preferir, peça pro responsável técnico — é um valor fixo.)

4. Salve. O app vai tentar conectar e mostrar uma mensagem tipo **"aguardando autorização"**.

---

## Passo 3 — Autorizar e vincular a tela (no admin)

1. No admin → aba **Telas**.
2. A TV recém-instalada aparece em **"Aguardando vínculo"**.
3. No seletor, escolha o **local** dela e clique **Vincular**.
   - Isso autoriza o player e associa ao local automaticamente.
4. Pronto — a tela passa pra lista de **ativas** e em alguns minutos começa a baixar o conteúdo.

---

## Passo 4 — Colocar conteúdo

1. **Conteúdo base** (o que toca quando não tem anúncio): admin → **Locais** → no card do local, **"Conteúdo base"** → suba uma imagem ou vídeo.
2. **Anúncios**: admin → **Campanhas** → crie a campanha (anunciante + pacote + este local), envie a arte e **Lance no ar**.

Os anúncios entram automaticamente na grade junto com o conteúdo base.

---

## Conferindo se está tocando

- Na aba **Telas**, a tela deve aparecer **online** (Wi‑Fi verde).
- A TV mostra primeiro a logo da Three Digital enquanto baixa, depois o conteúdo.
- Demora 1–5 min pra sincronizar o conteúdo novo (o player baixa em segundo plano).

---

## Problemas comuns

| Sintoma | Solução |
|---------|---------|
| App fica "aguardando autorização" | Vá em **Telas** no admin e clique **Vincular** na tela pendente. |
| Não aparece em "Telas" | Confira o **CMS Address** (tem que ser `https://midia.tthreedigital.com.br`) e a internet do local. |
| "Key inválida" / não conecta | A **CMS Secret Key** está errada — confira em Settings → Network no Xibo. |
| Tela preta / não baixa | Aguarde alguns minutos. Confirme que o local tem **conteúdo base** ou uma **campanha no ar**. |
| Tela girada errada | Ajuste a orientação da TV/Box (girar a tela do Android) e confira a resolução do local (1080×1920 vertical / 1920×1080 horizontal). |

---

## Dica de operação

- **Nomeie sempre a tela com o nome do local** — isso aparece no relatório de exibições que o anunciante recebe (transparência).
- Uma TV Box pode ficar ligada 24/7; configure a TV pra ligar/desligar em horário comercial se quiser economizar.
