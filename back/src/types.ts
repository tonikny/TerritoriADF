// Els tipus compartits amb el frontend viuen a `@territoriadf/contracts`
// (font única: esquemes Zod, enums, entitats i conversions OSM). Aquest mòdul
// només manté els noms que el backend ja importava.
export type {
  Incidencia,
  IncidenciaEstat,
  // Fila de `incidencia_events`: `dades` ja ve tipat per l'esquema de la columna.
  IncidenciaEventRow as IncidenciaEvent,
  IncidenciaPrecisio,
  IncidenciaPrioritat,
  IncidenciaVisibilitat,
  TipusEvent,
} from "@territoriadf/contracts/incidencies";
