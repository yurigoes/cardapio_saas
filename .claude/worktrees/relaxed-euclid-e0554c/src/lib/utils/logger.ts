type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level:     LogLevel;
  message:   string;
  timestamp: string;
  context?:  Record<string, unknown>;
  error?:    string;
  stack?:    string;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

const MIN_LEVEL = (process.env.LOG_LEVEL || "info") as LogLevel;
const IS_JSON   = process.env.LOG_FORMAT === "json" || process.env.NODE_ENV === "production";
const IS_DEV    = process.env.NODE_ENV === "development";

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  if (IS_JSON) {
    return JSON.stringify(entry);
  }

  const colors: Record<LogLevel, string> = {
    debug: "\x1b[36m",   // cyan
    info:  "\x1b[32m",   // green
    warn:  "\x1b[33m",   // yellow
    error: "\x1b[31m",   // red
  };

  const reset  = "\x1b[0m";
  const color  = colors[entry.level];
  const prefix = `${color}[${entry.level.toUpperCase()}]${reset}`;
  const ctx    = entry.context ? ` ${JSON.stringify(entry.context)}` : "";

  return `${entry.timestamp} ${prefix} ${entry.message}${ctx}`;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>, err?: Error): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  };

  if (err) {
    entry.error = err.message;
    if (IS_DEV) entry.stack = err.stack;
  }

  const formatted = formatEntry(entry);

  if (level === "error") {
    console.error(formatted);
  } else if (level === "warn") {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log("debug", msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => log("info",  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log("warn",  msg, ctx),
  error: (msg: string, err?: Error, ctx?: Record<string, unknown>) => log("error", msg, ctx, err),

  request: (method: string, path: string, status: number, ms: number) => {
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    log(level, `${method} ${path}`, { status, duration_ms: ms });
  },
};
