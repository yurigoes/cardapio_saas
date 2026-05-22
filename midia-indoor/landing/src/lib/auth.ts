/**
 * Auth do cliente do SaaS de mídia (JWT + bcrypt).
 * Espelha o padrão do Three Digital, simplificado.
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "troque-este-secret-em-producao-midia-indoor"
);
const EXPIRA = "7d";

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}
export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

export interface TokenPayload {
  sub:     string;   // conta_id
  email:   string;
  empresa: string;
}

export async function criarToken(p: TokenPayload): Promise<string> {
  return new SignJWT({ email: p.email, empresa: p.empresa })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(EXPIRA)
    .sign(SECRET);
}

export async function verificarToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      sub:     String(payload.sub),
      email:   String(payload.email ?? ""),
      empresa: String(payload.empresa ?? ""),
    };
  } catch {
    return null;
  }
}

/** Extrai e valida o token do header Authorization. */
export async function autenticar(req: NextRequest): Promise<TokenPayload | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return verificarToken(h.slice(7));
}
