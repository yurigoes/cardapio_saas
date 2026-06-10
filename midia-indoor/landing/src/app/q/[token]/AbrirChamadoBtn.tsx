"use client";
import { useState } from "react";

export function AbrirChamadoBtn({ token, itemNome }: { token: string; itemNome: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<"problema" | "manutencao" | "instalacao" | "outro">("problema");
  const [descricao, setDescricao] = useState("");
  const [autorNome, setAutorNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [feito, setFeito] = useState<{ osId?: string; emGarantia?: boolean } | null>(null);
  const [erro, setErro] = useState("");

  async function enviar() {
    if (descricao.trim().length < 10) { setErro("Descreva o problema com pelo menos 10 caracteres."); return; }
    setBusy(true); setErro("");
    try {
      const r = await fetch(`/api/publico/inventario/${token}/abrir-os`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo, descricao: descricao.trim(), autor_nome: autorNome.trim() }),
      });
      const d = await r.json();
      if (!d.ok) { setErro(d.error || "Erro ao abrir chamado"); setBusy(false); return; }
      setFeito({ osId: d.osId, emGarantia: d.emGarantia }); setBusy(false);
    } catch (e) { setErro((e as Error).message); setBusy(false); }
  }

  if (feito) {
    return (
      <div style={{ marginTop: 24, padding: 16, borderRadius: 10, background: "#dcfce7", border: "1px solid #86efac", color: "#166534" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>✓ Chamado aberto!</p>
        <p style={{ margin: "6px 0 0", fontSize: 13 }}>Protocolo: <code>{feito.osId?.slice(0, 8)}</code></p>
        {feito.emGarantia && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#2563eb" }}>🛡 Equipamento em garantia</p>}
        <p style={{ margin: "8px 0 0", fontSize: 12 }}>A equipe técnica foi notificada por e-mail.</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      {!aberto ? (
        <button onClick={() => setAberto(true)}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          🚨 Abrir chamado técnico
        </button>
      ) : (
        <div style={{ padding: 16, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#991b1b" }}>Reportar problema · {itemNome}</p>

          <label style={{ display: "block", marginTop: 12, fontSize: 12, color: "#666" }}>Tipo</label>
          <select value={motivo} onChange={e => setMotivo(e.target.value as typeof motivo)}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}>
            <option value="problema">🔴 Problema (não funciona / queimou)</option>
            <option value="manutencao">🟡 Manutenção (limpeza, ajuste)</option>
            <option value="instalacao">🔧 Instalação (dúvida na montagem)</option>
            <option value="outro">📎 Outro</option>
          </select>

          <label style={{ display: "block", marginTop: 12, fontSize: 12, color: "#666" }}>Seu nome (opcional)</label>
          <input value={autorNome} onChange={e => setAutorNome(e.target.value)} placeholder="ex: João da equipe"
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }} />

          <label style={{ display: "block", marginTop: 12, fontSize: 12, color: "#666" }}>O que está acontecendo? *</label>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={4} placeholder="Ex: a tela ficou preta, não liga. Já tentei tirar e colocar a fonte. LED do box está apagado."
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />

          {erro && <p style={{ margin: "8px 0 0", color: "#dc2626", fontSize: 13 }}>{erro}</p>}

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={enviar} disabled={busy}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
              {busy ? "Enviando…" : "Enviar chamado"}
            </button>
            <button onClick={() => setAberto(false)}
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", color: "#333", cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
