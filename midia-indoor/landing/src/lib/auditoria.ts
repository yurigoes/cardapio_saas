/**
 * Audit log — registra ações relevantes (best-effort, nunca quebra a operação).
 */
import { db } from "./db";
import { NextRequest } from "next/server";

export interface AuditEntry {
  autor_tipo: "admin" | "cliente" | "sistema";
  autor_id?: string | null;
  autor_nome?: string | null;
  acao: string;          // ex: "campanha.lancar"
  entidade?: string;     // ex: "campanha"
  entidade_id?: string;
  detalhes?: Record<string, unknown>;
  ip?: string | null;
}

export async function logAudit(req: NextRequest | null, e: AuditEntry): Promise<void> {
  try {
    const ip = e.ip ?? req?.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    await db().query(
      `INSERT INTO midia_auditoria (autor_tipo, autor_id, autor_nome, acao, entidade, entidade_id, detalhes, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.autor_tipo, e.autor_id ?? null, e.autor_nome ?? null, e.acao, e.entidade ?? null, e.entidade_id ?? null, e.detalhes ? JSON.stringify(e.detalhes) : null, ip]
    );
  } catch (err) { console.warn("[audit]", (err as Error).message); }
}
