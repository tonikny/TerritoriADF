import { defineConfig } from "vitest/config";

import { testEnv } from "./tests/env.js";

/**
 * Configuració de la suite del backend.
 *
 * - `app.inject()` sobre `buildApp()`: no s'obre cap port.
 * - BD SQLite temporal (vegeu `tests/env.ts` i `tests/globalSetup.ts`): mai la
 *   BD de desenvolupament.
 * - Un sol worker i fitxers en sèrie: la BD és compartida i cada test la
 *   reinicia al `beforeEach` (vegeu `tests/helpers/db.ts`).
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
      // Ratchet per sobre de l'objectiu del 50 % de domini (mesura actual:
      // ~61 % línies). Pot apujar-se, però no ha de baixar sense justificar-ho.
      thresholds: {
        statements: 55,
        branches: 45,
        functions: 60,
        lines: 55,
      },
    },
  },
});
