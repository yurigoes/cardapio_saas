"use client";

/**
 * Lista discos físicos da VPS, marca quais estão em uso e quais são
 * candidatos a serem adicionados como HD novo.
 *
 * Pra disco novo, oferece formatação ext4 + mount em /mnt/cardapio-data,
 * com proteção: usuário tem que digitar o caminho do disco pra confirmar.
 */
import { useEffect, useState, useCallback } from "react";
import { HardDrive, AlertTriangle, Plus, Loader2, Check } from "lucide-react";

interface Disco {
  nome: string;
  tamanho_gb: number;
  modelo: string | null;
  serial: string | null;
  tem_particao: boolean;
  tem_filesystem: boolean;
  montado: boolean;
  candidato_novo: boolean;
  particoes: Array<{
    nome: string;
    tamanho_gb: number;
    fstype: string | null;
    mountpoint: string | null;
    label: string | null;
  }>;
}

interface Props {
  agentOnline: boolean;
  exec: (comando: string, params?: Record<string, unknown>) => Promise<unknown>;
}

export function DiscosDetectados({ agentOnline, exec }: Props) {
  const [discos, setDiscos] = useState<Disco[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro]       = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [formatando, setFormatando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!agentOnline) return;
    setLoading(true);
    setErro(null);
    try {
      const r = await exec("discos_resumo");
      if (Array.isArray(r)) setDiscos(r as Disco[]);
      else if (r && typeof r === "object" && "erro" in r) setErro(String((r as { erro: string }).erro));
    } finally { setLoading(false); }
  }, [agentOnline, exec]);

  useEffect(() => { carregar(); }, [carregar]);

  async function formatar(disco: Disco) {
    if (confirmacao !== disco.nome) {
      alert(`Digite EXATAMENTE: ${disco.nome}`);
      return;
    }
    if (!confirm(`Última confirmação:\n\nVai APAGAR todos os dados de ${disco.nome} (${disco.tamanho_gb} GB).\nFormatar como ext4 e montar em /mnt/cardapio-data.\n\nProsseguir?`)) return;

    setFormatando(true);
    setResultado(null);
    try {
      const r = await exec("formatar_e_montar_disco", {
        disco: disco.nome,
        confirmar_apagar_dados: true,
      });
      if (r && typeof r === "object" && "ok" in r) {
        const data = r as { ok: boolean; particao?: string; uuid?: string; mountpoint?: string; erro?: string };
        setResultado(data.ok
          ? { ok: true,  texto: `✓ Formatado com sucesso!\nPartição: ${data.particao}\nMontado em: ${data.mountpoint}\nUUID: ${data.uuid}\n\n(persistente — adicionado em /etc/fstab)` }
          : { ok: false, texto: `✗ ${data.erro ?? "Falha desconhecida"}` }
        );
        if (data.ok) {
          setShowFormat(null);
          setConfirmacao("");
          carregar();
        }
      }
    } finally { setFormatando(false); }
  }

  if (!agentOnline) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
          <HardDrive className="h-4 w-4" /> Discos físicos detectados
        </h2>
        <button onClick={carregar} disabled={loading}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5">
          {loading ? "..." : "Detectar"}
        </button>
      </div>

      {erro && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
          {erro}
        </div>
      )}

      {discos.length === 0 && !loading && !erro && (
        <p className="text-sm text-slate-500">Nenhum disco físico encontrado.</p>
      )}

      {discos.map(d => (
        <div key={d.nome}
          className={`rounded-xl border p-4 ${
            d.candidato_novo
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-white/10 bg-slate-900/30"
          }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <HardDrive className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                d.candidato_novo ? "text-emerald-400" : "text-slate-400"
              }`} />
              <div className="min-w-0">
                <p className="font-bold text-white">
                  {d.nome} <span className="text-sm font-normal text-slate-400">· {d.tamanho_gb} GB</span>
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {d.modelo || "(sem modelo)"} {d.serial && `· ${d.serial.slice(0, 12)}`}
                </p>
                {d.particoes.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {d.particoes.map(p => (
                      <div key={p.nome} className="text-xs text-slate-400">
                        ↳ <code className="text-slate-300">{p.nome}</code> · {p.tamanho_gb} GB
                        {p.fstype && <span> · {p.fstype}</span>}
                        {p.mountpoint && <span className="text-emerald-400"> → {p.mountpoint}</span>}
                        {p.label && <span> [{p.label}]</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {d.montado && (
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">EM USO</span>
              )}
              {!d.montado && d.tem_filesystem && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">FS NÃO MONTADO</span>
              )}
              {d.candidato_novo && (
                <button onClick={() => { setShowFormat(d.nome); setResultado(null); }}
                  className="flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-bold text-white">
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              )}
            </div>
          </div>

          {showFormat === d.nome && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-4 space-y-3">
              <div className="flex items-start gap-2 text-sm text-red-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Operação destrutiva</p>
                  <p className="text-xs mt-1">
                    Vai apagar todos os dados de <code>{d.nome}</code> ({d.tamanho_gb} GB),
                    formatar como ext4 e montar em <code>/mnt/cardapio-data</code>.
                    Adiciona em /etc/fstab pra persistir no boot.
                  </p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Pra confirmar, digite o caminho do disco:
                </label>
                <input type="text" value={confirmacao} onChange={e => setConfirmacao(e.target.value)}
                  placeholder={d.nome}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white font-mono" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => formatar(d)} disabled={formatando || confirmacao !== d.nome}
                  className="rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-40 px-3 py-1.5 text-sm font-bold text-white flex items-center gap-2">
                  {formatando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {formatando ? "Formatando..." : "Confirmar e formatar"}
                </button>
                <button onClick={() => { setShowFormat(null); setConfirmacao(""); }}
                  className="rounded-lg border border-white/10 hover:bg-white/5 px-3 py-1.5 text-sm text-slate-300">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {showFormat === d.nome && resultado && (
            <div className={`mt-3 rounded-lg p-3 text-sm ${
              resultado.ok ? "bg-emerald-500/10 text-emerald-200 border border-emerald-500/30"
                           : "bg-red-500/10 text-red-200 border border-red-500/30"
            }`}>
              {resultado.ok && <Check className="inline h-4 w-4 mr-1" />}
              <pre className="whitespace-pre-wrap text-xs">{resultado.texto}</pre>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
