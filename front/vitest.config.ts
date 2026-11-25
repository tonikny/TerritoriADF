import { defineConfig, mergeConfig } from "vitest/config";
import type { ConfigEnv } from "vite";

import viteConfigFactory from "./vite.config.ts";

/**
 * Configuració de la suite del front.
 *
 * S'estén `vite.config.ts` perquè els tests heretin l'àlies `@/` i la resta de
 * resolució del build: duplicar-ho aquí faria que tests i aplicació resolguessin
 * coses diferents.
 *
 * `coverage.include` fixa la superfície a `src/**`: sense això, el percentatge
 * només comptaria els mòduls que algun test ha carregat i un fitxer gran sense
 * tests no baixaria el número. Només queden fora el punt d'entrada, els tipus
 * d'entorn i els propis tests. El llindar és un ratchet: pot pujar-se, però no
 * ha de baixar sense justificar-ho.
 *
 * `reporter: ["text"]` com al back: el CI llegeix el resum del log i no es
 * generen artefactes (`coverage/`) al disc.
 *
 * `vite.config.ts` és una funció de `ConfigEnv` i `mergeConfig` no la sabria
 * combinar, així que es resol abans amb l'entorn de Vitest (`mode: "test"`):
 * és el que fa que `vite-plugin-mkcert`, que només va al servidor de dev, no es
 * carregui aquí ni intenti baixar res de GitHub.
 */
const configEnv: ConfigEnv = {
  command: "serve",
  mode: "test",
  isSsrBuild: false,
  isPreview: false,
};

const viteConfig =
  typeof viteConfigFactory === "function" ? viteConfigFactory(configEnv) : viteConfigFactory;

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        reporter: ["text"],
        include: ["src/**/*.{ts,tsx}"],
        // El punt d'entrada només munta l'arrel i importa CSS; `vite-env.d.ts`
        // i els tests no són codi de l'aplicació.
        exclude: ["src/main.tsx", "src/vite-env.d.ts", "src/**/*.test.{ts,tsx}"],
        thresholds: {
          statements: 18,
          branches: 13,
          functions: 17,
          lines: 18,
        },
      },
    },
  }),
);
