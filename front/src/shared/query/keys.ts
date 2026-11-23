// Claus de caché de TanStack Query.
//
// Cada dada que depèn de l'ADF porta l'id a la clau: en canviar d'ADF es
// consulta una entrada diferent i una resposta lenta de l'ADF anterior no pot
// trepitjar la de l'actual. Les respostes que depenen de la sessió (observacions
// privades, visibilitat d'incidències) porten a més la signatura del visor, de
// manera que la vista "veure com" no reaprofita dades d'un altre rol.
export const queryKeys = {
  adfs: ["adfs"] as const,
  adfBoundary: (adfId: number | null) => ["adf-boundary", adfId] as const,
  hidrants: (adfId: number | null, viewer: string) => ["hidrants", adfId, viewer] as const,
  incidencies: (adfId: number | null, viewer: string) => ["incidencies", adfId, viewer] as const,
  // El detall també depèn de l'ADF efectiva: la visibilitat d'una `ADF_PRIVADA`
  // es resol contra l'ADF de qui mira, i no s'ha de reutilitzar entre ADFs.
  incidencia: (id: string, adfId: number | null, viewer: string) =>
    ["incidencia", id, adfId, viewer] as const,
};

/** Signatura del visor efectiu (rol i identitat reals, no la vista prèvia). */
export function viewerKey(user: { id: string; role: string } | null): string {
  return user ? `${user.id}:${user.role}` : "anon";
}
