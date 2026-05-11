/**
 * logger.ts — Logger centralizado do print-agent
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
      filename:  "/var/log/print-agent/error.log",
      level:     "error",
      maxsize:   5 * 1024 * 1024,
      maxFiles:  3,
      tailable:  true,
    }),
  ],
});
