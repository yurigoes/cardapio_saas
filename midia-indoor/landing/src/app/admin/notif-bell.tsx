"use client";
import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

interface Notif { id: string; tipo: string; titulo: string; mensagem: string | null; link: string | null; icone: string | null; lida: boolean; created_at: string; }

export function NotifBell({ token }: { token: string }) {
  const [lista, setLista] = useState<Notif[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await aapi(token, "/api/admin/notificacoes"); const d = await r.json();
      if (d.ok) { setLista(d.notificacoes); setNaoLidas(d.nao_lidas); }
    } catch { /* silent */ }
  }

  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [token]);

  useEffect(() => {
    function fora(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); }
    if (aberto) document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  async function marcarTodas() {
    await aapi(token, "/api/admin/notificacoes", { method: "PATCH", body: JSON.stringify({ todas: true }) });
    load();
  }
  async function marcar(id: string) {
    await aapi(token, "/api/admin/notificacoes", { method: "PATCH", body: JSON.stringify({ id }) });
    load();
  }
  async function remover(id: string) {
    await aapi(token, `/api/admin/notificacoes?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto(s => !s)} className="relative rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white">
        <Bell className="h-5 w-5" />
        {naoLidas > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{naoLidas > 99 ? "99+" : naoLidas}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 z-50 mt-2 w-96 rounded-2xl border border-white/10 bg-[#12121c] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 p-3">
            <p className="text-sm font-semibold">Notificações</p>
            {naoLidas > 0 && <button onClick={marcarTodas} className="text-xs text-brand-light hover:underline">Marcar todas como lidas</button>}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {lista.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">Nenhuma notificação</p>
            ) : (
              lista.map(n => (
                <div key={n.id} className={`flex gap-3 border-b border-white/5 p-3 ${!n.lida ? "bg-brand/5" : ""}`}>
                  <span className="text-xl">{n.icone ?? "🔔"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.titulo}</p>
                    {n.mensagem && <p className="text-xs text-slate-400 truncate">{n.mensagem}</p>}
                    <p className="mt-1 text-[10px] text-slate-500">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {!n.lida && <button onClick={() => marcar(n.id)} className="text-[10px] text-brand-light hover:underline">Lida</button>}
                    <button onClick={() => remover(n.id)} className="text-[10px] text-red-300 hover:underline">×</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
