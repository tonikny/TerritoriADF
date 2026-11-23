import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import globals from "globals";
import prettier from "eslint-config-prettier";

/**
 * `../` prohibit a tot `src`: els imports creuats es fan amb l'àlies `@/...`
 * (vegeu `tsconfig.json`). Sense aquesta regla, un import relatiu podria
 * saltar-se qualsevol de les fronteres de capa de sota.
 */
const noParentImports = {
  group: ["../**"],
  message: "Fes servir l'àlies `@/...` en lloc d'un import amb `../` (vegeu tsconfig.json).",
};

/**
 * Fronteres entre capes: cada capa només pot dependre de les de sota.
 *
 * S'usa `@typescript-eslint/no-restricted-imports` i no la regla del nucli
 * perquè els blocs d'aïllament dels motors (més avall) ja defineixen
 * `no-restricted-imports`: en la configuració plana, dos blocs amb la mateixa
 * clau es trepitgen i només guanya el darrer.
 *
 * Cada bloc hi inclou `noParentImports` perquè el darrer bloc que defineix la
 * regla és el que compta: un bloc de capa sense la prohibició de `../` la
 * desactivaria en aquella capa.
 */
const LAYER_BOUNDARIES = [
  {
    files: "src/utils/**/*.{ts,tsx}",
    forbid: ["@/components/**", "@/contexts/**", "@/hooks/**", "@/map/**"],
    message: "utils/ no pot dependre de la UI, dels contexts, dels hooks ni del mapa.",
  },
  {
    files: "src/shared/**/*.{ts,tsx}",
    forbid: ["@/components/**", "@/contexts/**", "@/hooks/**", "@/map/**"],
    message: "shared/ no pot dependre de components, contexts, hooks ni map.",
  },
  {
    files: "src/map/**/*.{ts,tsx}",
    forbid: ["@/components/**", "@/contexts/**", "@/hooks/**", "@/shared/**"],
    message: "La capa de mapa no pot dependre de la UI, dels contexts, dels hooks ni de shared/.",
  },
  {
    files: "src/hooks/**/*.{ts,tsx}",
    forbid: ["@/components/**"],
    message: "Els hooks no poden importar components: seria un cicle vista → hook → vista.",
  },
  {
    files: "src/contexts/**/*.{ts,tsx}",
    forbid: ["@/components/**", "@/hooks/**"],
    message: "Els contexts no poden dependre de components ni de hooks.",
  },
  {
    files: "src/components/**/*.{ts,tsx}",
    forbid: ["@/map/engines/**"],
    message: "No importis un motor directament: fes servir MapSurface o engines/registry.",
  },
].map(({ files, forbid, message }) => ({
  files: [files],
  rules: {
    "@typescript-eslint/no-restricted-imports": [
      "error",
      { patterns: [noParentImports, { group: forbid, message }] },
    ],
  },
}));

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "eslint.config.mjs"],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  prettier,

  {
    files: ["**/*.{ts,tsx}"],

    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },

      globals: globals.browser,
    },

    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh.plugin,
    },

    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.vite().rules,

      eqeqeq: "error",
      curly: "error",
      "prefer-const": "error",
      "no-var": "error",
      "no-console": "warn",

      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // N-17: el front tampoc no pot reintroduir `any` implícits des de `fetch` o
  // `JSON.parse`; cada component declara la forma que rep abans de fer-la servir.
  {
    files: ["src/**/*.{ts,tsx}"],

    rules: {
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },

  // Aïllament dels motors: cap tipus ni API de tercers fora del seu adaptador.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/map/engines/leaflet/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["leaflet", "leaflet/*", "react-leaflet"],
              message: "Leaflet només es pot importar dins de src/map/engines/leaflet.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/map/engines/maplibre/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["maplibre-gl", "maplibre-gl/*", "@vis.gl/react-maplibre"],
              message: "MapLibre només es pot importar dins de src/map/engines/maplibre.",
            },
          ],
        },
      ],
    },
  },

  // Profunditat per als fitxers que no són de cap capa (App, types, styles).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: [noParentImports] }],
    },
  },

  ...LAYER_BOUNDARIES,
);
