"use client";

/**
 * WizardOnboardingModal — modal multi-step que aparece automaticamente para
 * empresas novas (sem produtos). Faz dados básicos + 1ª categoria + 1º produto
 * tudo inline, sem fragmentar o fluxo navegando entre páginas.
 *
 * Trigger: aparece quando GET /api/painel/onboarding/status retorna
 *          produtos.done === false E o usuário não deu dismiss nas últimas 30 dias.
 *
 * Botão "Pular" salva flag em localStorage por 30 dias.
 * Botão "Abrir wizard" sempre disponível via prop.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Sparkles, X, ChevronRight, Check, ArrowLeft,
  Building2, FolderOpen, Package, PartyPopper, Loader2,
  Clock, QrCode, MapPin, SkipForward,
} from "lucide-react";
import { alertar } from "@/components/ui/ConfirmModal";

const DISMISS_KEY = "wizard_onboarding_dismissed_at";
const DISMISS_DAYS = 30;

interface OnboardingStatus {
  total: number;
  completos: number;
  steps: { id: string; done: boolean }[];
}

interface FormDados {
  nome_fantasia: string;
  whatsapp:      string;
  cor_primaria:  string;
}

interface FormCategoria {
  nome: string;
}

interface FormProduto {
  nome:   string;
  preco:  string;
  categoria_id: string;
}

interface FormHorario {
  abertura:  string;     // HH:MM
  fechamento: string;
}

interface FormPix {
  pix_chave:  string;
  pix_tipo:   "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | "";
}

interface FormMesa {
  numero:     string;
  capacidade: string;
}

type Step = "welcome" | "dados" | "horario" | "categoria" | "produto" | "pix" | "mesa" | "conclusao";

const STEPS_ORDER: Step[] = [
  "welcome", "dados", "horario", "categoria", "produto", "pix", "mesa", "conclusao",
];

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader(): HeadersInit {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

export function WizardOnboardingModal({ openOverride, onClose }: {
  /** Se passado, força o modal aberto/fechado (botão manual). */
  openOverride?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen]       = useState(false);
  const [step, setStep]       = useState<Step>("welcome");
  const [busy, setBusy]       = useState(false);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);

  const [dados, setDados] = useState<FormDados>({
    nome_fantasia: "", whatsapp: "", cor_primaria: "#10b981",
  });
  const [categoria, setCategoria] = useState<FormCategoria>({ nome: "" });
  const [produto, setProduto]     = useState<FormProduto>({
    nome: "", preco: "", categoria_id: "",
  });
  const [horario, setHorario] = useState<FormHorario>({ abertura: "11:00", fechamento: "23:00" });
  const [pix, setPix]         = useState<FormPix>({ pix_chave: "", pix_tipo: "" });
  const [mesa, setMesa]       = useState<FormMesa>({ numero: "1", capacidade: "4" });

  // ── Auto-trigger: empresa sem produtos + não dismissed ─────────────────────
  useEffect(() => {
    if (openOverride !== undefined) {
      setOpen(openOverride);
      if (openOverride) setStep("welcome");
      return;
    }

    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    const dismissedRecente = at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    if (dismissedRecente) return;

    const t = getToken();
    if (!t) return;

    fetch("/api/painel/onboarding/status", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then((d: { success: boolean; data?: OnboardingStatus }) => {
        if (!d.success || !d.data) return;
        const stepProdutos = d.data.steps.find(s => s.id === "produtos");
        if (stepProdutos && !stepProdutos.done) {
          // Pré-popula com dados que já existem
          fetch("/api/painel/config", { headers: { Authorization: `Bearer ${t}` } })
            .then(r => r.json())
            .then((e: { success: boolean; data?: { nome_fantasia?: string; whatsapp?: string; cor_primaria?: string } }) => {
              if (e.success && e.data) {
                setDados({
                  nome_fantasia: e.data.nome_fantasia ?? "",
                  whatsapp:      e.data.whatsapp ?? "",
                  cor_primaria:  e.data.cor_primaria ?? "#10b981",
                });
              }
              setOpen(true);
              setStep("welcome");
            })
            .catch(() => { setOpen(true); setStep("welcome"); });
        }
      })
      .catch(() => {});
  }, [openOverride]);

  function fechar(skip = false) {
    if (skip) {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setOpen(false);
    onClose?.();
  }

  const stepIdx = STEPS_ORDER.indexOf(step);

  function next() {
    const proximo = STEPS_ORDER[stepIdx + 1];
    if (proximo) setStep(proximo);
  }
  function prev() {
    const anterior = STEPS_ORDER[stepIdx - 1];
    if (anterior) setStep(anterior);
  }

  // ── Handlers de cada step ──────────────────────────────────────────────────

  const salvarDados = useCallback(async () => {
    if (!dados.nome_fantasia.trim()) {
      await alertar({ titulo: "Nome obrigatório", mensagem: "Informe o nome fantasia da empresa.", tipo: "alerta" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/painel/config", {
        method: "PATCH", headers: authHeader(),
        body: JSON.stringify({
          nome_fantasia: dados.nome_fantasia.trim(),
          whatsapp:      dados.whatsapp.trim() || null,
          cor_primaria:  dados.cor_primaria,
        }),
      });
      const d = await r.json();
      if (d.success) next();
      else await alertar({ titulo: "Falha ao salvar", mensagem: d.error?.message ?? "", tipo: "perigo" });
    } finally { setBusy(false); }
  }, [dados]);

  const salvarCategoria = useCallback(async () => {
    if (!categoria.nome.trim()) {
      await alertar({ titulo: "Nome obrigatório", mensagem: "Dê um nome pra primeira categoria (ex: Lanches, Bebidas).", tipo: "alerta" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/painel/categorias", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ nome: categoria.nome.trim(), ativo: true }),
      });
      const d = await r.json();
      if (d.success && d.data?.id) {
        setCategoriaId(d.data.id);
        setProduto(p => ({ ...p, categoria_id: d.data.id }));
        next();
      } else {
        await alertar({ titulo: "Falha ao criar categoria", mensagem: d.error?.message ?? "", tipo: "perigo" });
      }
    } finally { setBusy(false); }
  }, [categoria]);

  const salvarProduto = useCallback(async () => {
    if (!produto.nome.trim()) {
      await alertar({ titulo: "Nome obrigatório", tipo: "alerta" }); return;
    }
    const precoNum = parseFloat(produto.preco.replace(",", "."));
    if (!Number.isFinite(precoNum) || precoNum < 0) {
      await alertar({ titulo: "Preço inválido", mensagem: "Use números (ex: 19.90).", tipo: "alerta" });
      return;
    }
    if (!produto.categoria_id) {
      await alertar({ titulo: "Categoria obrigatória", tipo: "alerta" }); return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/painel/produtos", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({
          nome:         produto.nome.trim(),
          preco:        precoNum,
          categoria_id: produto.categoria_id,
          disponivel:   true,
        }),
      });
      const d = await r.json();
      if (d.success) next();
      else await alertar({ titulo: "Falha ao criar produto", mensagem: d.error?.message ?? "", tipo: "perigo" });
    } finally { setBusy(false); }
  }, [produto]);

  // Horário (PATCH config)
  const salvarHorario = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/painel/config", {
        method: "PATCH", headers: authHeader(),
        body: JSON.stringify({
          horario_abertura:   horario.abertura || null,
          horario_fechamento: horario.fechamento || null,
        }),
      });
      const d = await r.json();
      if (d.success) next();
      else await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
    } finally { setBusy(false); }
  }, [horario]);

  // PIX (PATCH config — pix_chave + pix_tipo são campos diretos da empresa)
  const salvarPix = useCallback(async () => {
    if (!pix.pix_chave.trim()) { next(); return; } // opcional
    if (!pix.pix_tipo) {
      await alertar({ titulo: "Tipo PIX obrigatório", mensagem: "Escolha CPF/CNPJ/email/telefone/aleatória", tipo: "alerta" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/painel/config", {
        method: "PATCH", headers: authHeader(),
        body: JSON.stringify({
          pix_chave: pix.pix_chave.trim(),
          pix_tipo:  pix.pix_tipo,
        }),
      });
      const d = await r.json();
      if (d.success) next();
      else await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "", tipo: "perigo" });
    } finally { setBusy(false); }
  }, [pix]);

  // Mesa (POST mesas)
  const salvarMesa = useCallback(async () => {
    if (!mesa.numero.trim()) { next(); return; } // opcional
    const numeroNum = parseInt(mesa.numero, 10);
    const capNum    = parseInt(mesa.capacidade, 10);
    if (!Number.isFinite(numeroNum) || numeroNum < 1) {
      await alertar({ titulo: "Número inválido", mensagem: "Use um número inteiro >= 1", tipo: "alerta" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/painel/mesas", {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({
          numero:     numeroNum,
          capacidade: Number.isFinite(capNum) ? capNum : 4,
          ativa:      true,
        }),
      });
      const d = await r.json();
      if (d.success) next();
      else await alertar({ titulo: "Falha ao criar mesa", mensagem: d.error?.message ?? "", tipo: "perigo" });
    } finally { setBusy(false); }
  }, [mesa]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
         onClick={() => fechar(false)}>
      <div className="w-full max-w-lg rounded-2xl border border-emerald-500/30 bg-slate-900 shadow-2xl my-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">
              Configuração rápida
            </h2>
          </div>
          <button onClick={() => fechar(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
            title="Fechar (volta no próximo login)">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-3">
          <div className="flex items-center gap-1">
            {STEPS_ORDER.map((s, i) => (
              <div key={s}
                className={`h-1 flex-1 rounded-full transition-all ${
                  i <= stepIdx ? "bg-emerald-500" : "bg-white/10"
                }`} />
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            Passo {stepIdx + 1} de {STEPS_ORDER.length}
          </p>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {step === "welcome" && (
            <div className="space-y-3 text-center py-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                <Sparkles className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Bem-vindo!</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Vamos configurar sua empresa em <strong className="text-white">menos de 5 minutos</strong>.
                Pode pular qualquer passo e voltar depois.
              </p>
              <ul className="text-left text-xs text-slate-400 space-y-1 max-w-xs mx-auto pt-2">
                <li className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-emerald-400" /> Dados da empresa</li>
                <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-emerald-400" /> Horário de funcionamento</li>
                <li className="flex items-center gap-2"><FolderOpen className="h-3.5 w-3.5 text-emerald-400" /> Primeira categoria</li>
                <li className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-emerald-400" /> Primeiro produto</li>
                <li className="flex items-center gap-2"><QrCode className="h-3.5 w-3.5 text-emerald-400" /> Chave PIX (opcional)</li>
                <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-emerald-400" /> Primeira mesa (opcional)</li>
              </ul>
            </div>
          )}

          {step === "horario" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Clock className="h-5 w-5" />
                <h3 className="font-bold text-white">Horário de funcionamento</h3>
              </div>
              <p className="text-xs text-slate-400">
                Quando o restaurante atende. Cardápio público mostra &quot;fechado&quot; fora desse horário.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-400 mb-1 block">Abertura *</span>
                  <input type="time" value={horario.abertura}
                    onChange={e => setHorario({ ...horario, abertura: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400 mb-1 block">Fechamento *</span>
                  <input type="time" value={horario.fechamento}
                    onChange={e => setHorario({ ...horario, fechamento: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
                </label>
              </div>
              <p className="text-[10px] text-slate-500">
                Ajuste dias e múltiplos turnos depois em <strong>Configurações</strong>.
              </p>
            </div>
          )}

          {step === "pix" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <QrCode className="h-5 w-5" />
                <h3 className="font-bold text-white">Chave PIX (opcional)</h3>
              </div>
              <p className="text-xs text-slate-400">
                PIX direto pra cliente pagar. Você também pode configurar
                gateways completos (Mercado Pago, etc) depois em <strong>Gateways</strong>.
              </p>
              <label className="block">
                <span className="text-xs font-medium text-slate-400 mb-1 block">Tipo da chave</span>
                <select value={pix.pix_tipo}
                  onChange={e => setPix({ ...pix, pix_tipo: e.target.value as FormPix["pix_tipo"] })}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
                  <option value="">— escolha —</option>
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Aleatória</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-400 mb-1 block">Chave PIX</span>
                <input type="text" value={pix.pix_chave}
                  onChange={e => setPix({ ...pix, pix_chave: e.target.value })}
                  placeholder="Ex: 11999999999, contato@empresa.com, CNPJ..."
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
              </label>
              <p className="text-[10px] text-slate-500">
                Vazio = pular este passo. Cliente verá só os outros métodos disponíveis.
              </p>
            </div>
          )}

          {step === "mesa" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <MapPin className="h-5 w-5" />
                <h3 className="font-bold text-white">Primeira mesa (opcional)</h3>
              </div>
              <p className="text-xs text-slate-400">
                Cadastra mesa #1 já com QR code pronto pra colar.
                Adicione mais em <strong>Mesas</strong>.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-400 mb-1 block">Número da mesa</span>
                  <input type="number" min="1" value={mesa.numero}
                    onChange={e => setMesa({ ...mesa, numero: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400 mb-1 block">Capacidade</span>
                  <input type="number" min="1" value={mesa.capacidade}
                    onChange={e => setMesa({ ...mesa, capacidade: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
                </label>
              </div>
              <p className="text-[10px] text-slate-500">
                Pra delivery only ou totem, deixe número vazio (pula).
              </p>
            </div>
          )}

          {step === "dados" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Building2 className="h-5 w-5" />
                <h3 className="font-bold text-white">Dados básicos</h3>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-400 mb-1 block">
                  Nome fantasia <span className="text-red-400">*</span>
                </span>
                <input type="text" value={dados.nome_fantasia}
                  onChange={e => setDados({ ...dados, nome_fantasia: e.target.value })}
                  placeholder="Ex: Restaurante do João"
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-400 mb-1 block">
                  WhatsApp (com DDD)
                </span>
                <input type="text" value={dados.whatsapp}
                  onChange={e => setDados({ ...dados, whatsapp: e.target.value })}
                  placeholder="11999999999"
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-400 mb-1 block">
                  Cor da marca
                </span>
                <div className="flex items-center gap-2">
                  <input type="color" value={dados.cor_primaria}
                    onChange={e => setDados({ ...dados, cor_primaria: e.target.value })}
                    className="h-10 w-16 rounded-lg border border-white/10 bg-slate-800 cursor-pointer" />
                  <input type="text" value={dados.cor_primaria}
                    onChange={e => setDados({ ...dados, cor_primaria: e.target.value })}
                    className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm font-mono text-white" />
                </div>
              </label>
            </div>
          )}

          {step === "categoria" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <FolderOpen className="h-5 w-5" />
                <h3 className="font-bold text-white">Primeira categoria</h3>
              </div>
              <p className="text-xs text-slate-400">
                Categorias agrupam os produtos no cardápio. Você pode criar quantas quiser depois.
              </p>
              <label className="block">
                <span className="text-xs font-medium text-slate-400 mb-1 block">
                  Nome da categoria <span className="text-red-400">*</span>
                </span>
                <input type="text" value={categoria.nome}
                  onChange={e => setCategoria({ nome: e.target.value })}
                  placeholder="Ex: Lanches, Bebidas, Sobremesas"
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {["Lanches", "Bebidas", "Sobremesas", "Pratos", "Pizzas"].map(s => (
                  <button key={s} type="button"
                    onClick={() => setCategoria({ nome: s })}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "produto" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Package className="h-5 w-5" />
                <h3 className="font-bold text-white">Primeiro produto</h3>
              </div>
              <p className="text-xs text-slate-400">
                Em <strong className="text-white">{categoria.nome}</strong>. Você adiciona foto e detalhes depois no Cardápio.
              </p>
              <label className="block">
                <span className="text-xs font-medium text-slate-400 mb-1 block">
                  Nome do produto <span className="text-red-400">*</span>
                </span>
                <input type="text" value={produto.nome}
                  onChange={e => setProduto({ ...produto, nome: e.target.value })}
                  placeholder="Ex: X-Burger Especial"
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-400 mb-1 block">
                  Preço (R$) <span className="text-red-400">*</span>
                </span>
                <input type="text" inputMode="decimal" value={produto.preco}
                  onChange={e => setProduto({ ...produto, preco: e.target.value })}
                  placeholder="19.90"
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
              </label>
            </div>
          )}

          {step === "conclusao" && (
            <div className="space-y-4 text-center py-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                <PartyPopper className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Tudo pronto!</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Sua empresa já tem dados básicos, uma categoria e o primeiro produto.
                Próximos passos sugeridos:
              </p>
              <ul className="text-left text-xs text-slate-300 space-y-2 max-w-xs mx-auto pt-2">
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Adicionar fotos aos produtos em <strong>Cardápio</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Configurar pagamento (PIX ou gateway) em <strong>Gateways</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Cadastrar mesas (com QR) em <strong>Mesas</strong></span>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/5 p-4 gap-2">
          {step !== "welcome" && step !== "conclusao" && (
            <button onClick={prev} disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-40">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </button>
          )}

          <button onClick={() => fechar(true)}
            className="text-xs text-slate-500 hover:text-white mr-auto ml-2">
            Pular wizard
          </button>

          {step === "welcome" && (
            <button onClick={next}
              className="flex items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white">
              Começar <ChevronRight className="h-4 w-4" />
            </button>
          )}
          {step === "dados" && (
            <button onClick={salvarDados} disabled={busy}
              className="flex items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              Continuar
            </button>
          )}
          {step === "horario" && (
            <>
              <button onClick={next}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5">
                <SkipForward className="h-3.5 w-3.5" /> Pular
              </button>
              <button onClick={salvarHorario} disabled={busy}
                className="flex items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Salvar
              </button>
            </>
          )}
          {step === "categoria" && (
            <button onClick={salvarCategoria} disabled={busy}
              className="flex items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              Criar e continuar
            </button>
          )}
          {step === "produto" && (
            <button onClick={salvarProduto} disabled={busy}
              className="flex items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              Criar produto
            </button>
          )}
          {step === "pix" && (
            <>
              <button onClick={next}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5">
                <SkipForward className="h-3.5 w-3.5" /> Pular
              </button>
              <button onClick={salvarPix} disabled={busy}
                className="flex items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Salvar PIX
              </button>
            </>
          )}
          {step === "mesa" && (
            <>
              <button onClick={next}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5">
                <SkipForward className="h-3.5 w-3.5" /> Pular
              </button>
              <button onClick={salvarMesa} disabled={busy}
                className="flex items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Criar mesa
              </button>
            </>
          )}
          {step === "conclusao" && (
            <button onClick={() => fechar(true)}
              className="flex items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-sm font-bold text-white">
              <Check className="h-4 w-4" /> Concluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
