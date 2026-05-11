"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog,
  X,
  XCircle,
} from "lucide-react";
import { ADMIN_MODULES } from "@/lib/adminModules";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type UsuarioAdmin = {
  Id?: number;
  empresa_id?: number | string;
  nome?: string;
  email?: string;
  senha_hash?: string;
  role?: string;
  ativo?: boolean | string | number;
  modulos_acesso_json?: string;
  modulos_acesso?: string;
  criado_em?: string;
  atualizado_em?: string;
};

const ROLE_OPTIONS = [
  { value: "Admin", label: "Admin da Empresa" },
  { value: "Operador", label: "Operador" },
  { value: "Cozinha", label: "Cozinha" },
  { value: "Caixa", label: "Caixa" },
  { value: "Gerente", label: "Gerente" },
  { value: "Supervisor", label: "Supervisor" },
  { value: "ADM", label: "ADM Geral" },
];

function parseBoolean(value: any) {
  if (value === true || value === 1) return true;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "sim") return true;
  return false;
}

function parseModules(value?: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nowNoco() {
  const date = new Date();

  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get(
    "minute"
  )}:${get("second")}`;
}

function defaultModulesByRole(role: string): string[] {
  if (role === "ADM" || role === "Admin" || role === "Gerente") {
    return ADMIN_MODULES.map((module) => module.id);
  }

  if (role === "Cozinha") return ["cozinha", "pedidos"];
  if (role === "Caixa") return ["dashboard", "pedidos"];
  if (role === "Supervisor") return ["dashboard", "pedidos", "cozinha"];

  return ["dashboard", "pedidos"];
}

export default function Usuarios({ empresaId }: { empresaId: string }) {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);

  async function carregarUsuarios() {
    try {
      setLoading(true);
      setErro("");

      const res = await fetch(
        `${API}/api/db/usuarios_cardapio?where=(empresa_id,eq,${empresaId})&limit=500`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Erro ao carregar usuários.");

      setUsuarios(Array.isArray(data?.list) ? data.list : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  async function salvarUsuario(payload: UsuarioAdmin) {
    try {
      setErro("");

      const isEdit = !!payload.Id;

      const body = {
        ...payload,
        empresa_id: Number(empresaId),
        ativo: payload.ativo !== false,
        modulos_acesso_json: payload.modulos_acesso_json || "[]",
        atualizado_em: nowNoco(),
        ...(isEdit ? {} : { criado_em: nowNoco() }),
      };

      const res = await fetch(`${API}/api/cardapio/admin/usuarios`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Erro ao salvar usuário.");

      setModalAberto(false);
      setEditando(null);
      await carregarUsuarios();
    } catch (error: any) {
      setErro(error?.message || "Erro ao salvar usuário.");
    }
  }

  async function alternarAtivo(usuario: UsuarioAdmin) {
    await salvarUsuario({ ...usuario, ativo: !parseBoolean(usuario.ativo) });
  }

  useEffect(() => {
    carregarUsuarios();
  }, [empresaId]);

  const resumo = useMemo(() => {
    return {
      total: usuarios.length,
      ativos: usuarios.filter((u) => parseBoolean(u.ativo)).length,
      inativos: usuarios.filter((u) => !parseBoolean(u.ativo)).length,
    };
  }, [usuarios]);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Contas Admin</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Gerencie usuários, funções e permissões por módulo.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={carregarUsuarios}
            className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/20"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>

          <button
            type="button"
            onClick={() => {
              setEditando(null);
              setModalAberto(true);
            }}
            className="flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-300"
          >
            <Plus className="h-4 w-4" />
            Novo usuário
          </button>
        </div>
      </header>

      {erro && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <ResumoCard label="Total de usuários" value={resumo.total} />
        <ResumoCard label="Ativos" value={resumo.ativos} tone="emerald" />
        <ResumoCard label="Inativos" value={resumo.inativos} tone="red" />
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
        {loading && usuarios.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">Carregando usuários...</div>
        ) : usuarios.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">
            Nenhum usuário cadastrado para esta empresa.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {usuarios.map((usuario) => {
              const modulos = parseModules(
                usuario.modulos_acesso_json || usuario.modulos_acesso
              );
              const ativo = parseBoolean(usuario.ativo);

              return (
                <div
                  key={usuario.Id}
                  className="grid gap-4 px-5 py-4 xl:grid-cols-[1.2fr_1fr_1fr_1fr] xl:items-center"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                        <UserCog className="h-5 w-5 text-white/70" />
                      </div>

                      <div>
                        <p className="font-black text-white">
                          {usuario.nome || "Sem nome"}
                        </p>
                        <p className="text-sm text-zinc-500">{usuario.email}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="rounded-full bg-blue-400/15 px-3 py-1 text-xs font-black text-blue-100">
                      {usuario.role || "Operador"}
                    </span>
                    <div className="mt-2 flex items-center gap-1 text-xs">
                      {ativo ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                          <span className="text-emerald-300">Ativo</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-red-300" />
                          <span className="text-red-300">Inativo</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-zinc-300">
                      {modulos.length || ADMIN_MODULES.length} módulo(s)
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                      {(modulos.length
                        ? modulos
                        : ADMIN_MODULES.map((m) => m.id)
                      )
                        .slice(0, 5)
                        .join(", ")}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(usuario);
                        setModalAberto(true);
                      }}
                      className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-black transition hover:bg-white/20"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => alternarAtivo(usuario)}
                      className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                        ativo
                          ? "bg-red-500/15 text-red-200 hover:bg-red-500/25"
                          : "bg-emerald-400 text-black hover:bg-emerald-300"
                      }`}
                    >
                      {ativo ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalAberto && (
        <UsuarioModal
          usuario={editando}
          empresaId={empresaId}
          onClose={() => {
            setModalAberto(false);
            setEditando(null);
          }}
          onSave={salvarUsuario}
        />
      )}
    </section>
  );
}

function ResumoCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "emerald" | "red";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "red"
      ? "text-red-300"
      : "text-white";

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function UsuarioModal({
  usuario,
  empresaId,
  onClose,
  onSave,
}: {
  usuario: UsuarioAdmin | null;
  empresaId: string;
  onClose: () => void;
  onSave: (payload: UsuarioAdmin) => void;
}) {
  const [nome, setNome] = useState(usuario?.nome || "");
  const [email, setEmail] = useState(usuario?.email || "");
  const [senha, setSenha] = useState(usuario?.senha_hash || "");
  const [role, setRole] = useState(usuario?.role || "Operador");
  const [ativo, setAtivo] = useState(parseBoolean(usuario?.ativo ?? true));
  const [modulos, setModulos] = useState<string[]>(
    usuario
      ? parseModules(usuario.modulos_acesso_json || usuario.modulos_acesso)
      : defaultModulesByRole("Operador")
  );

  function toggleModulo(id: string) {
    setModulos((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function aplicarPadraoRole(nextRole: string) {
    setRole(nextRole);
    setModulos(defaultModulesByRole(nextRole));
  }

  function salvar(event: FormEvent) {
    event.preventDefault();

    onSave({
      ...usuario,
      empresa_id: Number(empresaId),
      nome,
      email,
      senha_hash: senha,
      role,
      ativo,
      modulos_acesso_json: JSON.stringify(modulos),
    });
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <form
        onSubmit={salvar}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 text-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-400 p-3 text-black">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-xl font-black">
                {usuario?.Id ? "Editar usuário" : "Novo usuário"}
              </h2>
              <p className="text-sm text-zinc-500">
                Configure função, acesso e módulos permitidos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white/10 p-3 transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Campo label="Nome">
              <input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-emerald-300"
                placeholder="Nome do usuário"
              />
            </Campo>

            <Campo label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-emerald-300"
                placeholder="email@empresa.com"
              />
            </Campo>

            <Campo label="Senha">
              <input
                type="text"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                required={!usuario?.Id}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-emerald-300"
                placeholder="Senha de acesso"
              />
            </Campo>

            <Campo label="Função">
              <select
                value={role}
                onChange={(event) => aplicarPadraoRole(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none transition focus:border-emerald-300"
              >
                {ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(event) => setAtivo(event.target.checked)}
              className="h-5 w-5"
            />
            <span>
              <strong>Usuário ativo</strong>
              <span className="ml-2 text-sm text-zinc-500">
                usuários inativos não devem acessar o painel.
              </span>
            </span>
          </label>

          <div className="mt-6">
            <h3 className="text-lg font-black">Módulos permitidos</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Selecione quais áreas este usuário poderá acessar.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {ADMIN_MODULES.map((module) => {
                const checked = modulos.includes(module.id);

                return (
                  <label
                    key={module.id}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      checked
                        ? "border-emerald-300/50 bg-emerald-400/10"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModulo(module.id)}
                        className="mt-1 h-5 w-5"
                      />

                      <div>
                        <p className="font-black">{module.label}</p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {module.description}
                        </p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </main>

        <footer className="grid gap-3 border-t border-white/10 p-5 md:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white/10 px-4 py-3 font-black transition hover:bg-white/20"
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 font-black text-black transition hover:bg-emerald-300"
          >
            <Save className="h-4 w-4" />
            Salvar usuário
          </button>
        </footer>
      </form>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-bold text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
