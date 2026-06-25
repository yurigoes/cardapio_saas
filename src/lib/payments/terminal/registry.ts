/**
 * Registry de drivers de terminal — adicione aqui novos bancos/gateways.
 *
 * Pra adicionar (ex: Stone, PagSeguro, GetNet, Rede):
 *  1. Crie arquivo lib/payments/terminal/<nome>.ts implementando BaseDriver
 *  2. Importe aqui
 *  3. Adicione no DRIVERS + DRIVER_META
 *  4. UI /painel/integracoes/terminais já mostra o novo driver automaticamente
 */
import type { BaseDriver } from "./types";
import { CieloApiDriver }       from "./cielo-api";
import { CieloTefIntentDriver } from "./cielo-tef-intent";
import { CieloLioDriver }       from "./cielo-lio";
import { CieloSmartAgentDriver } from "./cielo-smart-agent";

export interface DriverMeta {
  id:          string;        // chave única (vai pro banco)
  nome:        string;        // exibido na UI
  descricao:   string;        // ajuda contextual
  banco:       string;        // "Cielo", "Stone", "PagSeguro"
  tipo:        "tef_intent" | "api_online" | "mpos_bluetooth";
  campos_cred: Array<{        // schema de credenciais que a UI vai pedir
    chave:    string;
    label:    string;
    tipo:     "text" | "password" | "select";
    opcoes?:  Array<{ valor: string; label: string }>;
    placeholder?: string;
    obrigatorio?: boolean;
  }>;
  metodos_suportados: Array<"credito" | "debito" | "voucher" | "pix" | "qrcode">;
  docs_url?:   string;
}

export const DRIVERS: Record<string, BaseDriver> = {
  cielo_api:          CieloApiDriver,
  cielo_tef_intent:   CieloTefIntentDriver,
  cielo_lio:          CieloLioDriver,
  cielo_smart_agent:  CieloSmartAgentDriver,
};

export const DRIVER_META: DriverMeta[] = [
  {
    id:        "cielo_tef_intent",
    nome:      "Cielo TEF Android (PinPad físico)",
    descricao: "Para totem Android com pinpad. App 'Cliente Cielo' instalado dispara o terminal. Suporta crédito, débito, voucher e PIX.",
    banco:     "Cielo",
    tipo:      "tef_intent",
    campos_cred: [
      { chave: "merchant_id",    label: "Merchant ID Cielo",       tipo: "text",     obrigatorio: true,
        placeholder: "1006993069" },
      { chave: "merchant_key",   label: "Merchant Key",             tipo: "password", obrigatorio: true },
      { chave: "intent_package", label: "Package do app TEF",       tipo: "select",
        opcoes: [
          { valor: "cielo.smart.client",                  label: "Cliente Cielo (padrão)" },
          { valor: "br.com.softwareexpress.sitefweb",     label: "SiTef (Software Express)" },
          { valor: "br.com.paygotec.tef",                 label: "Pay&Go" },
          { valor: "br.com.tnt.autopay",                  label: "AutoPay TNT" },
        ],
        obrigatorio: true,
      },
      { chave: "ambiente", label: "Ambiente", tipo: "select",
        opcoes: [
          { valor: "producao", label: "Produção" },
          { valor: "sandbox",  label: "Sandbox (testes)" },
        ],
      },
    ],
    metodos_suportados: ["credito", "debito", "voucher", "pix"],
    docs_url: "https://developercielo.github.io/manual/cielo-lio",
  },
  {
    id:        "cielo_api",
    nome:      "Cielo API (online, PIX/QR Code)",
    descricao: "Para totem SEM pinpad. Gera QR Code PIX que o cliente paga pelo celular. Crédito requer Cielo Checkout (link de pagamento).",
    banco:     "Cielo",
    tipo:      "api_online",
    campos_cred: [
      { chave: "merchant_id",  label: "Merchant ID",  tipo: "text",     obrigatorio: true },
      { chave: "merchant_key", label: "Merchant Key", tipo: "password", obrigatorio: true },
      { chave: "ambiente",     label: "Ambiente",     tipo: "select",
        opcoes: [
          { valor: "producao", label: "Produção" },
          { valor: "sandbox",  label: "Sandbox" },
        ],
      },
    ],
    metodos_suportados: ["pix", "qrcode", "credito", "debito"],
    docs_url: "https://developercielo.github.io/manual/cielo-ecommerce",
  },
  {
    id:        "cielo_lio",
    nome:      "Cielo LIO (terminal próprio Cielo)",
    descricao: "Para quem TEM um terminal Cielo LIO físico. Comando enviado via API REST — não precisa de app no totem. LIO recebe push e pede cartão ao cliente. Suporta crédito, débito e PIX.",
    banco:     "Cielo",
    tipo:      "api_online",
    campos_cred: [
      { chave: "client_id",     label: "Client ID Cielo LIO",     tipo: "text",     obrigatorio: true,
        placeholder: "Credencial OAuth (painel Cielo)" },
      { chave: "client_secret", label: "Client Secret",            tipo: "password", obrigatorio: true },
      { chave: "merchant_id",   label: "Merchant ID (opcional)",   tipo: "text" },
      { chave: "lio_serial",    label: "Serial da LIO (opcional)", tipo: "text",
        placeholder: "Se conta tem várias LIOs, especifica qual" },
      { chave: "ambiente",      label: "Ambiente",                  tipo: "select",
        opcoes: [
          { valor: "producao", label: "Produção" },
          { valor: "sandbox",  label: "Sandbox" },
        ],
      },
    ],
    metodos_suportados: ["credito", "debito", "pix"],
    docs_url: "https://developercielo.github.io/manual/cielo-lio",
  },
  {
    id:        "cielo_smart_agent",
    nome:      "Cielo Smart / L400 (app no terminal)",
    descricao: "Totem separado + maquininha Cielo Smart (L400) ao lado. O totem envia a cobrança e o app 'Three Pay' no terminal cobra via SDK Cielo. Gera um token de pareamento pro app. Suporta crédito, débito, voucher e PIX.",
    banco:     "Cielo",
    tipo:      "tef_intent",
    campos_cred: [
      { chave: "etiqueta", label: "Identificação do terminal (opcional)", tipo: "text",
        placeholder: "ex: L400 do balcão · POS 02254411-8" },
      { chave: "max_parcelas", label: "Máx. parcelas no crédito (1 = não parcela)", tipo: "select",
        opcoes: [
          { valor: "1",  label: "1x (não parcela)" },
          { valor: "2",  label: "Até 2x" },
          { valor: "3",  label: "Até 3x" },
          { valor: "4",  label: "Até 4x" },
          { valor: "6",  label: "Até 6x" },
          { valor: "10", label: "Até 10x" },
          { valor: "12", label: "Até 12x" },
        ],
      },
    ],
    metodos_suportados: ["credito", "debito", "voucher", "pix"],
    docs_url: "https://developercielo.github.io/manual/lio-local",
  },
  // ── Stubs prontos pra implementar quando precisar ────────────
  // {
  //   id: "stone_api", nome: "Stone API", banco: "Stone", tipo: "api_online", ...
  // },
  // {
  //   id: "pagseguro_mpos", nome: "PagSeguro MPOS", banco: "PagSeguro", tipo: "mpos_bluetooth", ...
  // },
];

export function getDriver(id: string): BaseDriver | null {
  return DRIVERS[id] ?? null;
}

export function getDriverMeta(id: string): DriverMeta | null {
  return DRIVER_META.find(d => d.id === id) ?? null;
}
