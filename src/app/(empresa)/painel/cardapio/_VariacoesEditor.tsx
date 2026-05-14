"use client";

/**
 * Editor visual de variações de produto.
 *
 * Substitui o textarea JSON por uma UI baseada em cartões:
 *   - Lista de grupos (Tamanho, Adicionais, etc.)
 *   - Cada grupo: nome, tipo (single/multiple), obrigatório, min/max
 *   - Lista de opções por grupo: nome, preço extra
 *   - Botões: adicionar/remover grupo, adicionar/remover opção, mover ↑↓
 *
 * Não usa drag-and-drop para evitar dependência externa; usa setas.
 */
import { useState, useCallback } from "react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";
import {
  Plus, Trash2, ArrowUp, ArrowDown, GripVertical, ChevronDown,
} from "lucide-react";

export interface OpcaoVariacao {
  id:           string;
  nome:         string;
  preco_extra:  number;
  disponivel?:  boolean;
}
export interface GrupoVariacao {
  id:           string;
  nome:         string;
  tipo:         "single" | "multiple";
  obrigatorio?: boolean;
  min?:         number;
  max?:         number;
  opcoes:       OpcaoVariacao[];
}
export interface Variacoes {
  grupos: GrupoVariacao[];
}

interface Props {
  value:    Variacoes;
  onChange: (v: Variacoes) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

function uniqueId(prefix: string, existing: { id: string }[]): string {
  const base = slugify(prefix) || "item";
  let id = base;
  let i = 2;
  while (existing.some((x) => x.id === id)) {
    id = `${base}_${i++}`;
  }
  return id;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function VariacoesEditor({ value, onChange }: Props) {
  const grupos = value.grupos ?? [];

  // Quais grupos estão expandidos (default: todos abertos)
  const [expandidos, setExpandidos] = useState<Set<string>>(
    () => new Set(grupos.map((g) => g.id))
  );

  function toggleExpand(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Mutations no value (imutáveis, sempre via onChange) ───────────────────

  const addGrupo = useCallback(() => {
    const id = uniqueId("grupo", grupos);
    const novo: GrupoVariacao = {
      id, nome: "Novo grupo", tipo: "single", obrigatorio: false,
      min: 1, max: 1,
      opcoes: [{ id: "opcao_1", nome: "Opção 1", preco_extra: 0 }],
    };
    onChange({ grupos: [...grupos, novo] });
    setExpandidos((p) => { const n = new Set(p); n.add(id); return n; });
  }, [grupos, onChange]);

  const updateGrupo = useCallback((idx: number, patch: Partial<GrupoVariacao>) => {
    const next = grupos.map((g, i) => (i === idx ? { ...g, ...patch } : g));
    onChange({ grupos: next });
  }, [grupos, onChange]);

  const removeGrupo = useCallback(async (idx: number) => {
    if (!await confirmar({ titulo: `Remover o grupo "${grupos[idx].nome}"?`, perigo: true, okLabel: "Remover" })) return;
    onChange({ grupos: grupos.filter((_, i) => i !== idx) });
  }, [grupos, onChange]);

  const moveGrupo = useCallback((idx: number, dir: -1 | 1) => {
    onChange({ grupos: move(grupos, idx, idx + dir) });
  }, [grupos, onChange]);

  const addOpcao = useCallback((idxGrupo: number) => {
    const grupo = grupos[idxGrupo];
    const id = uniqueId(`opcao_${grupo.opcoes.length + 1}`, grupo.opcoes);
    const opcoes = [...grupo.opcoes, { id, nome: "Nova opção", preco_extra: 0 }];
    updateGrupo(idxGrupo, { opcoes });
  }, [grupos, updateGrupo]);

  const updateOpcao = useCallback((idxGrupo: number, idxOp: number, patch: Partial<OpcaoVariacao>) => {
    const grupo  = grupos[idxGrupo];
    const opcoes = grupo.opcoes.map((o, i) => (i === idxOp ? { ...o, ...patch } : o));
    updateGrupo(idxGrupo, { opcoes });
  }, [grupos, updateGrupo]);

  const removeOpcao = useCallback(async (idxGrupo: number, idxOp: number) => {
    const grupo = grupos[idxGrupo];
    if (grupo.opcoes.length === 1) {
      await alertar({ titulo: "Não é possível remover", mensagem: "Cada grupo precisa ter ao menos 1 opção. Remova o grupo todo se necessário.", tipo: "alerta" });
      return;
    }
    updateGrupo(idxGrupo, { opcoes: grupo.opcoes.filter((_, i) => i !== idxOp) });
  }, [grupos, updateGrupo]);

  const moveOpcao = useCallback((idxGrupo: number, idxOp: number, dir: -1 | 1) => {
    const grupo = grupos[idxGrupo];
    updateGrupo(idxGrupo, { opcoes: move(grupo.opcoes, idxOp, idxOp + dir) });
  }, [grupos, updateGrupo]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-300">Variações &amp; Adicionais</p>
          <p className="text-[11px] text-slate-500">
            Tamanhos, sabores, complementos opcionais ou obrigatórios
          </p>
        </div>
        <button
          type="button"
          onClick={addGrupo}
          className="flex items-center gap-1 rounded-lg bg-brand/15 px-2.5 py-1 text-[11px] font-bold text-brand hover:bg-brand/25 transition"
        >
          <Plus className="h-3 w-3" />
          Adicionar grupo
        </button>
      </div>

      {grupos.length === 0 && (
        <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center">
          <p className="text-xs text-slate-500">
            Sem variações. Clique em <strong>+ Adicionar grupo</strong> para criar tamanhos ou adicionais.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {grupos.map((grupo, idxG) => {
          const expanded = expandidos.has(grupo.id);
          return (
            <div key={grupo.id} className="rounded-lg border border-white/10 bg-slate-900">
              {/* Header do grupo */}
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleExpand(grupo.id)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
                  <GripVertical className="h-3.5 w-3.5 text-slate-600" />
                  <span className="text-sm font-bold text-white truncate">
                    {grupo.nome || "(sem nome)"}
                  </span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                    {grupo.tipo === "single" ? "uma escolha" : `múltiplas (até ${grupo.max ?? 99})`}
                  </span>
                  {grupo.obrigatorio && (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                      OBRIG.
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">{grupo.opcoes.length} opções</span>
                </button>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveGrupo(idxG, -1)}
                    disabled={idxG === 0}
                    title="Mover para cima"
                    className="rounded p-1 text-slate-500 hover:text-white disabled:opacity-30"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveGrupo(idxG, 1)}
                    disabled={idxG === grupos.length - 1}
                    title="Mover para baixo"
                    className="rounded p-1 text-slate-500 hover:text-white disabled:opacity-30"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeGrupo(idxG)}
                    title="Remover grupo"
                    className="rounded p-1 text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Corpo expandido */}
              {expanded && (
                <div className="border-t border-white/5 p-3 space-y-3">
                  {/* Linha 1: Nome + Tipo */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                        Nome do grupo
                      </label>
                      <input
                        value={grupo.nome}
                        onChange={(e) => updateGrupo(idxG, { nome: e.target.value })}
                        placeholder="Ex: Tamanho"
                        className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                        Tipo
                      </label>
                      <select
                        value={grupo.tipo}
                        onChange={(e) => {
                          const tipo = e.target.value as "single" | "multiple";
                          // Se vira single, max=1 e min=1 se obrigatório
                          updateGrupo(idxG, {
                            tipo,
                            min: tipo === "single" ? (grupo.obrigatorio ? 1 : 0) : grupo.min,
                            max: tipo === "single" ? 1 : (grupo.max ?? 5),
                          });
                        }}
                        className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-brand/50 focus:outline-none"
                      >
                        <option value="single">Escolha única (radio)</option>
                        <option value="multiple">Múltiplas (checkboxes)</option>
                      </select>
                    </div>
                  </div>

                  {/* Linha 2: Obrigatório + min/max */}
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!grupo.obrigatorio}
                        onChange={(e) => updateGrupo(idxG, {
                          obrigatorio: e.target.checked,
                          min: e.target.checked ? Math.max(1, grupo.min ?? 1) : 0,
                        })}
                        className="h-3.5 w-3.5 rounded border-white/20 bg-white/10 text-brand"
                      />
                      <span className="text-xs text-slate-300">Obrigatório</span>
                    </label>
                    {grupo.tipo === "multiple" && (
                      <>
                        <label className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">Mín.</span>
                          <input
                            type="number"
                            min={0}
                            max={grupo.max ?? 50}
                            value={grupo.min ?? 0}
                            onChange={(e) => updateGrupo(idxG, { min: Math.max(0, parseInt(e.target.value) || 0) })}
                            className="w-14 rounded border border-white/10 bg-slate-800 px-1.5 py-0.5 text-xs text-white text-center"
                          />
                        </label>
                        <label className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">Máx.</span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={grupo.max ?? 1}
                            onChange={(e) => updateGrupo(idxG, { max: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-14 rounded border border-white/10 bg-slate-800 px-1.5 py-0.5 text-xs text-white text-center"
                          />
                        </label>
                      </>
                    )}
                  </div>

                  {/* Lista de opções */}
                  <div>
                    <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                      Opções
                    </p>
                    <div className="space-y-1.5">
                      {grupo.opcoes.map((op, idxO) => (
                        <div key={op.id} className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-slate-950 px-2 py-1.5">
                          <GripVertical className="h-3 w-3 flex-shrink-0 text-slate-600" />
                          <input
                            value={op.nome}
                            onChange={(e) => updateOpcao(idxG, idxO, { nome: e.target.value })}
                            placeholder="Nome da opção"
                            className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                          />
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[10px] text-slate-500">+R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min={-9999}
                              max={9999}
                              value={op.preco_extra}
                              onChange={(e) => updateOpcao(idxG, idxO, { preco_extra: parseFloat(e.target.value) || 0 })}
                              className="w-16 rounded border border-white/10 bg-slate-800 px-1.5 py-0.5 text-xs text-white text-right"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => moveOpcao(idxG, idxO, -1)}
                            disabled={idxO === 0}
                            className="rounded p-0.5 text-slate-500 hover:text-white disabled:opacity-30"
                            title="Mover para cima"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveOpcao(idxG, idxO, 1)}
                            disabled={idxO === grupo.opcoes.length - 1}
                            className="rounded p-0.5 text-slate-500 hover:text-white disabled:opacity-30"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOpcao(idxG, idxO)}
                            className="rounded p-0.5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                            title="Remover opção"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addOpcao(idxG)}
                      className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:border-brand/40 hover:text-brand transition"
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar opção
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
