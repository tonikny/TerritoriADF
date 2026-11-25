// Ha de ser el primer import: fixa un TEST_DB_PATH únic per execució abans que
// `env.ts` el llegeixi.
import "./tests/dbPath.js";

import { defineConfig } from "vitest/config";

import { testEnv } from "./tests/env.js";

/**
 * Configuració de la suite del backend.
 *
 * - `app.inject()` sobre `buildApp()`: no s'obre cap port.
 * - BD SQLite temporal única per execució (vegeu `tests/dbPath.ts` i
 *   `tests/globalSetup.ts`): mai la BD de desenvolupament, i mai compartida amb
 *   una altra execució concurrent.
 * - Un sol worker i fitxers en sèrie: tots els fitxers d'una execució
 *   comparteixen la seva BD i cada test la reinicia al `beforeEach` (vegeu
 *   `tests/helpers/db.ts`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/globalSetup.ts"],
    env: testEnv,
    fileParallelism: false,
    sequence: { concurrent: false },
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      // Scripts d'operació i el punt d'entrada no formen part de la superfície
      // que es prova; `types.ts` només té tipus (0 % executable).
      exclude: ["src/scripts/**", "src/server.ts", "src/types.ts"],
      // Ratchet per sota de la mesura actual (~82 % línies): pot apujar-se, però
      // no ha de baixar sense justificar-ho. Les zones sense xarxa són el stream
      // SSE de tracking i els scripts d'operació.
      thresholds: {
        statements: 80,
        branches: 68,
        functions: 83,
        lines: 80,
      },
    },
  },
});
