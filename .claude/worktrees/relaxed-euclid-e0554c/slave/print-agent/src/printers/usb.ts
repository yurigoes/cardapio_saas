/**
 * printers/usb.ts — Impressão via USB
 *
 * Usa @node-escpos/usb para enviar dados ESC/POS para impressoras USB.
 * Fornece fallback descritivo quando USB não está disponível.
 */

/**
 * Envia um buffer ESC/POS para uma impressora USB.
 *
 * @param vendorId  ID do fabricante em hex (ex: "0x04b8" para Epson)
 * @param productId ID do produto em hex
 * @param data      Buffer com dados ESC/POS
 */
export async function printRawUSB(
  vendorId:  string,
  productId: string,
  data:      Buffer
): Promise<void> {
  // Converte strings hex para inteiros
  const vid = parseInt(vendorId,  16);
  const pid = parseInt(productId, 16);

  if (isNaN(vid) || isNaN(pid)) {
    throw new Error(`VendorId/ProductId inválido: ${vendorId} / ${productId}`);
  }

  // Importação dinâmica — evita crash se o módulo USB não estiver disponível
  let usbModule: typeof import("@node-escpos/usb");
  try {
    usbModule = await import("@node-escpos/usb");
  } catch {
    throw new Error(
      "Módulo USB não disponível. Verifique se @node-escpos/usb está instalado e " +
      "se os drivers USB (libusb / WinUSB) estão configurados corretamente."
    );
  }

  return new Promise((resolve, reject) => {
    try {
      // @ts-expect-error — tipagem do pacote alpha pode variar
      const device = new usbModule.USB(vid, pid);

      // @ts-expect-error
      device.open((err: Error | null) => {
        if (err) {
          reject(new Error(`Falha ao abrir dispositivo USB: ${err.message}`));
          return;
        }

        // @ts-expect-error
        device.write(data, (writeErr: Error | null) => {
          // @ts-expect-error
          device.close();

          if (writeErr) {
            reject(new Error(`Falha ao escrever na impressora USB: ${writeErr.message}`));
          } else {
            resolve();
          }
        });
      });
    } catch (err) {
      reject(new Error(`Erro ao acessar impressora USB ${vendorId}:${productId}: ${String(err)}`));
    }
  });
}
