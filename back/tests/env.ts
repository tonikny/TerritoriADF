/**
 * Entorn de la suite de tests del backend.
 *
 * `tests/dbPath.ts` (primer import de `vitest.config.ts`) fixa un
 * `TEST_DB_PATH` únic per execució abans que aquest mòdul es carregui. Així
 * `vitest.config.ts` i `globalSetup.ts` calculen el mateix camí encara que
 * s'executin en processos diferents, i dues execucions concurrents no
 * comparteixen fitxer.
 */
const configuredDbPath = process.env.TEST_DB_PATH;
if (!configuredDbPath) {
  throw new Error(
    "TEST_DB_PATH no definit: `tests/dbPath.ts` ha de ser el primer import de vitest.config.ts",
  );
}

export const TEST_DB_PATH = configuredDbPath;

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
