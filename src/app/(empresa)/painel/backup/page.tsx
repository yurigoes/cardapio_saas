"use client";

/**
 * /painel/backup — Exportação e importação de configuração da empresa
 *
 * Útil para:
 *   - Backup periódico antes de mudanças grandes
 *   - Migrar setup entre ambientes (sandbox → produção)
 *   - Replicar setup em filiais novas
 *   - Recuperar de erro humano
 */
import { useState } from "react";
import {
  Database, Download, Upload, AlertTriangle, CheckCircle, Loader2, FileText,
} from "lucide-react";
import { confirmar } from "@/components/ui/ConfirmModal";

interface RestoreStats {
  empresa_atualizada:    boolean;
  categorias_inseridas:  number;
  categorias_atualizadas: number;
  produtos_inseridos:    number;
  produtos_atualizados:  number;
  cupons_inseridos:      number;
  cupons_atualizados:    number;
  mesas_inseridas:       number;
  mesas_atualizadas:     number;
}

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader(): HeadersInit { return { Authorization: `Bearer ${getToken()}` }; }

export default function BackupPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [restoreStats, setRestoreStats] = useState<RestoreStats | null>(null);
  const [erro, setErro] = useState("");

  async function exportar() {
    setExporting(true);
    setErro("");
    try {
      const res = await fetch("/api/painel/backup", { headers: authHeader() });
      if (!res.ok) { setErro("Erro ao gerar backup"); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setErro("Erro de conexão ao exportar");
    } finally { setExporting(false); }
  }

  async function importar(file: File) {
    if (!await confirmar({
      titulo: "Restaurar configuração?",
      mensagem:
        "ATENÇÃO: o restore vai mesclar a configuração do arquivo com a empresa atual.\n" +
        "• Categorias/produtos/cupons existentes (mesmo nome) são atualizados\n" +
        "• Novos itens são criados\n" +
        "• Nada é apagado\n" +
        "• Pedidos, clientes, pagamentos e credenciais NÃO são tocados",
      okLabel: "Restaurar",
      perigo: true,
    })) return;

    setImporting(true);
    setErro("");
    setRestoreStats(null);
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        setErro("Arquivo não é JSON válido");
        return;
      }
      const res = await fetch("/api/painel/backup/restore", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify(json),
      });
      const data = await res.json();
      if (!data.success) {
        setErro(data.error || "Erro ao restaurar");
        return;
      }
      setRestoreStats(data.data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally { setImporting(false); }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) importar(f);
    e.target.value = ""; // reset
  }

  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Database className="h-6 w-6 text-brand" />
          Backup & Restauração
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Exporte ou importe a configuração da sua empresa em JSON
        </p>
      </div>

      {/* Aviso */}
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-300" />
          <div className="text-xs text-amber-100/90 space-y-1">
            <p><strong>Backup inclui:</strong> empresa (cores, horários, configs), categorias, produtos (com variações e estoque), cupons templates, mesas e estrutura de gateways.</p>
            <p><strong>Backup NÃO inclui:</strong> pedidos, clientes, pagamentos, caixas (dados transacionais) nem credenciais sensíveis (gateways/Evolution/N8N).</p>
            <p>Restore é <strong>não-destrutivo</strong>: nunca deleta itens, apenas adiciona ou atualiza por nome/código.</p>
          </div>
        </div>
      </div>

      {/* Exportar */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <Download className="h-5 w-5 text-brand" />
              Exportar configuração
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Baixa um arquivo JSON com toda a configuração atual.
              Guarde em local seguro — pode ser usado para restaurar depois.
            </p>
          </div>
          <button
            onClick={exportar}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50 transition"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar backup
          </button>
        </div>
      </section>

      {/* Importar */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <Upload className="h-5 w-5 text-brand" />
              Importar configuração
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Selecione um arquivo .json gerado por esta página (versão 1).
              Mescla com a configuração atual sem apagar nada.
            </p>
          </div>

          <label className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 cursor-pointer transition ${
            importing ? "border-white/10 opacity-50 cursor-wait" : "border-white/15 hover:border-brand/40 hover:bg-white/5"
          }`}>
            <input
              type="file"
              accept="application/json,.json"
              onChange={onFileChange}
              disabled={importing}
              className="hidden"
            />
            {importing ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
                <p className="text-sm text-slate-300">Restaurando configuração...</p>
              </>
            ) : (
              <>
                <FileText className="h-8 w-8 text-slate-500" />
                <p className="text-sm text-slate-300">Clique para selecionar um arquivo .json</p>
                <p className="text-xs text-slate-500">ou arraste e solte aqui</p>
              </>
            )}
          </label>

          {erro && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {erro}
            </div>
          )}

          {restoreStats && (
            <div className="rounded-xl border border-brand/30 bg-brand/10 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-brand mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-brand">Restauração concluída!</p>
                  <ul className="mt-2 space-y-0.5 text-xs text-slate-300">
                    {restoreStats.empresa_atualizada && <li>✓ Configurações da empresa atualizadas</li>}
                    {(restoreStats.categorias_inseridas + restoreStats.categorias_atualizadas) > 0 && (
                      <li>✓ Categorias: {restoreStats.categorias_inseridas} novas, {restoreStats.categorias_atualizadas} atualizadas</li>
                    )}
                    {(restoreStats.produtos_inseridos + restoreStats.produtos_atualizados) > 0 && (
                      <li>✓ Produtos: {restoreStats.produtos_inseridos} novos, {restoreStats.produtos_atualizados} atualizados</li>
                    )}
                    {(restoreStats.cupons_inseridos + restoreStats.cupons_atualizados) > 0 && (
                      <li>✓ Cupons: {restoreStats.cupons_inseridos} novos, {restoreStats.cupons_atualizados} atualizados</li>
                    )}
                    {(restoreStats.mesas_inseridas + restoreStats.mesas_atualizadas) > 0 && (
                      <li>✓ Mesas: {restoreStats.mesas_inseridas} novas, {restoreStats.mesas_atualizadas} atualizadas</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
