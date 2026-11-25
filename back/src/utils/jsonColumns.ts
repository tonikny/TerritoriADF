import {
  hidrantServiceTagsSchema,
  hidrantOsmTagsSchema,
  hidrantSyncErrorSchema,
  type HidrantOsmTags,
  type HidrantServiceTags,
  type HidrantSyncError,
} from "@territoriadf/contracts/hidrants";
import {
  incidenciaEventDadesSchema,
  type IncidenciaEventDades,
} from "@territoriadf/contracts/incidencies";
import type { z } from "zod";

import { logger } from "./logger.js";

/**
 * Validació de les columnes JSON en llegir-les.
 *
 * Drizzle les deserialitza (`text(..., { mode: "json" })`), però això només
 * garanteix que el text és JSON: no que tingui la forma que el codi espera. Una
 * fila escrita a mà (o per una versió antiga) pot ser un JSON vàlid d'una altra
 * forma. Aquí es valida amb l'esquema del contracte i, si no encaixa, es registra
 * l'error i es descarta el valor: la corrupció ha de ser visible al log i a
 * `npm run db:check`, no convertir-se en dades vàlides buides en silenci.
 */
const log = logger.child({ module: "db", operation: "json" });

function parseColumn<T>(
  schema: z.ZodType<T>,
  value: unknown,
  column: string,
  rowId: string | null,
): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    log.error(
      { column, rowId, issues: result.error.issues },
      "Columna JSON amb una forma inesperada: es descarta el valor",
    );
    return null;
  }
  return result.data;
}

export function parseOsmTags(
  value: unknown,
  rowId: string | null = null,
  column = "osm_tags",
): HidrantOsmTags | null {
  return parseColumn(hidrantOsmTagsSchema, value, column, rowId);
}

export function parseServiceTags(
  value: unknown,
  rowId: string | null = null,
): HidrantServiceTags | null {
  return parseColumn(hidrantServiceTagsSchema, value, "service_tags", rowId);
}

export function parseSyncError(
  value: unknown,
  rowId: string | null = null,
): HidrantSyncError | null {
  return parseColumn(hidrantSyncErrorSchema, value, "sync_error", rowId);
}

export function parseEventDades(
  value: unknown,
  eventId: string | null = null,
): IncidenciaEventDades | null {
  return parseColumn(incidenciaEventDadesSchema, value, "dades", eventId);
}
