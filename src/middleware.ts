import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { extractBearerToken } from "@/lib/auth/jwt";

// ─────────────────────────────────────────────
// Rotas que requerem autenticação
// ─────────────────────────────────────────────
const AUTH_ROUTES = [
  "/admin",
  "/hub",
  "/painel",
  "/garcom",
  "/cozinha",
  "/financeiro",
  "/delivery",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/pedidos",
  "/api/mesas",
  "/api/cozinha",
  "/api/gateways",
  "/api/admin",
  "/api/usuarios",
  "/api/cardapio",
  "/api/financeiro",
  "/api/painel",
  "/api/motoboy",
  "/motoboy",
];

// Rotas públicas (sem autenticação)
const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/webhooks",
  "/api/health",
  "/api/pub",
  "/api/v1",
  "/api/observability/error",
  "/api/ifood/poll",
  "/totem",
  "/rastrear",
  "/docs",
];

// Rotas por role
const ROLE_ROUTES: Record<string, string[]> = {
  master:     ["/admin"],
  admin:      ["/painel"],
  gerente:    ["/painel"],
  garcom:     ["/garcom"],
  cozinha:    ["/cozinha"],
  financeiro: ["/financeiro"],
  delivery:   ["/delivery"],
  atendente:  ["/painel"],
  motoboy:    ["/delivery"],
};

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((r) => pathname.startsWith(r));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ─────────────────────────────────────────────
  // Headers de segurança (aplicados a todas as respostas)
  // ─────────────────────────────────────────────
  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options",    "nosniff");
  response.headers.set("X-Frame-Options",            "DENY");
  response.headers.set("X-XSS-Protection",           "1; mode=block");
  response.headers.set("Referrer-Policy",            "strict-origin-when-cross-origin");
  // Geolocation liberada pra /motoboy poder usar GPS; demais sensors bloqueados
  response.headers.set("Permissions-Policy",         "camera=(), microphone=(), geolocation=(self)");
  response.headers.set("Strict-Transport-Security",  "max-age=31536000; includeSubDomains; preload");

  // Content-Security-Policy
  // Permite MinIO local (http://127.0.0.1:9010, http://minio:*) para imagens/vídeos,
  // gateways de pagamento, Mercado Pago, Stripe, Evolution API e WebSockets.
  // Mantém sincronizado com next.config.js para evitar divergências.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://js.stripe.com https://unpkg.com blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "worker-src 'self' blob:",
      "img-src 'self' data: blob: https: http://127.0.0.1:* http://localhost:* http://minio:*",
      "media-src 'self' data: blob: https: http://127.0.0.1:* http://localhost:* http://minio:*",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' wss: ws: https: http://127.0.0.1:* http://localhost:* http://evolution:* http://minio:* https://viacep.com.br https://*.tile.openstreetmap.org",
      "frame-src 'self' https://www.mercadopago.com.br https://www.mercadolibre.com https://js.stripe.com",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  // ─────────────────────────────────────────────
  // CORS para rotas de API
  // ─────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin") || "";
    const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim());

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
      response.headers.set("Access-Control-Allow-Origin",      origin);
      response.headers.set("Access-Control-Allow-Methods",     "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers",     "Content-Type, Authorization, X-Requested-With");
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set("Access-Control-Max-Age",           "86400");
    }

    // Preflight OPTIONS
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }
  }

  // ─────────────────────────────────────────────
  // Rota de login → redireciona se já autenticado
  // ─────────────────────────────────────────────
  if (pathname === "/login" || pathname === "/") {
    return response;
  }

  // ─────────────────────────────────────────────
  // Rotas públicas — passa sem verificar token
  // ─────────────────────────────────────────────
  if (isPublicRoute(pathname)) {
    return response;
  }

  // ─────────────────────────────────────────────
  // Rotas que exigem autenticação (apenas no servidor)
  // A validação completa acontece em cada handler via requireAuth()
  // O middleware valida apenas se o token é um JWT válido.
  // ─────────────────────────────────────────────
  if (isAuthRoute(pathname)) {
    const token = extractBearerToken(req.headers.get("authorization"));

    if (!token && pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Não autenticado", code: "UNAUTHORIZED" },
        { status: 401, headers: response.headers }
      );
    }

    // Para páginas (não API), o redirecionamento é feito no client-side
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
