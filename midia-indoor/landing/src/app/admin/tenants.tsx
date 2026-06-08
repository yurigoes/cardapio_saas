"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, X, Building2 } from "lucide-react";
import { notify } from "@/components/Notify";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Tenant { id: string; slug: string; nome: string; dominios: string[]; ativo: boolean; plano: string; preco_mensal: string; anunciantes: string; campanhas: string; locais: string; }

export function Tenants({ token }: { token: string }) {
  const [lista, setLista] = useState<Tenant[]>([]);
  const [novo, setNovo] = useState(false);
  const load = useCallback(async () => { const r = await aapi(token, "/api/admin/tenants"); const d = await r.json(); if (d.ok) setLista(d.tenants); }, [token]);
  useEffect(() => { load(); }, [load]);
  async function toggle(t: Tenant) { await aapi(token, "/api/admin/tenants", { method: "PATCH", body: JSON.stringify({ id: t.id, ativo: !t.ativo }) }); load(); }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 className="h-5 w-5" /> Tenants (operadores DOOH)</h2>
          <p className="text-xs text-slate-400">Revenda o SaaS pra outros operadores com domínio próprio + branding deles.</p>
        </div>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo tenant</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400"><tr><th className="p-3">Operador</th><th className="p-3">Slug</th><th className="p-3">Domínios</th><th className="p-3">Plano</th><th className="p-3">Mensal</th><th className="p-3">Anunc.</th><th className="p-3">Camp.</th><th className="p-3">Ativo</th></tr></thead>
          <tbody>
            {lista.map(t => (
              <tr key={t.id} className="border-t border-white/5">
                <td className="p-3 font-medium">{t.nome}</td>
                <td className="p-3 font-mono text-xs text-slate-400">{t.slug}</td>
                <td className="p-3 text-xs">{(t.dominios ?? []).join(", ")}</td>
                <td className="p-3 text-xs uppercase">{t.plano}</td>
                <td className="p-3 text-xs">{brl(Number(t.preco_mensal))}</td>
                <td className="p-3 text-xs">{t.anunciantes}</td>
                <td className="p-3 text-xs">{t.campanhas}</td>
                <td className="p-3"><button onClick={() => toggle(t)} className={`rounded px-2 py-1 text-xs ${t.ativo ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-slate-400"}`}>{t.ativo ? "Sim" : "Não"}</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">Nenhum tenant. Crie um pra começar a revender.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm">
        <p className="mb-2 font-semibold text-brand-light">Como funciona</p>
        <ol className="ml-4 list-decimal space-y-1 text-slate-300">
          <li>Cria um tenant com <strong>slug</strong> único (ex: <code>atacadao-xyz</code>) e <strong>domínios</strong> que apontam pra ele (ex: <code>media.atacadaoxy.com.br</code>).</li>
          <li>Configura DNS do cliente: CNAME do domínio dele → seu domínio principal.</li>
          <li>Cloudflare Tunnel já passa todo host pra mesma app — middleware detecta o tenant pelo header Host.</li>
          <li>Branding (logo/cor/nome) por tenant — cada um vê o SaaS com a cara dele.</li>
          <li>Cobrança mensal: campo <code>preco_mensal</code> + <code>mp_assinatura_id</code> (configure no Mercado Pago).</li>
        </ol>
      </div>

      {novo && <NovoTenantModal token={token} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}

function NovoTenantModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [slug, setSlug] = useState(""); const [nome, setNome] = useState(""); const [dominios, setDominios] = useState("");
  const [plano, setPlano] = useState<"basico" | "pro" | "enterprise">("pro");
  const [preco, setPreco] = useState("99");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/tenants", { method: "POST", body: JSON.stringify({ slug, nome, dominios: dominios.split(",").map(s => s.trim()).filter(Boolean), plano, preco_mensal: Number(preco) }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12121c] p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Novo tenant (operador)</h3><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        <label className="mb-1 block text-sm">Slug (URL-friendly)</label>
        <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="atacadao-xyz" className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
        <label className="mb-1 block text-sm">Nome do operador</label>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Atacadão XYZ" className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
        <label className="mb-1 block text-sm">Domínios (separados por vírgula)</label>
        <input value={dominios} onChange={e => setDominios(e.target.value)} placeholder="media.atacadaoxy.com.br, painel.atacadaoxy.com.br" className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm">Plano</label>
            <select value={plano} onChange={e => setPlano(e.target.value as typeof plano)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
              <option value="basico">Básico</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Preço mensal (R$)</label>
            <input type="number" value={preco} onChange={e => setPreco(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
          </div>
        </div>
        {err && <p className="my-3 text-sm text-red-400">{err}</p>}
        <button onClick={salvar} disabled={busy || !slug || !nome || !dominios} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar tenant
        </button>
      </div>
    </div>
  );
}
