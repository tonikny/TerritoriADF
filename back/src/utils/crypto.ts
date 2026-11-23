// Xifrat aes-256-gcm per guardar contrasenyes MQTT a la DB de forma segura.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { config } from "./config.js";

const ALGORITHM = "aes-256-gcm";
const key = createHash("sha256").update(config.ENCRYPTION_SECRET).digest();

/** Xifra un text en clar. Retorna format "iv:authTag:encrypted" (hex). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${enc}`;
}

/** Desxifra. Retorna null si la clau ha canviat o el format és invàlid. */
export function decrypt(encrypted: string): string | null {
  try {
    const [ivHex, authTagHex, enc] = encrypted.split(":");
    if (ivHex === undefined || authTagHex === undefined || enc === undefined) {
      return null;
    }
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    return decipher.update(enc, "hex", "utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}
