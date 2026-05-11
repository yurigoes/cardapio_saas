/**
 * logger.ts — Logger centralizado com Winston
 */

import { createLogger, format, transports } from "winston";

export const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0
        ? " " + JSON.stringify(meta)
        : "";
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename:  process.env.LOG_FILE || "/var/log/sync-agent/error.log",
      level:     "error",
      maxsize:   10 * 1024 * 1024,   // 10MB
      maxFiles:  5,
      tailable:  true,
    }),
    new transports.File({
      filename: process.env.LOG_FILE_COMBINED || "/var/log/sync-agent/combined.log",
      maxsize:  10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});
