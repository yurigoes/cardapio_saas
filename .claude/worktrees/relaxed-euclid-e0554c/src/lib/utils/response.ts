import { NextResponse } from "next/server";
import { rateLimitHeaders, RateLimitResult } from "@/lib/security/rate-limit";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?:   T;
  error?:  string;
  code?:   string;
  meta?:   Record<string, unknown>;
}

export function ok<T>(
  data: T,
  meta?: Record<string, unknown>,
  status = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, meta }, { status });
}

export function created<T>(data: T): NextResponse<ApiResponse<T>> {
  return ok(data, undefined, 201);
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(error: string, code?: string): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error, code }, { status: 400 });
}

export function unauthorized(error = "Não autenticado"): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error, code: "UNAUTHORIZED" }, { status: 401 });
}

export function forbidden(error = "Acesso negado"): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error, code: "FORBIDDEN" }, { status: 403 });
}

export function notFound(error = "Recurso não encontrado"): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error, code: "NOT_FOUND" }, { status: 404 });
}

export function conflict(error: string): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error, code: "CONFLICT" }, { status: 409 });
}

export function unprocessable(error: string, details?: unknown): NextResponse<ApiResponse> {
  return NextResponse.json(
    { success: false, error, code: "VALIDATION_ERROR", meta: { details } },
    { status: 422 }
  );
}

export function tooManyRequests(rateLimit: RateLimitResult): NextResponse<ApiResponse> {
  return NextResponse.json(
    { success: false, error: "Muitas requisições. Tente novamente em breve.", code: "RATE_LIMIT" },
    { status: 429, headers: rateLimitHeaders(rateLimit) }
  );
}

export function serverError(error?: string): NextResponse<ApiResponse> {
  return NextResponse.json(
    { success: false, error: error || "Erro interno do servidor", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}

export function paginatedOk<T>(
  data:  T[],
  total: number,
  page:  number,
  limit: number
): NextResponse<ApiResponse<T[]>> {
  return ok(data, {
    pagination: {
      total,
      page,
      limit,
      pages:    Math.ceil(total / limit),
      hasNext:  page * limit < total,
      hasPrev:  page > 1,
    },
  });
}
