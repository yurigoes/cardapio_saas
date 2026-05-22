/**
 * Auth do MASTER (dono do SaaS) — separado da auth do cliente.
 * Token JWT com role (master|suporte). Mesmo JWT_SECRET, mas com claim `tipo: "admin"`
 * pra não confundir com token de cliente.
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "troque-este-secret-em-producao-midia-indoor"
);
const EXPIRA = "12h";

export type AdminRole = "master" | "suporte";

export interface AdminPayload {
  sub:   string;   // admin id
  email: string;
  nome:  string;
  role:  AdminRole;
}

export async function hashSenha(senha: string): Promise<string> { return bcrypt.hash(senha, 10); }
export async function conferirSenha(senha: string, hash: string): Promise<boolean> { return bcrypt.compare(senha, hash); }

export async function criarTokenAdmin(p: AdminPayload): Promise<string> {
  return new SignJWT({ email: p.email, nome: p.nome, role: p.role, tipo: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(EXPIRA)
    .sign(SECRET);
}

export async function verificarTokenAdmin(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.tipo !== "admin") return null;
    return {
      sub:   String(payload.sub),
      email: String(payload.email ?? ""),
      nome:  String(payload.nome ?? ""),
      role:  (payload.role === "suporte" ? "suporte" : "master"),
    };
  } catch { return null; }
}

/** Extrai e valida o token admin do header Authorization. */
export async function autenticarAdmin(req: NextRequest): Promise<AdminPayload | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return verificarTokenAdmin(h.slice(7));
}

/** Exige master (nega suporte). */
export async function exigirMaster(req: NextRequest): Promise<AdminPayload | null> {
  const a = await autenticarAdmin(req);
  return a && a.role === "master" ? a : null;
}
