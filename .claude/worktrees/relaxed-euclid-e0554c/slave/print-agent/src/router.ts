/**
 * router.ts — Roteamento de impressão por setor e tipo
 *
 * Determina qual impressora usar com base no setor e gera o buffer ESC/POS
 * correto para o tipo de documento (pedido, cozinha, etc.).
 */

import { config, Setor, NetworkPrinter, UsbPrinter } from "./config";
import { printRaw }     from "./printers/network";
import { printRawUSB }  from "./printers/usb";
import { printPedido, PedidoData } from "./templates/pedido";
import { printCozinha }             from "./templates/cozinha";
import { logger }                   from "./logger";

export type TipoPrint = "pedido" | "cozinha" | "producao" | "bar" | "conta";

/**
 * Roteador principal de impressão.
 *
 * @param setor  Setor de destino: totem, balcao, cozinha, producao, bar
 * @param tipo   Tipo de documento: pedido, cozinha, producao, bar, conta
 * @param data   Dados do pedido
 */
export async function routePrint(
  setor: string,
  tipo:  TipoPrint,
  data:  PedidoData
): Promise<void> {
  const printerConfig = config.printers[setor as Setor];

  if (!printerConfig) {
    logger.warn(`Impressora para setor '${setor}' não configurada — impressão ignorada`, {
      setor,
      tipo,
      pedido: data.numero,
    });
    return;  // Não falha — simplesmente não imprime
  }

  // Gera o buffer correto para o tipo de documento
  let buffer: Buffer;

  switch (tipo) {
    case "cozinha":
    case "producao":
    case "bar":
      buffer = printCozinha(data, setor.toUpperCase());
      break;

    case "pedido":
    case "conta":
    default:
      buffer = printPedido({ ...data, empresaNome: config.empresaNome });
      break;
  }

  // Envia para a impressora correta
  logger.info(`Imprimindo pedido #${data.numero} em ${setor} (${tipo})`, {
    setor,
    tipo,
    impressora: printerConfig.type,
    ...(printerConfig.type === "network" ? { host: (printerConfig as NetworkPrinter).host } : {}),
  });

  if (printerConfig.type === "network") {
    const netPrinter = printerConfig as NetworkPrinter;
    await printRaw(netPrinter.host, netPrinter.port, buffer);
  } else if (printerConfig.type === "usb") {
    const usbPrinter = printerConfig as UsbPrinter;
    await printRawUSB(usbPrinter.vendorId, usbPrinter.productId, buffer);
  } else {
    throw new Error(`Tipo de impressora desconhecido: ${(printerConfig as { type: string }).type}`);
  }

  logger.info(`Impressão concluída: pedido #${data.numero} em ${setor}`);
}

/**
 * Testa a conectividade de uma impressora de rede.
 * Retorna "ok", "erro" ou "não configurado".
 */
export async function checkPrinterStatus(setor: Setor): Promise<"ok" | "erro" | "não configurado"> {
  const printerConfig = config.printers[setor];
  if (!printerConfig) return "não configurado";

  if (printerConfig.type !== "network") return "ok";  // USB não faz health check

  const netPrinter = printerConfig as NetworkPrinter;
  try {
    // Envia buffer vazio — apenas verifica se a porta aceita conexão
    await printRaw(netPrinter.host, netPrinter.port, Buffer.alloc(0));
    return "ok";
  } catch {
    return "erro";
  }
}
