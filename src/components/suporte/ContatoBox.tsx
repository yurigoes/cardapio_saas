"use client";

/**
 * ContatoBox — bloco de contato do suporte que aparece no /painel/suporte.
 * Mostra opções de WhatsApp, Email, e link pra abrir chamado.
 */
import { MessageCircle, Mail, Phone, Calendar } from "lucide-react";

const SUPORTE = {
  whatsapp:  "5511999999999",          // troque pro número real
  whatsappLabel: "(11) 99999-9999",
  email:     "suporte@tthreedigital.com.br",
  telefone:  "(11) 4000-0000",
  agendar:   "https://calendly.com/threedigital/suporte", // troque
};

export function ContatoBox() {
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-700/5 p-5">
      <h3 className="text-sm font-bold text-white mb-1">Precisa de ajuda direta?</h3>
      <p className="text-xs text-slate-400 mb-4">
        Nosso time responde em até <strong>2 horas úteis</strong>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <a
          href={`https://wa.me/${SUPORTE.whatsapp}?text=Ol%C3%A1!%20Preciso%20de%20suporte%20no%20Card%C3%A1pio%20SaaS.`}
          target="_blank" rel="noopener"
          className="flex items-center gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 hover:bg-emerald-500/20 transition"
        >
          <MessageCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">WhatsApp</p>
            <p className="text-[10px] text-emerald-300 truncate">{SUPORTE.whatsappLabel}</p>
          </div>
        </a>

        <a
          href={`mailto:${SUPORTE.email}`}
          className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-slate-950 p-3 hover:bg-white/5 transition"
        >
          <Mail className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">E-mail</p>
            <p className="text-[10px] text-slate-400 truncate">{SUPORTE.email}</p>
          </div>
        </a>

        <a
          href={`tel:+55${SUPORTE.telefone.replace(/\D/g, "")}`}
          className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-slate-950 p-3 hover:bg-white/5 transition"
        >
          <Phone className="h-4 w-4 text-purple-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">Telefone</p>
            <p className="text-[10px] text-slate-400 truncate">{SUPORTE.telefone}</p>
          </div>
        </a>

        <a
          href={SUPORTE.agendar}
          target="_blank" rel="noopener"
          className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-slate-950 p-3 hover:bg-white/5 transition"
        >
          <Calendar className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">Agendar reunião</p>
            <p className="text-[10px] text-slate-400 truncate">Calendly · 30 min</p>
          </div>
        </a>
      </div>

      <p className="mt-4 text-[10px] text-slate-600">
        Antes de abrir um chamado, tenta achar a resposta nas seções de tutorial acima — economiza seu tempo.
      </p>
    </div>
  );
}
