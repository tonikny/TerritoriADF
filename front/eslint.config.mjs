import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import globals from "globals";
import prettier from "eslint-config-prettier";

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

      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
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
);
