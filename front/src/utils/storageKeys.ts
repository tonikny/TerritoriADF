// Claus de localStorage de l'aplicació: un sol prefix per a totes.

const PREFIX = "territoriadf_";

/** Clau amb el prefix actual: `storageKey('map_pos')` → `territoriadf_map_pos`. */
export const storageKey = (name: string) => `${PREFIX}${name}`;
