import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../src/db/index.js";
import { HidrantsRepository } from "../src/db/repositories/hidrantsRepository.js";
import { adfs, hidrants } from "../src/db/schema.js";
import { syncAdfFromOSM } from "../src/services/osmSync.js";
import { queryOverpass } from "../src/services/overpass.js";
import { ADF_278, ADF_279, createAdf, createHydrant, resetWorld } from "./helpers/db.js";
import { overpassResult } from "./helpers/osm.js";

vi.mock("../src/services/overpass.js", () => ({
  queryOverpass: vi.fn(),
}));

const HYDRANTS = overpassResult("overpass-hydrants.json");
const EMPTY = overpassResult("overpass-empty.json");

function setRelations(relations: string[]): void {
  db.update(adfs)
    .set({ osm_relations: JSON.stringify(relations) })
    .where(eq(adfs.id, ADF_278))
    .run();
}

beforeEach(() => {
  resetWorld();
  vi.mocked(queryOverpass).mockReset();
  vi.mocked(queryOverpass).mockResolvedValue(HYDRANTS);
});

describe("syncAdfFromOSM: importació", () => {
  it("importa els nodes d'Overpass com a SYNCED", async () => {
    const result = await syncAdfFromOSM(ADF_278);

    expect(result).toEqual({ total: 2, skipped: 0, conflicts: 0 });

    const query = vi.mocked(queryOverpass).mock.calls[0]![0];
    expect(query).toContain("area(3600000278)");
    expect(query).toContain('["emergency"="fire_hydrant"]');
    expect(query).toContain('["disused:emergency"="fire_hydrant"]');

    const rows = db.select().from(hidrants).where(eq(hidrants.adf_id, ADF_278)).all();
    expect(rows).toHaveLength(2);
    const first = rows.find((row) => row.osm_id === 1001);
    expect(first).toMatchObject({ osm_version: 3, sync_status: "SYNCED", lat: 41.6001 });
    expect((JSON.parse(first?.osm_tags ?? "{}") as Record<string, string>)["addr:street"]).toBe(
      "Carrer OSM U",
    );
    expect(first?.synced_at).toBeTruthy();
  });

  it("actualitza un hidrant SYNCED existent amb la versió i els tags d'OSM", async () => {
    createHydrant({
      id: "existing",
      osm_id: 1001,
      osm_version: 1,
      lat: 40,
      lon: 0,
      sync_status: "SYNCED",
      osm_tags: JSON.stringify({ "addr:street": "Carrer Antic" }),
      service_tags: JSON.stringify({ observacions: "Clau al pal" }),
    });

    await syncAdfFromOSM(ADF_278);

    const row = HidrantsRepository.findByIds(["existing"])[0]!;
    expect(row.osm_version).toBe(3);
    // El pull sobreescriu el que ve d'OSM, però la informació de servei és local.
    expect(JSON.parse(row.service_tags ?? "{}")).toEqual({ observacions: "Clau al pal" });
    expect(row.lat).toBe(41.6001);
    expect((JSON.parse(row.osm_tags ?? "{}") as Record<string, string>)["addr:street"]).toBe(
      "Carrer OSM U",
    );
    expect(db.select().from(hidrants).where(eq(hidrants.adf_id, ADF_278)).all()).toHaveLength(2);
  });

  it("deduplica els nodes que apareixen en més d'una relació", async () => {
    setRelations(["R278", "R279"]);

    const result = await syncAdfFromOSM(ADF_278);

    expect(result.total).toBe(4); // 2 elements × 2 relacions
    expect(db.select().from(hidrants).where(eq(hidrants.adf_id, ADF_278)).all()).toHaveLength(2);
    expect(queryOverpass).toHaveBeenCalledTimes(2);
    const secondQuery = vi.mocked(queryOverpass).mock.calls[1]![0];
    expect(secondQuery).toContain("area(3600000279)");
  });
});

