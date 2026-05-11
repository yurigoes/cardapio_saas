#!/usr/bin/env node
/**
 * Gera secrets seguros para o .env
 * Uso: node scripts/generate-secrets.js
 */

const { randomBytes } = require("crypto");

function genBase64(bytes = 64) {
  return randomBytes(bytes).toString("base64");
}

function genHex(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

console.log("\n# Cole estas variáveis no seu .env:");
console.log("# ─────────────────────────────────────");
console.log(`JWT_SECRET=${genBase64(64)}`);
console.log(`JWT_REFRESH_SECRET=${genBase64(64)}`);
console.log(`ENCRYPTION_KEY=${genHex(32)}`);
console.log(`DB_PASSWORD=${genBase64(24).replace(/[+/=]/g, "x")}`);
console.log(`REDIS_PASSWORD=${genBase64(24).replace(/[+/=]/g, "x")}`);
console.log("# ─────────────────────────────────────\n");
