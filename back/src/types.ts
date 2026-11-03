/* eslint-disable @typescript-eslint/no-explicit-any -- adapter Express simplificat, tipejar tot seria cerimònia */
import type { FastifyBaseLogger } from "fastify";

export type ApiRequest = {
  method: string;
  query?: any;
  body?: any;
  headers?: any;
  params?: any;
  url?: string;
  /** IP del client (real només si `TRUST_PROXY=true`); per als límits de login. */
  ip?: string;
  log: FastifyBaseLogger;
  user?: {
    id: string;
    username: string;
    adf_id: number | null;
    role: string;
  };
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
  send: (data: any) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
  _userToSign?: { id: string; username: string; adf_id: number | null; role: string };
  _clearCookie?: boolean;
};

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

// --- Incidències ---

export type IncidenciaEstat = "OBERT" | "EN_PROGRES" | "RESOLT" | "TANCAT";
export type IncidenciaPrioritat = "BAIXA" | "MITJANA" | "ALTA";
export type IncidenciaPrecisio = "DESCONEGUDA" | "MUNICIPI" | "AREA" | "EXACTA";
export type IncidenciaVisibilitat = "PUBLICA" | "TOTES_ADFS" | "ADF_PRIVADA";

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

export type TipusEvent =
  | "CREACIO"
  | "CANVI_ESTAT"
  | "CANVI_TIPUS"
  | "CANVI_PRIORITAT"
  | "CANVI_PRECISIO"
  | "CANVI_VISIBILITAT"
  | "OBSERVACIO"
  | "CANVI_UBICACIO"
  | "MULTIMEDIA"
  | "ASSIGNACIO";

export interface IncidenciaEvent {
  id: string;
  incidencia_id: string;
  usuari_id: string | null;
  nom_usuari?: string; // Camp virtual del join amb usuaris
  tipus_event: TipusEvent;
  dades: string; // JSON string
  creat_at: string;
}

// Estructures per al camp 'dades' dels events
export interface EventDataCreacio {
  titol: string;
  tipus: string;
  prioritat: IncidenciaPrioritat;
  lat: number;
  lon: number;
  precisio: IncidenciaPrecisio;
  comentari?: string;
}

export interface EventDataCanviEstat {
  anterior: IncidenciaEstat;
  nou: IncidenciaEstat;
}

export interface EventDataCanviTipus {
  anterior: string;
  nou: string;
}

export interface EventDataCanviUbicacio {
  anterior: { lat: number; lon: number; precisio: IncidenciaPrecisio };
  nova: { lat: number; lon: number; precisio: IncidenciaPrecisio };
}

export interface EventDataObservacio {
  observador?: string;
  comentari: string;
  orientacio?: number;
  distancia_m?: number;
}

export interface EventDataMultimedia {
  titol?: string;
  url: string;
  tipus: "imatge" | "video";
}
