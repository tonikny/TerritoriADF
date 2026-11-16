export const TERRAIN_ATTRIBUTION = "© ICGC, MDT 5 m (CC BY 4.0)";

/** Elimina buits i duplicats mantenint l'ordre de les fonts. */
export function uniqueAttributions(values: readonly (string | null | undefined)[]): string[] {
  const attributions = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      attributions.add(value);
    }
  }
  return [...attributions];
}
