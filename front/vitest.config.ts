import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

/**
 * Configuració de la suite del front.
 *
 * S'estén `vite.config.ts` perquè els tests heretin l'àlies `@/` i la resta de
 * resolució del build: duplicar-ho aquí faria que tests i aplicació resolguessin
 * coses diferents.
 *
 * La cobertura de V8 només compta els mòduls que els tests carreguen. El llindar
 * és un ratchet: pot pujar-se, però no ha de baixar sense justificar-ho.
 *
 * `reporter: ["text"]` com al back: el CI llegeix el resum del log i no es
 * generen artefactes (`coverage/`) al disc.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        reporter: ["text"],
        thresholds: {
          statements: 52,
          branches: 45,
          functions: 42,
          lines: 52,
        },
      },
    },
  }),
);
