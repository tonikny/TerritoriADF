/** Posició OwnTracks tal com la serveix `GET /api/tracking/positions`. */
export interface Position {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
  battery: number;
  receivedAt: number;
}

/** Resposta de `GET /api/tracking/status`. */
export interface TrackingStatus {
  /** Broker MQTT disponible al backend. */
  available: boolean;
  /** OwnTracks activat per a l'usuari actual. */
  enabled: boolean;
}

/**
 * Configuració `.otrc` d'OwnTracks (`GET /api/tracking/config` i `/enable`).
 * Conté la contrasenya MQTT de l'usuari.
 *
 * És un `type` i no una `interface` perquè també es pugui serialitzar com a
 * `Record<string, unknown>`.
 */
export type OtrcConfig = {
  _type: "configuration";
  auth: boolean;
  username: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  mqttProtocolLevel: number;
  clientId: string;
  pubTopicBase: string;
  monitoring: number;
  locatorDisplacement: number;
  locatorInterval: number;
};
