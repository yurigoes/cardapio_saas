// ─────────────────────────────────────────────
// Mini-harness de testes que roda DENTRO do app (sem Vitest/CLI).
// Usado pela página /testes para executar os testes unitários em processo.
// (Os mesmos casos também rodam via Vitest em `npm test`.)
// ─────────────────────────────────────────────

export type Caso = { nome: string; run: () => void | Promise<void> };
export type Suite = {
  modulo: string;
  nome: string;
  categoria: string;
  descricao: string;
  casos: Caso[];
};

export type CasoResultado = { nome: string; status: "passed" | "failed"; erro?: string; ms: number };
export type SuiteResultado = {
  modulo: string;
  nome: string;
  categoria: string;
  descricao: string;
  ms: number;
  casos: CasoResultado[];
};

function fmt(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const ka = Object.keys(oa).filter((k) => oa[k] !== undefined);
  const kb = Object.keys(ob).filter((k) => ob[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(oa[k], ob[k]));
}

function matchObject(received: unknown, expected: Record<string, unknown>): boolean {
  if (typeof received !== "object" || received === null) return false;
  const r = received as Record<string, unknown>;
  return Object.keys(expected).every((k) => {
    const e = expected[k];
    if (e !== null && typeof e === "object" && !Array.isArray(e)) return matchObject(r[k], e as Record<string, unknown>);
    return deepEqual(r[k], e);
  });
}

export function expect(received: unknown, isNot = false) {
  const check = (pass: boolean, msg: string) => {
    if (isNot) pass = !pass;
    if (!pass) throw new Error((isNot ? "[not] " : "") + msg);
  };
  return {
    toBe: (e: unknown) => check(Object.is(received, e), `esperado ${fmt(e)}, recebido ${fmt(received)}`),
    toEqual: (e: unknown) => check(deepEqual(received, e), `toEqual: ${fmt(received)} ≠ ${fmt(e)}`),
    toMatchObject: (e: Record<string, unknown>) => check(matchObject(received, e), `toMatchObject falhou em ${fmt(received)}`),
    toContain: (e: unknown) =>
      check(received != null && typeof (received as { includes?: unknown }).includes === "function" &&
        (received as { includes: (x: unknown) => boolean }).includes(e), `${fmt(received)} não contém ${fmt(e)}`),
    toBeNull: () => check(received === null, `esperado null, recebido ${fmt(received)}`),
    toBeTruthy: () => check(!!received, `esperado truthy, recebido ${fmt(received)}`),
    toBeGreaterThan: (n: number) => check(typeof received === "number" && received > n, `${fmt(received)} não é > ${n}`),
    toThrow: () => {
      let threw = false;
      try { (received as () => unknown)(); } catch { threw = true; }
      check(threw, `esperado que lançasse erro`);
    },
    get not() { return expect(received, !isNot); },
  };
}

/** Executa um caso; usado para checar rejeição de promise. */
export async function expectRejeita(p: Promise<unknown>): Promise<void> {
  let rejeitou = false;
  try { await p; } catch { rejeitou = true; }
  if (!rejeitou) throw new Error("esperado que a promise rejeitasse");
}

export async function rodarSuites(suites: Suite[]): Promise<SuiteResultado[]> {
  const out: SuiteResultado[] = [];
  for (const s of suites) {
    const casos: CasoResultado[] = [];
    for (const c of s.casos) {
      const t0 = Date.now();
      try {
        await c.run();
        casos.push({ nome: c.nome, status: "passed", ms: Date.now() - t0 });
      } catch (e) {
        casos.push({ nome: c.nome, status: "failed", ms: Date.now() - t0, erro: String((e as Error)?.message ?? e) });
      }
    }
    const ms = casos.reduce((a, c) => a + c.ms, 0);
    out.push({ modulo: s.modulo, nome: s.nome, categoria: s.categoria, descricao: s.descricao, ms, casos });
  }
  return out;
}
