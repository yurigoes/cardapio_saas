import { SignJWT, jwtVerify, JWTPayload } from "jose";

export type JWTRole =
  | "master" | "suporte" | "admin" | "gerente" | "garcom" | "cozinha"
  | "atendente" | "financeiro" | "delivery" | "motoboy" | "cliente";

export interface TokenPayload extends JWTPayload {
  sub:        string;   // usuario_id
  email:      string;
  role:       JWTRole;
  empresaId?: string;   // null para master
  nome:       string;
  sessionId:  string;   // sessao.id para revogação
}

function getSecret(key: string): Uint8Array {
  const val = process.env[key];
  if (!val) throw new Error(`Variável de ambiente ${key} não definida`);
  return new TextEncoder().encode(val);
}

export async function signAccessToken(payload: Omit<TokenPayload, "iat" | "exp">): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN || "15m";

  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setIssuer("cardapio-saas")
    .setAudience("cardapio-saas-api")
    .sign(getSecret("JWT_SECRET"));
}

export async function signRefreshToken(payload: Pick<TokenPayload, "sub" | "sessionId">): Promise<string> {
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setIssuer("cardapio-saas")
    .setAudience("cardapio-saas-refresh")
    .sign(getSecret("JWT_REFRESH_SECRET"));
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getSecret("JWT_SECRET"), {
    issuer:   "cardapio-saas",
    audience: "cardapio-saas-api",
  });
  return payload as TokenPayload;
}

export async function verifyRefreshToken(
  token: string
): Promise<Pick<TokenPayload, "sub" | "sessionId">> {
  const { payload } = await jwtVerify(token, getSecret("JWT_REFRESH_SECRET"), {
    issuer:   "cardapio-saas",
    audience: "cardapio-saas-refresh",
  });
  return payload as Pick<TokenPayload, "sub" | "sessionId">;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}
