/**
 * /q/[token] — página pública aberta ao escanear QR do equipamento
 * Mostra dados básicos pra técnico/instalador identificar o item.
 * Inclui botão "Abrir chamado" pra reportar problema na hora.
 */
import { db, ensureSchema } from "@/lib/db";
import { AbrirChamadoBtn } from "./AbrirChamadoBtn";

interface Props { params: { token: string } }

async function buscar(token: string) {
  try {
    await ensureSchema();
    const r = await db().query(
      `SELECT i.*, l.nome AS local_nome, l.cidade AS local_cidade,
              v.nome AS vinculado_nome, v.tipo AS vinculado_tipo, v.qr_token AS vinculado_qr,
              (SELECT COUNT(*)::int FROM midia_inventario_os os WHERE os.inventario_id = i.id AND os.status IN ('aberto','em_analise')) AS os_abertas
         FROM midia_inventario i
         LEFT JOIN midia_locais l ON l.id = i.local_id
         LEFT JOIN midia_inventario v ON v.id = i.vinculado_a_id
        WHERE i.qr_token = $1 LIMIT 1`,
      [token.toUpperCase()]
    );
    return r.rows[0] ?? null;
  } catch { return null; }
}

export default async function QrPage({ params }: Props) {
  const item = await buscar(params.token);
  if (!item) {
    return (
      <div style={{ fontFamily: "system-ui", padding: 40, textAlign: "center", color: "#666" }}>
        <h1>QR não encontrado</h1>
        <p>Esse equipamento não está cadastrado no inventário.</p>
      </div>
    );
  }
  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 500, margin: "auto", padding: 24, color: "#1a1a2e" }}>
      <div style={{ borderBottom: "3px solid #7c3aed", paddingBottom: 12, marginBottom: 20 }}>
        <p style={{ fontSize: 11, color: "#888", letterSpacing: 1 }}>INVENTÁRIO · THREE DIGITAL</p>
        <h1 style={{ margin: "5px 0 0", color: "#7c3aed" }}>{item.nome}</h1>
        <p style={{ color: "#666", fontSize: 14 }}>{item.tipo?.toUpperCase()} · ID: {item.qr_token}</p>
      </div>

      {item.status_item && item.status_item !== "ativo" && item.status_item !== "em_estoque" && (
        <div style={{ marginBottom: 16, padding: 10, borderRadius: 8, background: item.status_item === "queimado" ? "#fee2e2" : "#fef3c7", border: `1px solid ${item.status_item === "queimado" ? "#fca5a5" : "#fcd34d"}` }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: item.status_item === "queimado" ? "#991b1b" : "#92400e" }}>
            Status: {item.status_item.toUpperCase().replace("_", " ")}
          </p>
        </div>
      )}
      {item.os_abertas > 0 && (
        <div style={{ marginBottom: 16, padding: 10, borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", fontSize: 13 }}>
          ⚠ Já tem <strong>{item.os_abertas}</strong> chamado(s) aberto(s) pra este item.
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {item.local_nome && <Linha label="Local" v={`${item.local_nome}${item.local_cidade ? " · " + item.local_cidade : ""}`} />}
        {item.vinculado_nome && <Linha label={`Vinculado a (${item.vinculado_tipo})`} v={item.vinculado_nome} />}
        {item.fabricante && <Linha label="Fabricante" v={item.fabricante} />}
        {item.modelo && <Linha label="Modelo" v={item.modelo} />}
        {item.mac && <Linha label="MAC" v={item.mac} mono />}
        {item.serial && <Linha label="Serial" v={item.serial} mono />}
        {item.ip_local && <Linha label="Último IP visto" v={item.ip_local} mono />}
        {item.xibo_display_id && <Linha label="Display Xibo" v={`#${item.xibo_display_id}`} />}
        {item.nota_fiscal && <Linha label="Nota fiscal" v={item.nota_fiscal} />}
        {item.comprado_em && <Linha label="Comprado em" v={new Date(item.comprado_em).toLocaleDateString("pt-BR")} />}
        {item.garantia_ate && <Linha label="Garantia até" v={new Date(item.garantia_ate).toLocaleDateString("pt-BR")} />}
        {item.observacao && <Linha label="Obs" v={item.observacao} />}
      </div>

      <AbrirChamadoBtn token={item.qr_token} itemNome={item.nome} />

      <p style={{ marginTop: 30, paddingTop: 15, borderTop: "1px solid #ddd", color: "#999", fontSize: 11, textAlign: "center" }}>
        Three Digital · suporte técnico
      </p>
    </div>
  );
}

function Linha({ label, v, mono }: { label: string; v: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "#888", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 14, margin: "2px 0 0", fontFamily: mono ? "monospace" : "inherit", color: "#1a1a2e" }}>{v}</p>
    </div>
  );
}
