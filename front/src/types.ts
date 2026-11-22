// Els tipus compartits amb el backend viuen a `@territoriadf/contracts`: allà
// hi ha els esquemes Zod que els validen. Aquí només queden els tipus propis
// de la UI.
export type {
  Incidencia,
  IncidenciaEstat,
  IncidenciaEvent,
  IncidenciaFeature,
  IncidenciaPrecisio,
  IncidenciaPrioritat,
} from "@territoriadf/contracts/incidencies";

export type CreateType = "selection" | "hydrant" | "incidencia" | null;
