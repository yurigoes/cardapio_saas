"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type Lang = "pt" | "en";

type ClienteInfo = {
  nome: string;
  telefone: string;
  cpf?: string;
};

type Props = {
  open: boolean;
  empresaId: number;
  empresa?: any;
  lang: Lang;
  primaryColor: string;
  onConfirm: (data: ClienteInfo) => void;
};

const copy = {
  pt: {
    title: "Identificação",
    subtitle: "Escolha como deseja se identificar.",
    telefone: "Telefone",
    cpf: "CPF",
    buscarTelefone: "Digite seu telefone",
    buscarCpf: "Digite seu CPF",
    buscar: "Buscar cadastro",
    buscando: "Buscando...",
    naoInformar: "Não inserir meus dados",
    cadastroTitulo: "Cadastro rápido",
    cadastroTexto: "Não encontramos seu cadastro. Preencha seus dados para continuar.",
    nome: "Nome",
    continuar: "Continuar pedido",
    welcome: "Cadastro encontrado",
    usarCadastro: "Usar este cadastro",
    trocar: "Trocar identificação",
    lgpd: "Ao informar seus dados, você concorda com o tratamento conforme nossos termos de uso, política de privacidade e LGPD."
  },
  en: {
    title: "Identification",
    subtitle: "Choose how you want to identify yourself.",
    telefone: "Phone",
    cpf: "Document",
    buscarTelefone: "Enter your phone",
    buscarCpf: "Enter your document",
    buscar: "Search customer",
    buscando: "Searching...",
    naoInformar: "Skip my data",
    cadastroTitulo: "Quick registration",
    cadastroTexto: "We did not find your registration. Fill in your details to continue.",
    nome: "Name",
    continuar: "Continue order",
    welcome: "Customer found",
    usarCadastro: "Use this registration",
    trocar: "Change identification",
    lgpd: "By entering your information, you agree to processing under our terms of service, privacy policy and data protection rules."
  }
};

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function getCountryInfo(raw: string) {
  const digits = onlyDigits(raw);

  if (digits.startsWith("1") && digits.length > 11) return { flag: "🇺🇸", code: "1" };
  if (digits.startsWith("351")) return { flag: "🇵🇹", code: "351" };
  if (digits.startsWith("34")) return { flag: "🇪🇸", code: "34" };
  if (digits.startsWith("55") || digits.length <= 11) return { flag: "🇧🇷", code: "55" };

  return { flag: "🌎", code: "" };
}

