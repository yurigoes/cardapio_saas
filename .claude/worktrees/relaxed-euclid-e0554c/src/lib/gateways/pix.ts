import { createHmac } from "crypto";
import {
  CobrarRequest, CobrarResponse, ConsultarResponse,
  EstornarRequest, EstornarResponse, GatewayConfig,
  IGateway, WebhookValidation,
} from "./types";

// Implementação de PIX via BACEN (formato padrão EMV)
export class PixGateway implements IGateway {
  readonly slug = "pix_bancario" as const;
  readonly nome = "PIX Bancário";

  private readonly chave:       string;
  private readonly beneficiario: string;
  private readonly cidade:       string;
  private readonly webhook_secret?: string;

  constructor(private readonly config: GatewayConfig) {
    const cfg = config.configuracoes as {
      chave_pix?: string;
      beneficiario?: string;
      cidade?: string;
    };

    this.chave        = cfg.chave_pix   || config.merchant_id || "";
    this.beneficiario = cfg.beneficiario || "Estabelecimento";
    this.cidade       = cfg.cidade       || "CIDADE";
    this.webhook_secret = config.webhook_secret;
  }

  async cobrar(req: CobrarRequest): Promise<CobrarResponse> {
    const txid     = this.gerarTxId();
    const pixCopiaCola = this.gerarPixCopiaCola(req.valor, txid, req.descricao);

    return {
      gateway_id:      txid,
      status:          "aguardando",
      valor:           req.valor,
      metodo:          "pix",
      pix_copia_cola:  pixCopiaCola,
      pix_qrcode_url:  await this.gerarQRCodeUrl(pixCopiaCola),
      gateway_data:    {
        txid,
        chave: this.chave,
        expiracao: 3600, // 1 hora
      },
    };
  }

  async consultar(gatewayId: string): Promise<ConsultarResponse> {
    // Consulta via API do banco (a ser implementada por banco)
    return {
      gateway_id:   gatewayId,
      status:       "aguardando",
      valor:        0,
      gateway_data: {},
    };
  }

  async estornar(_req: EstornarRequest): Promise<EstornarResponse> {
    // PIX não suporta estorno automático — deve ser manual
    return {
      success:      false,
      gateway_id:   _req.gateway_id,
      status:       "cancelado",
      gateway_data: { message: "Estorno PIX deve ser feito manualmente no banco" },
    };
  }

  async validarWebhook(payload: unknown, signature: string): Promise<WebhookValidation> {
    if (!this.webhook_secret) {
      return { valid: true, payload: payload as Record<string, unknown> };
    }

    const body    = JSON.stringify(payload);
    const expected = createHmac("sha256", this.webhook_secret).update(body).digest("hex");
    const valid   = signature === expected;

    return { valid, payload: valid ? (payload as Record<string, unknown>) : {} };
  }

  // ─────────────────────────────────────────────
  // Geração do PIX Copia e Cola (EMV Merchant QR Code)
  // ─────────────────────────────────────────────
  private gerarTxId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 25 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  }

  private emvField(id: string, value: string): string {
    const len = value.length.toString().padStart(2, "0");
    return `${id}${len}${value}`;
  }

  private gerarPixCopiaCola(valor: number, txid: string, descricao?: string): string {
    const chaveField    = this.emvField("01", this.chave);
    const descField     = descricao ? this.emvField("02", descricao.slice(0, 72)) : "";
    const txidField     = this.emvField("05", txid);
    const merchantInfo  = this.emvField("26",
      this.emvField("00", "br.gov.bcb.pix") + chaveField + descField
    );

    const valorStr     = valor > 0 ? this.emvField("54", valor.toFixed(2)) : "";
    const nomeField    = this.emvField("59", this.beneficiario.slice(0, 25));
    const cidadeField  = this.emvField("60", this.cidade.slice(0, 15));
    const adField      = this.emvField("62", this.emvField("05", txidField));

    const payload = [
      this.emvField("00", "01"),
      this.emvField("01", "12"),
      merchantInfo,
      this.emvField("52", "0000"),
      this.emvField("53", "986"),
      valorStr,
      this.emvField("58", "BR"),
      nomeField,
      cidadeField,
      adField,
      "6304",
    ].join("");

    const crc = this.calcCrc16(payload);
    return payload + crc;
  }

  private calcCrc16(str: string): string {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
      }
    }
    return ((crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0"));
  }

  private async gerarQRCodeUrl(pixCopiaCola: string): Promise<string> {
    // QR Code via API pública (google charts como fallback dev)
    const encoded = encodeURIComponent(pixCopiaCola);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;
  }
}
