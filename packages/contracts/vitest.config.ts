import { defineConfig } from "vitest/config";

/**
 * Tests del contracte: funcions pures (conversions OSM i matriu de permisos),
 * sense BD ni xarxa. S'importen directament de `src`, així que no cal haver
 * compilat el paquet.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