function normalizePhone(raw: string) {
  const digits = onlyDigits(raw);

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function formatPhone(raw: string) {
  const digits = onlyDigits(raw);

  if (digits.length <= 11) {
    if (digits.length <= 2) return digits ? `(${digits}` : "";
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  return `+${digits}`;
}

function formatCpf(raw: string) {
  const digits = onlyDigits(raw).slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function CustomerModal({
  open,
  empresaId,
  lang,
  primaryColor,
  onConfirm
}: Props) {
  const [tipo, setTipo] = useState<"telefone" | "cpf">("telefone");
  const [identificador, setIdentificador] = useState("");
  const [nomeCadastro, setNomeCadastro] = useState("");
  const [telefoneCadastro, setTelefoneCadastro] = useState("");
  const [cpfCadastro, setCpfCadastro] = useState("");
  const [clienteEncontrado, setClienteEncontrado] = useState<any>(null);
  const [modoCadastro, setModoCadastro] = useState(false);
  const [checking, setChecking] = useState(false);
  const [erro, setErro] = useState("");

  const text = copy[lang];
  const country = getCountryInfo(identificador);

  useEffect(() => {
    if (!open) {
      setTipo("telefone");
      setIdentificador("");
      setNomeCadastro("");
      setTelefoneCadastro("");
      setCpfCadastro("");
      setClienteEncontrado(null);
      setModoCadastro(false);
      setChecking(false);
      setErro("");
    }
  }, [open]);

  if (!open) return null;

  function valorNormalizado() {
    return tipo === "telefone" ? normalizePhone(identificador) : onlyDigits(identificador);
  }

  function valido() {
    const value = valorNormalizado();
    return tipo === "telefone" ? value.length >= 10 : value.length === 11;
  }

  async function buscarCliente() {
    try {
      setChecking(true);
      setErro("");
      setClienteEncontrado(null);

      if (!valido()) {
        setErro(tipo === "telefone" ? "Informe um telefone válido." : "Informe um CPF válido.");
        return;
      }

      const value = valorNormalizado();

      const res = await fetch(
        `${API}/api/cardapio/cliente/${encodeURIComponent(value)}?empresa_id=${empresaId}&tipo=${tipo}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (data?.encontrado && data?.cliente) {
        setClienteEncontrado(data.cliente);
        setModoCadastro(false);
        return;
      }

      setModoCadastro(true);

      if (tipo === "telefone") {
        setTelefoneCadastro(formatPhone(value));
      } else {
        setCpfCadastro(formatCpf(value));
      }
    } catch {
      setErro("Não foi possível consultar o cadastro.");
    } finally {
      setChecking(false);
    }
  }

  function usarClienteEncontrado() {
    onConfirm({
      nome: clienteEncontrado?.nome || "",
      telefone: clienteEncontrado?.telefone || (tipo === "telefone" ? valorNormalizado() : ""),
      cpf: clienteEncontrado?.cpf || (tipo === "cpf" ? valorNormalizado() : "")
    });
  }

  function continuarCadastro() {
    if (!nomeCadastro.trim()) {
      setErro("Informe seu nome para continuar.");
      return;
    }

    onConfirm({
      nome: nomeCadastro.trim(),
      telefone: normalizePhone(telefoneCadastro || (tipo === "telefone" ? identificador : "")),
      cpf: onlyDigits(cpfCadastro || (tipo === "cpf" ? identificador : ""))
    });
  }

  function skipData() {
    onConfirm({ nome: "", telefone: "", cpf: "" });
  }

  function trocarIdentificacao() {
    setClienteEncontrado(null);
    setModoCadastro(false);
    setErro("");
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-white shadow-2xl">
        <p
          className="text-xs font-black uppercase tracking-[0.35em]"
          style={{ color: primaryColor }}
        >
          {text.title}
        </p>

        {!clienteEncontrado && !modoCadastro && (
          <>
            <h2 className="mt-4 text-3xl font-black">{text.subtitle}</h2>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setTipo("telefone");
                  setIdentificador("");
                  setErro("");
                }}
                className={`rounded-2xl px-4 py-3 font-black transition ${
                  tipo === "telefone" ? "text-black" : "bg-white/10 text-white"
                }`}
                style={{ background: tipo === "telefone" ? primaryColor : undefined }}
              >
                {text.telefone}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTipo("cpf");
                  setIdentificador("");
                  setErro("");
                }}
                className={`rounded-2xl px-4 py-3 font-black transition ${
                  tipo === "cpf" ? "text-black" : "bg-white/10 text-white"
                }`}
                style={{ background: tipo === "cpf" ? primaryColor : undefined }}
              >
                {text.cpf}
              </button>
            </div>

            <div className="mt-5">
              {tipo === "telefone" ? (
                <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 ring-1 ring-white/10 focus-within:ring-emerald-400">
                  <span className="text-2xl">{country.flag}</span>
                  <input
                    value={identificador}
                    onChange={(event) => setIdentificador(formatPhone(event.target.value))}
                    placeholder={text.buscarTelefone}
                    inputMode="tel"
                    className="w-full bg-transparent py-4 outline-none"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") buscarCliente();
                    }}
                  />
                </div>
              ) : (
                <input
                  value={identificador}
                  onChange={(event) => setIdentificador(formatCpf(event.target.value))}
                  placeholder={text.buscarCpf}
                  inputMode="numeric"
                  className="w-full rounded-2xl bg-white/10 p-4 outline-none ring-1 ring-white/10 focus:ring-emerald-400"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") buscarCliente();
                  }}
                />
              )}
            </div>

            <button
              type="button"
              onClick={buscarCliente}
              disabled={checking}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 font-black text-black disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)` }}
            >
              <Search size={18} />
              {checking ? text.buscando : text.buscar}
            </button>
          </>
        )}

        {clienteEncontrado && (
          <>
            <h2 className="mt-4 text-3xl font-black">{text.welcome}</h2>

            <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5">
              <p className="text-xl font-black text-emerald-200">
                {clienteEncontrado.nome || "Cliente"}
              </p>
              <p className="mt-1 text-sm text-emerald-100/70">
                {clienteEncontrado.telefone || clienteEncontrado.cpf || valorNormalizado()}
              </p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={usarClienteEncontrado}
                className="rounded-2xl px-5 py-4 font-black text-black"
                style={{ background: primaryColor }}
              >
                {text.usarCadastro}
              </button>

              <button
                type="button"
                onClick={trocarIdentificacao}
                className="rounded-2xl bg-white/10 px-5 py-4 font-black text-white"
              >
                {text.trocar}
              </button>
            </div>
          </>
        )}

        {modoCadastro && (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <UserPlus size={22} style={{ color: primaryColor }} />
              </div>
              <div>
                <h2 className="text-3xl font-black">{text.cadastroTitulo}</h2>
                <p className="mt-1 text-sm text-white/50">{text.cadastroTexto}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <input
                value={nomeCadastro}
                onChange={(event) => setNomeCadastro(event.target.value)}
                placeholder={text.nome}
                className="rounded-2xl bg-white/10 p-4 outline-none ring-1 ring-white/10 focus:ring-emerald-400"
              />

              <input
                value={telefoneCadastro}
                onChange={(event) => setTelefoneCadastro(formatPhone(event.target.value))}
                placeholder={text.telefone}
                inputMode="tel"
                className="rounded-2xl bg-white/10 p-4 outline-none ring-1 ring-white/10 focus:ring-emerald-400"
              />

              <input
                value={cpfCadastro}
                onChange={(event) => setCpfCadastro(formatCpf(event.target.value))}
                placeholder={text.cpf}
                inputMode="numeric"
                className="rounded-2xl bg-white/10 p-4 outline-none ring-1 ring-white/10 focus:ring-emerald-400"
              />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={continuarCadastro}
                className="rounded-2xl px-5 py-4 font-black text-black"
                style={{ background: primaryColor }}
              >
                {text.continuar}
              </button>

              <button
                type="button"
                onClick={trocarIdentificacao}
                className="rounded-2xl bg-white/10 px-5 py-4 font-black text-white"
              >
                {text.trocar}
              </button>
            </div>
          </>
        )}

        {erro && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {erro}
          </div>
        )}

        <p className="mt-4 text-xs leading-relaxed text-zinc-500">{text.lgpd}</p>

        <button
          type="button"
          onClick={skipData}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-4 font-black text-white transition hover:bg-white/20"
        >
          <X size={17} />
          {text.naoInformar}
        </button>
      </div>
    </div>
  );
}
