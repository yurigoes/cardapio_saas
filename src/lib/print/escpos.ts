/**
 * escpos.ts — Builder de bytes ESC/POS pra impressoras térmicas 80mm.
 *
 * Suporta:
 *   - Texto (com alinhamento, negrito, tamanho duplo)
 *   - Logo (imagem URL → raster ESC/POS via sharp)
 *   - QR code nativo (comando GS ( k em algumas impressoras OU raster fallback)
 *   - Corte automático de papel
 *
 * Output: Buffer de bytes brutos. Codifica como base64 antes de salvar
 * em print_jobs.conteudo (formato='escpos').
 */
import sharp from "sharp";
import QRCode from "qrcode";

// ─── ESC/POS commands ──────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

const INIT      = Buffer.from([ESC, 0x40]);              // ESC @
const CUT       = Buffer.from([GS,  0x56, 0x00]);        // GS V 0
const FEED_N    = (n: number) => Buffer.from([ESC, 0x64, n]);
const ALIGN_L   = Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_C   = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_R   = Buffer.from([ESC, 0x61, 0x02]);
const BOLD_ON   = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF  = Buffer.from([ESC, 0x45, 0x00]);
const SIZE_NORMAL = Buffer.from([GS, 0x21, 0x00]);
const SIZE_DOUBLE = Buffer.from([GS, 0x21, 0x11]);       // 2x altura+largura

// CP850 / CP437 não rendem acentos brasileiros. Usa CP858 (DOS extendido)
// que suporta ã, ç, etc. Code page 19 = CP858 em Epson.
const CHARSET   = Buffer.from([ESC, 0x52, 0x08]);        // ESC R 8 = Brasil
const CODEPAGE  = Buffer.from([ESC, 0x74, 0x13]);        // ESC t 19 = CP858

const ENC = "binary"; // sharp output for ESC/POS bytes

// ─── Builder API ───────────────────────────────────────────────
export class EscposBuilder {
  private parts: Buffer[] = [];
  private widthChars = 48;  // 80mm

  constructor(opts?: { widthChars?: number }) {
    if (opts?.widthChars) this.widthChars = opts.widthChars;
    this.parts.push(INIT, CHARSET, CODEPAGE, ALIGN_L, BOLD_OFF, SIZE_NORMAL);
  }

  text(s: string): this {
    // Substitui chars não suportados em CP858 (mantém maioria dos acentos PT-BR)
    const cleaned = s
      .replace(/—/g, "-").replace(/–/g, "-")
      .replace(/“|”/g, '"').replace(/‘|’/g, "'")
      .replace(/…/g, "...");
    this.parts.push(Buffer.from(cleaned + "\n", "latin1"));
    return this;
  }

  raw(buf: Buffer): this { this.parts.push(buf); return this; }

  alignLeft():   this { this.parts.push(ALIGN_L); return this; }
  alignCenter(): this { this.parts.push(ALIGN_C); return this; }
  alignRight():  this { this.parts.push(ALIGN_R); return this; }

  bold(on = true): this { this.parts.push(on ? BOLD_ON : BOLD_OFF); return this; }
  size(big = true): this { this.parts.push(big ? SIZE_DOUBLE : SIZE_NORMAL); return this; }

  feed(lines = 1): this { this.parts.push(FEED_N(lines)); return this; }

  /** Linha horizontal de '-' do tamanho do papel */
  hr(char = "-"): this {
    return this.text(char.repeat(this.widthChars));
  }

  /** Texto com label à esquerda e valor à direita */
  row(left: string, right: string): this {
    const total = this.widthChars;
    const space = Math.max(1, total - left.length - right.length);
    return this.text(left + " ".repeat(space) + right);
  }

  /**
   * Adiciona logo a partir de URL ou Buffer. Converte pra raster monocromático
   * 1bpp via sharp e emite GS v 0 (raster bit image).
   */
  async logoFromUrl(url: string, maxWidthPx = 384): Promise<this> {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      return await this.logo(buf, maxWidthPx);
    } catch (err) {
      console.warn("[escpos] logoFromUrl falhou:", err instanceof Error ? err.message : err);
      return this;
    }
  }

  async logo(imageBuf: Buffer, maxWidthPx = 384): Promise<this> {
    try {
      // Resize + monocromático + threshold
      const img = sharp(imageBuf)
        .resize({ width: maxWidthPx, fit: "inside" })
        .grayscale()
        .threshold(128);

      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      const widthPx  = info.width;
      const heightPx = info.height;
      const widthBytes = Math.ceil(widthPx / 8);

      // Converte pra bitmap 1bpp (1 bit = pixel preto)
      const raster = Buffer.alloc(widthBytes * heightPx);
      for (let y = 0; y < heightPx; y++) {
        for (let x = 0; x < widthPx; x++) {
          const v = data[y * widthPx + x];
          if (v === 0) {
            // pixel preto
            const byteIdx = y * widthBytes + (x >> 3);
            const bitMask = 0x80 >> (x & 7);
            raster[byteIdx] |= bitMask;
          }
        }
      }

      // GS v 0 m xL xH yL yH d1 ... dk
      const xL = widthBytes & 0xff;
      const xH = (widthBytes >> 8) & 0xff;
      const yL = heightPx & 0xff;
      const yH = (heightPx >> 8) & 0xff;
      this.parts.push(
        Buffer.from([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
        raster,
      );
    } catch (err) {
      console.warn("[escpos] logo() falhou:", err instanceof Error ? err.message : err);
    }
    return this;
  }

  /** QR code via biblioteca qrcode → PNG → mesma rotina de logo() */
  async qr(content: string, sizePx = 240): Promise<this> {
    try {
      const png = await QRCode.toBuffer(content, {
        type: "png",
        width: sizePx,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      return await this.logo(png, sizePx);
    } catch (err) {
      console.warn("[escpos] qr() falhou:", err instanceof Error ? err.message : err);
      this.text(`QR: ${content}`);
    }
    return this;
  }

  cut(): this {
    this.parts.push(FEED_N(3), CUT);
    return this;
  }

  build(): Buffer {
    return Buffer.concat(this.parts);
  }

  /** Retorna base64 pra salvar em print_jobs.conteudo */
  toBase64(): string {
    return this.build().toString("base64");
  }
}

// Suprime aviso de var não usada ENC
void ENC;
