/**
 * Envia bytes raw (ESC/POS) pra uma impressora Windows pelo nome.
 *
 * Estratégia: PowerShell com Add-Type/.NET RawPrinterHelper que chama
 * direto a Win32 print API (winspool.drv). Bypass do driver — manda
 * bytes sem nenhuma formatação (essencial pra ESC/POS).
 *
 * Funciona pra:
 *   - Impressora local USB (ex: "EPSON TM-T20X Receipt")
 *   - Impressora compartilhada via Windows (ex: "\\PC-CAIXA\EPSON")
 */
"use strict";

const { spawn } = require("child_process");
const fs        = require("fs");
const os        = require("os");
const path      = require("path");

/**
 * Lista as impressoras instaladas no Windows.
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
 * Envia bytes raw pra impressora Windows via Win32 API.
 * Usa PowerShell + Add-Type pra carregar um helper C# em runtime.
 */
function imprimirWindows(printerName, payload) {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("imprimirWindows só funciona em Windows"));
  }

  // Escreve bytes em arquivo temporário (PowerShell lê e envia)
  const tmpFile = path.join(
    os.tmpdir(),
    `cardapio-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`
  );

  return new Promise((resolve, reject) => {
    fs.writeFile(tmpFile, payload, (err) => {
      if (err) return reject(err);

      // Escapa aspas duplas no nome da impressora
      const printerEsc = printerName.replace(/"/g, '\\"');

      // Script PowerShell que carrega RawPrinterHelper via Add-Type
      // e envia o arquivo binário direto pra impressora
      const psScript = `
$ErrorActionPreference = 'Stop'
$source = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] data) {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Three Digital Print Job";
        di.pDataType = "RAW";
        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter failed for: " + szPrinterName + " (err=" + Marshal.GetLastWin32Error() + ")");
        try {
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("StartDocPrinter failed (err=" + Marshal.GetLastWin32Error() + ")");
            try {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("StartPagePrinter failed (err=" + Marshal.GetLastWin32Error() + ")");
                IntPtr p = Marshal.AllocCoTaskMem(data.Length);
                try {
                    Marshal.Copy(data, 0, p, data.Length);
                    Int32 written;
                    if (!WritePrinter(hPrinter, p, data.Length, out written))
                        throw new Exception("WritePrinter failed (err=" + Marshal.GetLastWin32Error() + ")");
                    if (written != data.Length)
                        throw new Exception("Wrote " + written + " of " + data.Length + " bytes");
                } finally { Marshal.FreeCoTaskMem(p); }
                EndPagePrinter(hPrinter);
            } finally { EndDocPrinter(hPrinter); }
        } finally { ClosePrinter(hPrinter); }
        return true;
    }
}
"@
Add-Type -TypeDefinition $source -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes("${tmpFile.replace(/\\/g, "\\\\")}")
[RawPrinterHelper]::SendBytesToPrinter("${printerEsc}", $bytes)
Write-Output "OK"
`.trim();

      const proc = spawn("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-Command", psScript
      ]);

      let stdout = "", stderr = "";
      proc.stdout.on("data", (c) => { stdout += c; });
      proc.stderr.on("data", (c) => { stderr += c; });
      proc.on("close", (code) => {
        fs.unlink(tmpFile, () => {});
        if (code === 0 && stdout.includes("OK")) {
          resolve();
        } else {
          const err = stderr.trim() || stdout.trim() || `exit ${code}`;
          reject(new Error(`Win32 print failed: ${err.slice(0, 300)}`));
        }
      });
      proc.on("error", (e) => {
        fs.unlink(tmpFile, () => {});
        reject(e);
      });
    });
  });
}

module.exports = { listarImpressorasWindows, imprimirWindows };
