import bcrypt from "bcryptjs";

import { db } from "../../src/db/index.js";
import {
  accessTokens,
  adfs,
  hidrants,
  incidencia_events,
  incidencies,
  mqttUsers,
  telegramBots,
  telegramLinks,
  users,
} from "../../src/db/schema.js";

/**
 * Barrera de seguretat: si la config de Vitest no hagués aplicat `DB_PATH`,
 * `src/db/index.ts` apuntaria a `back/data/territoriadf.db` i `resetWorld()`
 * esborraria la BD real. Millor fallar el test que tocar dades de desenvolupament.
 */
const configuredDbPath = process.env.DB_PATH;
if (!configuredDbPath || !configuredDbPath.includes("territoriadf-vitest")) {
  throw new Error(
    "La suite necessita DB_PATH apuntant a una BD temporal `territoriadf-vitest-*`; " +
      `valor actual: ${configuredDbPath ?? "(sense definir)"}`,
  );
}

/** Contrasenya única de tots els usuaris de test. */
export const TEST_PASSWORD = "ProvaSegura123";

/**
 * Cost baix (4) a propòsit: el login compara contra aquest hash i la suite fa
 * desenes de logins. El cost real de producció (10) es prova indirectament
 * amb el hash sintètic del login, no cal pagar-lo a cada test.
 */
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

/** IDs estables: les cookies de sessió segueixen sent vàlides després de cada reset. */
export const ADMIN_ID = "user-admin";
export const COORD_278_ID = "user-coord-278";
export const VOL_278_ID = "user-vol-278";
export const COORD_279_ID = "user-coord-279";

export const ADF_278 = 278;
export const ADF_279 = 279;

/**
 * Buida totes les taules en ordre fill → pare. `foreign_keys` està actiu a la
 * connexió de test, així que l'ordre importa. Només es crida dins la transacció
 * de `resetWorld()`.
 */
function clearTables(): void {
  db.delete(incidencia_events).run();
  db.delete(incidencies).run();
  db.delete(accessTokens).run();
  db.delete(mqttUsers).run();
  db.delete(telegramLinks).run();
  db.delete(telegramBots).run();
  db.delete(hidrants).run();
  db.delete(users).run();
  db.delete(adfs).run();
}

export function createAdf(id: number, nom = `ADF Prova ${id}`, boundary: string | null = null) {
  db.insert(adfs)
    .values({
      id,
      nom,
      osm_relations: JSON.stringify([`R${id}`]),
      boundary_geojson: boundary,
    })
    .run();
}

export function createUser(options: {
  id: string;
  username: string;
  role: "admin" | "coordinador" | "voluntari";
  adfId: number | null;
  tokenVersion?: number;
}): void {
  db.insert(users)
    .values({
      id: options.id,
      username: options.username,
      password_hash: TEST_PASSWORD_HASH,
      role: options.role,
      adf_id: options.adfId,
      token_version: options.tokenVersion ?? 0,
    })
    .run();
}

/** Dues ADFs, un admin i un coordinador/voluntari per ADF. */
export function seedStandardWorld(): void {
  createAdf(ADF_278);
  createAdf(ADF_279);

  createUser({ id: ADMIN_ID, username: "admin", role: "admin", adfId: null });
  createUser({ id: COORD_278_ID, username: "278/001", role: "coordinador", adfId: ADF_278 });
  createUser({ id: VOL_278_ID, username: "278/002", role: "voluntari", adfId: ADF_278 });
  createUser({ id: COORD_279_ID, username: "279/001", role: "coordinador", adfId: ADF_279 });
}

/**
 * Deixa la BD com al principi en **una sola transacció**: cap test no pot veure
 * el món a mitges entre el reset i el seed.
 */
export function resetWorld(): void {
  db.transaction(() => {
    clearTables();
    seedStandardWorld();
  });
}

type HydrantSeed = Partial<typeof hidrants.$inferInsert> & { id: string };

export function createHydrant(data: HydrantSeed): void {
  db.insert(hidrants)
    .values({
      adf_id: ADF_278,
      lat: 41.6,
      lon: 1.6,
      osm_tags: "{}",
      service_tags: "{}",
      sync_status: "SYNCED",
      ...data,
    })
    .run();
}

/** Camps del formulari equivalents a `FULL_OSM_TAGS` (per fer PUT sense perdre tags). */
export const FULL_UI_FIELDS = {
  position: "lane",
  type: "pillar",
  couplings: "2",
  diameters: "70",
  pressure: "3",
  street: "Carrer Vell",
  num: "5",
  barri: "Centre",
  surveyDate: "2026-01-15",
  estat: "Operatiu",
} as const;

export const FULL_OSM_TAGS: Record<string, string> = {
  "fire_hydrant:position": "lane",
  "fire_hydrant:type": "pillar",
  couplings: "2",
  "couplings:diameters": "70 mm",
  "fire_hydrant:pressure": "3",
  "addr:street": "Carrer Vell",
  "addr:housenumber": "5",
  "addr:neighbourhood": "Centre",
  "survey:date": "2026-01-15",
  emergency: "fire_hydrant",
};

/** Hidrant SYNCED amb dades remotes idèntiques: permet provar el cicle PENDING/SYNCED. */
export function createSyncedHydrant(id = "hydrant-synced"): void {
  createHydrant({
    id,
    osm_id: 9001,
    osm_version: 3,
    osm_tags: JSON.stringify(FULL_OSM_TAGS),
    remote_osm_tags: JSON.stringify(FULL_OSM_TAGS),
    remote_lat: 41.6,
    remote_lon: 1.6,
    sync_status: "SYNCED",
  });
}
