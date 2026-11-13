import { v4 as uuidv4 } from "uuid";
import {
  IncidenciesRepository,
  canView,
  type Viewer,
} from "../db/repositories/incidenciesRepository.js";
import type {
  Incidencia,
  IncidenciaEvent,
  TipusEvent,
  IncidenciaEstat,
  IncidenciaPrioritat,
  IncidenciaPrecisio,
  IncidenciaVisibilitat,
} from "../types.js";
import { NotFoundError } from "../errors.js";
import { sendTelegramMessage } from "../utils/telegram.js";
import { sendToAdf } from "./telegramService.js";

function escapeHtml(text: string | undefined): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type EventDades = {
  nou?: string;
  anterior?: string;
  nova?: { lat: number; lon: number; precisio: IncidenciaPrecisio };
  comentari?: string;
};

export const IncidenciesService = {
  getIncidencies(adfId?: number, includeClosed: boolean = false) {
    return IncidenciesRepository.findAll(adfId, includeClosed);
  },

  getIncidenciesGeoJson(adfId?: number, includeClosed: boolean = false, viewer: Viewer = null) {
    const rows = IncidenciesRepository.findAll(adfId, includeClosed, viewer);
    const features = rows.map((row) => ({
      type: "Feature",
      id: row.id,
      geometry: {
        type: "Point",
        coordinates: [row.lon, row.lat],
      },
      properties: {
        ...row,
      },
    }));

    return {
      type: "FeatureCollection",
      features,
    };
  },

  getIncidenciaById(id: string, viewer: Viewer = null) {
    const incidencia = IncidenciesRepository.findById(id);
    if (!incidencia) {
      throw new NotFoundError("Incidència no trobada");
    }
    if (!canView(incidencia, viewer)) {
      throw new NotFoundError("Incidència no trobada");
    }

    const events = IncidenciesRepository.getEvents(id);
    // Parsear JSON de dades per a cada event
    const parsedEvents = events.map((e) => ({
      ...e,
      dades: JSON.parse(e.dades || "{}"),
    }));

    return {
      ...incidencia,
      events: parsedEvents,
    };
  },

  createIncidencia(data: {
    titol: string;
    tipus: string;
    prioritat?: IncidenciaPrioritat;
    visibilitat?: IncidenciaVisibilitat;
    lat: number;
    lon: number;
    precisio?: IncidenciaPrecisio;
    adf_id: number;
    usuari_id: string;
    nom_usuari?: string;
    comentari?: string;
    clientBaseUrl?: string;
  }) {
    const incidenciaId = uuidv4();
    const eventId = uuidv4();
    const timestamp = new Date().toISOString();
    const nomUsuari = data.nom_usuari || data.usuari_id;

    const incidencia: Incidencia = {
      id: incidenciaId,
      titol: data.titol,
      tipus: data.tipus,
      estat: "OBERT",
      prioritat: data.prioritat || "MITJANA",
      adf_id: data.adf_id,
      lat: data.lat,
      lon: data.lon,
      precisio: data.precisio || "EXACTA",
      visibilitat: data.visibilitat || "ADF_PRIVADA",
      creat_at: timestamp,
      actualitzat_at: timestamp,
    };

    const event: IncidenciaEvent = {
      id: eventId,
      incidencia_id: incidenciaId,
      usuari_id: data.usuari_id,
      tipus_event: "CREACIO",
      dades: JSON.stringify({
        titol: data.titol,
        tipus: data.tipus,
        prioritat: incidencia.prioritat,
        lat: data.lat,
        lon: data.lon,
        precisio: incidencia.precisio,
        comentari: data.comentari,
      }),
      creat_at: timestamp,
    };

    IncidenciesRepository.createIncidencia(incidencia, event);

    // Notificació Telegram
    const emojiPrioritat =
      incidencia.prioritat === "ALTA" ? "🔴" : incidencia.prioritat === "MITJANA" ? "🟠" : "🟢";
    const appUrl = data.clientBaseUrl
      ? `${data.clientBaseUrl}/?adf=${incidencia.adf_id}&node=${incidencia.id}`
      : null;

    const msg = `⚠️ <b>NOVA INCIDÈNCIA</b>
${emojiPrioritat} <b>${escapeHtml(incidencia.titol)}</b>
🏷️ Tipus: ${escapeHtml(incidencia.tipus)}
${appUrl ? `📍 <a href="${appUrl}">Veure a l'aplicació</a>` : ""}
📍 Ubicació: <code>${incidencia.lat}, ${incidencia.lon}</code> (${incidencia.precisio})
💬 Comentari: ${escapeHtml(data.comentari || "(cap)")}
👤 Creat per: ${escapeHtml(nomUsuari)}
`;
    void sendTelegramMessage(msg);
    // Igual que als hidrants, notifiquem també el grup de Telegram de l'ADF
    void sendToAdf(data.adf_id, msg);

    return incidencia;
  },

  addEvent(
    incidenciaId: string,
    usuariId: string,
    nomUsuari: string,
    tipusEvent: TipusEvent,
    dades: EventDades,
    clientBaseUrl?: string,
  ) {
    const incidencia = IncidenciesRepository.findById(incidenciaId);
    if (!incidencia) {
      throw new NotFoundError("Incidència no trobada");
    }

    const eventId = uuidv4();
    const timestamp = new Date().toISOString();
    const displayUser = nomUsuari || usuariId;

    const event: IncidenciaEvent = {
      id: eventId,
      incidencia_id: incidenciaId,
      usuari_id: usuariId,
      tipus_event: tipusEvent,
      dades: JSON.stringify(dades),
      creat_at: timestamp,
    };

    const updates: Partial<Incidencia> = {};
    let msgTelegram = "";

    const appUrl = clientBaseUrl
      ? `${clientBaseUrl}/?adf=${incidencia.adf_id}&node=${incidenciaId}`
      : null;
    const linkHtml = appUrl ? `\n📍 <a href="${appUrl}">Veure a l'aplicació</a>` : "";

    if (tipusEvent === "CANVI_ESTAT" && dades.nou) {
      updates.estat = dades.nou as IncidenciaEstat;
      msgTelegram = `🔄 <b>CANVI D'ESTAT</b>
📌 Incidència: ${escapeHtml(incidencia.titol)}
📉 Estat: ${escapeHtml(dades.anterior)} ➡️ <b>${escapeHtml(dades.nou)}</b>
👤 Per: ${escapeHtml(displayUser)}${linkHtml}`;
    } else if (tipusEvent === "CANVI_TIPUS" && dades.nou) {
      updates.tipus = dades.nou as string;
      msgTelegram = `🏷️ <b>CANVI DE TIPUS</b>
📌 Incidència: ${escapeHtml(incidencia.titol)}
🆕 Tipus: ${escapeHtml(dades.anterior)} ➡️ <b>${escapeHtml(dades.nou)}</b>
👤 Per: ${escapeHtml(displayUser)}${linkHtml}`;
    } else if (tipusEvent === "CANVI_PRIORITAT" && dades.nou) {
      updates.prioritat = dades.nou as IncidenciaPrioritat;
      msgTelegram = `🎯 <b>CANVI DE PRIORITAT</b>
📌 Incidència: ${escapeHtml(incidencia.titol)}
🔻 Prioritat: ${escapeHtml(dades.anterior)} ➡️ <b>${escapeHtml(dades.nou)}</b>
👤 Per: ${escapeHtml(displayUser)}${linkHtml}`;
    } else if (tipusEvent === "CANVI_PRECISIO" && dades.nou) {
      updates.precisio = dades.nou as IncidenciaPrecisio;
      msgTelegram = `🎯 <b>CANVI DE PRECISIÓ</b>
📌 Incidència: ${escapeHtml(incidencia.titol)}
📍 Precisió: ${escapeHtml(dades.anterior)} ➡️ <b>${escapeHtml(dades.nou)}</b>
👤 Per: ${escapeHtml(displayUser)}${linkHtml}`;
    } else if (tipusEvent === "CANVI_VISIBILITAT" && dades.nou) {
      updates.visibilitat = dades.nou as IncidenciaVisibilitat;
      msgTelegram = `👁️ <b>CANVI DE VISIBILITAT</b>
📌 Incidència: ${escapeHtml(incidencia.titol)}
🔭 Visibilitat: ${escapeHtml(dades.anterior)} ➡️ <b>${escapeHtml(dades.nou)}</b>
👤 Per: ${escapeHtml(displayUser)}${linkHtml}`;
    } else if (tipusEvent === "CANVI_UBICACIO" && dades.nova) {
      updates.lat = dades.nova.lat;
      updates.lon = dades.nova.lon;
      updates.precisio = dades.nova.precisio;
      msgTelegram = `📍 <b>CANVI D'UBICACIÓ</b>
📌 Incidència: ${escapeHtml(incidencia.titol)}
🆕 Nova posició: <code>${updates.lat}, ${updates.lon}</code>
👤 Per: ${escapeHtml(displayUser)}${linkHtml}`;
    } else if (tipusEvent === "OBSERVACIO") {
      msgTelegram = `💬 <b>NOVA OBSERVACIÓ</b>
📌 Incidència: ${escapeHtml(incidencia.titol)}
📝 ${escapeHtml(dades.comentari)}
👤 Per: ${escapeHtml(displayUser)}${linkHtml}`;
    }

    IncidenciesRepository.addEvent(event, updates);

    if (msgTelegram) {
      void sendTelegramMessage(msgTelegram);
      // Les edicions també han d'arribar al grup de Telegram de l'ADF
      if (incidencia.adf_id) {
        void sendToAdf(incidencia.adf_id, msgTelegram);
      }
    }

    return event;
  },
};