describe("syncAdfFromOSM: estats locals", () => {
  it("no toca un PENDING_CREATE, però en desa les dades remotes", async () => {
    createHydrant({
      id: "local-new",
      osm_id: 1001,
      lat: 41.6,
      lon: 1.6,
      sync_status: "PENDING_CREATE",
      osm_tags: JSON.stringify({ "addr:street": "Carrer Local" }),
    });

    const result = await syncAdfFromOSM(ADF_278);

    expect(result).toEqual({ total: 2, skipped: 1, conflicts: 0 });
    const row = HidrantsRepository.findByIds(["local-new"])[0]!;
    expect(row.sync_status).toBe("PENDING_CREATE");
    expect(row.lat).toBe(41.6);
    expect((JSON.parse(row.osm_tags ?? "{}") as Record<string, string>)["addr:street"]).toBe(
      "Carrer Local",
    );
    expect((JSON.parse(row.remote_osm_tags ?? "{}") as Record<string, string>)["addr:street"]).toBe(
      "Carrer OSM U",
    );
  });

  it("marca CONFLICT si OSM és més nou que un PENDING_UPDATE", async () => {
    createHydrant({
      id: "local-edit",
      osm_id: 1001,
      osm_version: 1,
      sync_status: "PENDING_UPDATE",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await syncAdfFromOSM(ADF_278);

    expect(result.conflicts).toBe(1);
    const row = HidrantsRepository.findByIds(["local-edit"])[0]!;
    expect(row.sync_status).toBe("CONFLICT");
    expect((JSON.parse(row.sync_error ?? "{}") as { osmVersion: number }).osmVersion).toBe(3);
  });

  it("manté un PENDING_UPDATE si la versió local és més nova", async () => {
    createHydrant({
      id: "local-newer",
      osm_id: 1001,
      sync_status: "PENDING_UPDATE",
      updated_at: "2026-03-01T00:00:00.000Z",
    });

    const result = await syncAdfFromOSM(ADF_278);

    expect(result.skipped).toBe(1);
    expect(HidrantsRepository.findByIds(["local-newer"])[0]!.sync_status).toBe("PENDING_UPDATE");
  });

  it("no toca REVIEW ni CONFLICT", async () => {
    createHydrant({ id: "review", osm_id: 1001, sync_status: "REVIEW" });
    createHydrant({ id: "conflict", osm_id: 1002, sync_status: "CONFLICT" });

    const result = await syncAdfFromOSM(ADF_278);

    expect(result.skipped).toBe(2);
    expect(HidrantsRepository.findByIds(["review"])[0]!.sync_status).toBe("REVIEW");
    expect(HidrantsRepository.findByIds(["conflict"])[0]!.sync_status).toBe("CONFLICT");
  });

  it("restaura a SYNCED un MISSING_IN_OSM que torna a OSM", async () => {
    createHydrant({ id: "returns", osm_id: 1001, sync_status: "MISSING_IN_OSM" });

    await syncAdfFromOSM(ADF_278);

    expect(HidrantsRepository.findByIds(["returns"])[0]!.sync_status).toBe("SYNCED");
  });
});

describe("syncAdfFromOSM: hidrants absents", () => {
  it("marca MISSING_IN_OSM sense esborrar la fila ni tocar altres ADFs", async () => {
    createHydrant({
      id: "gone",
      osm_id: 9999,
      sync_status: "SYNCED",
      service_tags: JSON.stringify({ nota: "no es pot perdre" }),
    });
    createHydrant({ id: "other-adf", adf_id: ADF_279, osm_id: 9998, sync_status: "SYNCED" });

    await syncAdfFromOSM(ADF_278);

    const gone = HidrantsRepository.findByIds(["gone"])[0]!;
    expect(gone.sync_status).toBe("MISSING_IN_OSM");
    expect(JSON.parse(gone.service_tags ?? "{}")).toEqual({ nota: "no es pot perdre" });
    expect(HidrantsRepository.findByIds(["other-adf"])[0]!.sync_status).toBe("SYNCED");
  });

  it("una resposta buida marca tots els SYNCED com a MISSING_IN_OSM", async () => {
    vi.mocked(queryOverpass).mockResolvedValue(EMPTY);
    createHydrant({ id: "gone", osm_id: 9999, sync_status: "SYNCED" });

    const result = await syncAdfFromOSM(ADF_278);

    expect(result.total).toBe(0);
    expect(HidrantsRepository.findByIds(["gone"])[0]!.sync_status).toBe("MISSING_IN_OSM");
  });

  it("no marca res si alguna relació ha fallat", async () => {
    setRelations(["R278", "R279"]);
    createHydrant({ id: "gone", osm_id: 9999, sync_status: "SYNCED" });
    vi.mocked(queryOverpass)
      .mockReset()
      .mockResolvedValueOnce(HYDRANTS)
      .mockResolvedValueOnce({ ok: false, status: 503, error: "down" });

    const result = await syncAdfFromOSM(ADF_278);

    expect(result.total).toBe(2);
    expect(HidrantsRepository.findByIds(["gone"])[0]!.sync_status).toBe("SYNCED");
  });
});

describe("syncAdfFromOSM: errors", () => {
  it("atura la sincronització si totes les relacions fallen", async () => {
    vi.mocked(queryOverpass).mockResolvedValue({ ok: false, status: 503, error: "down" });

    await expect(syncAdfFromOSM(ADF_278)).rejects.toThrow("Totes les consultes a Overpass");
    expect(db.select().from(hidrants).where(eq(hidrants.adf_id, ADF_278)).all()).toHaveLength(0);
  });

  it("falla si l'ADF no existeix", async () => {
    await expect(syncAdfFromOSM(999)).rejects.toThrow("ADF 999 not found");
  });

  it("una ADF sense relacions no consulta Overpass", async () => {
    setRelations([]);

    const result = await syncAdfFromOSM(ADF_278);

    expect(result).toEqual({ total: 0, skipped: 0, conflicts: 0 });
    expect(queryOverpass).not.toHaveBeenCalled();
  });

  it("una ADF nova es pot crear amb createAdf i sincronitzar", async () => {
    createAdf(300, "ADF Nova", null);

    await syncAdfFromOSM(300);

    expect(HidrantsRepository.findByOsmId(1001)?.adf_id).toBe(300);
  });
});
