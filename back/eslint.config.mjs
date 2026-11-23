import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "coverage", "eslint.config.mjs", "drizzle.config.ts"],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  prettier,

  {
    files: ["**/*.ts"],

    languageOptions: {
      parserOptions: {
        // Inclou `src`, `tests` i la config de Vitest: si el projecte només
        // apuntés a `src`, ESLint no podria analitzar els fitxers de test.
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },

      globals: globals.node,
    },

    rules: {
      eqeqeq: "error",
      curly: "error",
      "prefer-const": "error",
      "no-var": "error",
      "no-console": "error",

      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // N-17: ni el codi ni els tests poden reintroduir `any` implícits des de
  // `JSON.parse`, `request.body` o respostes d'inject; cada lloc declara la
  // forma que espera abans de fer-la servir.
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],

    rules: {
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },
);
