import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

/**
 * Entorn de la suite de tests del backend.
 *
 * La BD és un fitxer temporal i el nom és determinista a partir del directori
 * del projecte: `vitest.config.ts` i `globalSetup.ts` poden executar-se en
 * processos diferents i han de calcular exactament el mateix camí. Cada clon
 * del repositori obté un fitxer diferent.
 */
const projectHash = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 8);

export const TEST_DB_PATH =
  process.env.TEST_DB_PATH ?? path.join(os.tmpdir(), `territoriadf-vitest-${projectHash}.db`);

/**
 * Variables que `config.ts` exigeix (o que canvien el comportament) i que la
 * suite ha de fixar per no dependre de `back/.env`. Els secrets són dummies:
 * no surten mai del procés de test.
 */
export const testEnv: Record<string, string> = {
  NODE_ENV: "test",
  DB_PATH: TEST_DB_PATH,
  JWT_SECRET: "test-jwt-secret-territoriadf-0123456789",
  ENCRYPTION_SECRET: "test-encryption-secret-territoriadf-0123456789",
  MQTT_ADMIN_PASSWORD: "test-admin-password",
  MQTT_BACKEND_PASSWORD: "test-backend-password",
  FASTIFY_LOGLEVEL: "silent",
  TRUST_PROXY: "false",
  BASE_DOMAIN_URL: "localhost",
  // Buits a propòsit: cap test ha de sortir a la xarxa (OSM, Telegram).
  OSM_ACCESS_TOKEN: "",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",
};
