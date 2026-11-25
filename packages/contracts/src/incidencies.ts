import { z } from "zod";

// --- Enums (Zod és la font única: valida al backend i tipa al frontend) ---

// L'estat no valida cap entrada (els canvis d'estat arriben com a text a
// `dades.nou` de l'esdeveniment), així que no té esquema Zod.
export type IncidenciaEstat = "OBERT" | "EN_PROGRES" | "RESOLT" | "TANCAT";

const INCIDENCIA_PRIORITATS = ["BAIXA", "MITJANA", "ALTA"] as const;
export const incidenciaPrioritatSchema = z.enum(INCIDENCIA_PRIORITATS);
export type IncidenciaPrioritat = z.infer<typeof incidenciaPrioritatSchema>;

const INCIDENCIA_PRECISIONS = ["DESCONEGUDA", "MUNICIPI", "AREA", "EXACTA"] as const;
export const incidenciaPrecisioSchema = z.enum(INCIDENCIA_PRECISIONS);
export type IncidenciaPrecisio = z.infer<typeof incidenciaPrecisioSchema>;

const INCIDENCIA_VISIBILITATS = ["PUBLICA", "TOTES_ADFS", "ADF_PRIVADA"] as const;
export const incidenciaVisibilitatSchema = z.enum(INCIDENCIA_VISIBILITATS);
export type IncidenciaVisibilitat = z.infer<typeof incidenciaVisibilitatSchema>;

const TIPUS_EVENTS = [
  "CREACIO",
  "CANVI_ESTAT",
  "CANVI_TIPUS",
  "CANVI_PRIORITAT",
  "CANVI_PRECISIO",
  "CANVI_VISIBILITAT",
  "OBSERVACIO",
  "CANVI_UBICACIO",
  "MULTIMEDIA",
  "ASSIGNACIO",
] as const;
export const tipusEventSchema = z.enum(TIPUS_EVENTS);
export type TipusEvent = z.infer<typeof tipusEventSchema>;

// --- Entitats ---

export interface Incidencia {
  id: string;
  titol: string;
  tipus: string;
  estat: IncidenciaEstat;
  prioritat: IncidenciaPrioritat;
  adf_id: number | null;
  lat: number;
  lon: number;
  precisio: IncidenciaPrecisio;
  visibilitat: IncidenciaVisibilitat;
  creat_at: string;
  actualitzat_at: string;
}

/**
 * Contingut de `incidencia_events.dades`: camps coneguts més qualsevol camp
 * addicional que encara no s'ha formalitzat (multimèdia, assignacions...).
 * L'esquema valida l'entrada de l'API i la columna JSON de la BD.
 */
export const incidenciaEventDadesSchema = z
  .object({
    comentari: z.string().optional(),
    anterior: z.string().optional(),
    nou: z.string().optional(),
    nova: z
      .object({
        lat: z.number().finite(),
        lon: z.number().finite(),
        precisio: incidenciaPrecisioSchema,
      })
      .optional(),
    observador: z.string().optional(),
    orientacio: z.number().optional(),
    distancia_m: z.number().optional(),
    url: z.string().optional(),
    titol: z.string().optional(),
    // `CREACIO` hi desa el tipus d'incidència ("FOC", "ALTRE"...); `MULTIMEDIA`,
    // el format del fitxer ("imatge"/"video"). Per això no és un enum tancat.
    tipus: z.string().optional(),
  })
  .catchall(z.unknown());
export type IncidenciaEventDades = z.infer<typeof incidenciaEventDadesSchema>;

/** Fila de `incidencia_events`: `dades` ja ve tipat per l'esquema de la columna. */
export interface IncidenciaEventRow {
  id: string;
  incidencia_id: string;
  usuari_id: string | null;
  /** Camp virtual del join amb usuaris. */
  nom_usuari?: string;
  tipus_event: TipusEvent;
  dades: IncidenciaEventDades;
  creat_at: string;
}

/** Forma que retorna l'API (la mateixa que la fila). */
export type IncidenciaEvent = IncidenciaEventRow;

// --- GeoJSON ---

export interface IncidenciaFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: Incidencia;
}
