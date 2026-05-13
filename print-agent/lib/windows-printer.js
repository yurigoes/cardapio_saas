/**
 * Envia bytes raw (ESC/POS) pra uma impressora Windows pelo nome.
 *
 * Usa o utilitário `print` do Windows (lpr-like) com /D:"\\localhost\Nome"
 * que mantém os bytes brutos sem formatação.
 *
 * Funciona pra:
 *   - Impressora local USB (ex: "POS-58")
 *   - Impressora compartilhada na rede via Windows (ex: "POS-Cozinha")
 *
 * Não funciona em Linux/Mac — usa TCP nesses casos.
 */
"use strict";

const { spawn } = require("child_process");
const fs        = require("fs");
const os        = require("os");
const path      = require("path");

/**
 * Lista as impressoras instaladas no Windows.
 * Retorna [] em outros sistemas.
 */
function listarImpressorasWindows() {
  if (process.platform !== "win32") return Promise.resolve([]);

  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command",
      "Get-Printer | Select-Object -ExpandProperty Name"
    ]);
    let out = "";
    ps.stdout.on("data", (c) => { out += c; });
    ps.on("close", () => {
      const list = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      resolve(list);
    });
    ps.on("error", () => resolve([]));
  });
}

/**
 * Envia o buffer raw pra impressora pelo nome.
 * Resolve em sucesso, rejeita com erro.
 */
function imprimirWindows(printerName, payload) {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("imprimirWindows só funciona em Windows"));
  }

  // Escreve bytes num arquivo temporário (necessário pro `print` lidar com binário)
  const tmpFile = path.join(os.tmpdir(), `cardapio-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);

  return new Promise((resolve, reject) => {
    fs.writeFile(tmpFile, payload, (err) => {
      if (err) return reject(err);

      // /D:device — nome da impressora com prefixo \\localhost\
      const device = printerName.startsWith("\\\\")
        ? printerName
        : `\\\\localhost\\${printerName}`;

      const proc = spawn("print", [`/D:${device}`, tmpFile]);
      let stderr = "";
      proc.stderr.on("data", (c) => { stderr += c; });
      proc.on("close", (code) => {
        fs.unlink(tmpFile, () => {});
        if (code === 0) resolve();
        else            reject(new Error(`print exit ${code}: ${stderr.trim()}`));
      });
      proc.on("error", (e) => {
        fs.unlink(tmpFile, () => {});
        reject(e);
      });
    });
  });
}

module.exports = { listarImpressorasWindows, imprimirWindows };
