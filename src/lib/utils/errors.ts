export class AppError extends Error {
  constructor(
    message: string,
    public readonly code:   string = "APP_ERROR",
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Não autenticado") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Recurso") {
    super(`${resource} não encontrado`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, "VALIDATION_ERROR", 422);
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Muitas requisições") {
    super(message, "RATE_LIMIT", 429);
    this.name = "RateLimitError";
  }
}

export class ModuleDisabledError extends AppError {
  constructor(module: string) {
    super(`Módulo '${module}' não está ativo para esta empresa`, "MODULE_DISABLED", 403);
    this.name = "ModuleDisabledError";
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function isDatabaseError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && "code" in err;
}

export function isDuplicateKeyError(err: unknown): boolean {
  return isDatabaseError(err) && err.code === "23505";
}

export function isForeignKeyError(err: unknown): boolean {
  return isDatabaseError(err) && err.code === "23503";
}
