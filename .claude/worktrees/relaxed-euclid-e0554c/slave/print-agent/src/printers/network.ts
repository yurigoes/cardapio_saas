/**
 * printers/network.ts — Impressão via TCP/IP (impressoras de rede)
 *
 * Envia dados ESC/POS diretamente via socket TCP para impressoras de rede.
 * Suporta timeout de 5s e 1 retry automático.
 */

import * as net from "net";

const TIMEOUT_MS = 5_000;

/**
 * Envia um buffer ESC/POS para uma impressora de rede via TCP.
 *
 * @param host    IP ou hostname da impressora
 * @param port    Porta TCP (geralmente 9100)
 * @param data    Buffer com dados ESC/POS
 */
export async function printRaw(host: string, port: number, data: Buffer): Promise<void> {
  return attemptPrint(host, port, data, 0);
}

async function attemptPrint(
  host:    string,
  port:    number,
  data:    Buffer,
  attempt: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled  = false;

    function settle(err?: Error) {
      if (settled) return;
      settled = true;
      socket.destroy();

      if (err) {
        if (attempt === 0) {
          // Retry 1x após falha
          attemptPrint(host, port, data, 1).then(resolve).catch(reject);
        } else {
          reject(new Error(`Impressora ${host}:${port} não acessível: ${err.message}`));
        }
      } else {
        resolve();
      }
    }

    socket.setTimeout(TIMEOUT_MS);

    socket.connect(port, host, () => {
      socket.write(data, (writeErr) => {
        if (writeErr) {
          settle(writeErr);
        } else {
          // Aguarda um momento para a impressora processar antes de fechar
          setTimeout(() => settle(), 200);
        }
      });
    });

    socket.on("timeout", () => {
      settle(new Error("Timeout de conexão"));
    });

    socket.on("error", (err) => {
      settle(err);
    });
  });
}
