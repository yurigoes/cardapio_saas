import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY não definida");

  // Normaliza para 32 bytes (AES-256)
  return createHash("sha256").update(key).digest();
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv  = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Formato: iv:tag:encrypted (base64)
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(encryptedData: string): string {
  const [ivBase64, tagBase64, encryptedBase64] = encryptedData.split(":");

  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Formato de dados criptografados inválido");
  }

  const key       = getKey();
  const iv        = Buffer.from(ivBase64,        "base64");
  const tag       = Buffer.from(tagBase64,       "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

export function encryptIfNeeded(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

export function decryptIfNeeded(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}
