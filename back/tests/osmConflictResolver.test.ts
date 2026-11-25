import { beforeEach, describe, expect, it, vi } from "vitest";

import { HidrantsRepository } from "../src/db/repositories/hidrantsRepository.js";
import * as osmApi from "../src/services/osmApi.js";
import {
  generateOscFile,
  getConflicts,
  resolveAfterJOSM,
  tryAutoResolve,
} from "../src/services/osmConflictResolver.js";
import { createHydrant, FULL_OSM_TAGS, resetWorld } from "./helpers/db.js";

vi.mock("../src/services/osmApi.js", () => ({
  isConfigured: vi.fn(() => true),
  createChangeset: vi.fn(async () => 4242),
  closeChangeset: vi.fn(async () => undefined),
  createNode: vi.fn(async () => ({ osmId: 9001, newVersion: 1 })),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  getNode: vi.fn(),
}));

const LOCAL_TAGS = { ...FULL_OSM_TAGS, "addr:street": "Carrer Local" };
const REMOTE_TAGS = { ...FULL_OSM_TAGS, "addr:street": "Carrer OSM" };

function seedConflict(id = "conflict-1"): void {
  createHydrant({
    id,
    osm_id: 7001,
    osm_version: 3,
    sync_status: "CONFLICT",
    osm_tags: JSON.stringify(LOCAL_TAGS),
    sync_error: JSON.stringify({
      localVersion: 3,
      osmVersion: 4,
      osmLat: 41.6005,
      osmLon: 1.6005,
      osmTags: REMOTE_TAGS,
      localLat: 41.6,
      localLon: 1.6,
      localTags: LOCAL_TAGS,
      diffFields: ["addr:street"],
    }),
  });
}

beforeEach(() => {
  resetWorld();
  vi.clearAllMocks();

  vi.mocked(osmApi.getNode).mockReset();
  vi.mocked(osmApi.updateNode).mockReset();
  vi.mocked(osmApi.createChangeset).mockResolvedValue(4242);
  vi.mocked(osmApi.closeChangeset).mockResolvedValue(undefined);
});

describe("tryAutoResolve", () => {
  it("retorna false si l'hidrant no té osm_id", async () => {
    createHydrant({ id: "no-osm-id" });

    expect(await tryAutoResolve(HidrantsRepository.findByIds(["no-osm-id"])[0]!)).toBe(false);
    expect(osmApi.getNode).not.toHaveBeenCalled();
  });

  it("retorna false si OSM no retorna el node", async () => {
    seedConflict();
    vi.mocked(osmApi.getNode).mockResolvedValue(null);

    expect(await tryAutoResolve(HidrantsRepository.findByIds(["conflict-1"])[0]!)).toBe(false);
  });

  it("retorna false si la posició ha canviat a OSM", async () => {
    seedConflict();
    vi.mocked(osmApi.getNode).mockResolvedValue({
      version: 4,
      lat: 42,
      lon: 1.6,
      tags: REMOTE_TAGS,
    });

    expect(await tryAutoResolve(HidrantsRepository.findByIds(["conflict-1"])[0]!)).toBe(false);
    expect(HidrantsRepository.findByIds(["conflict-1"])[0]!.sync_status).toBe("CONFLICT");
  });

  it("marca SYNCED si només difereixen els tags i no cal publicar res", async () => {
    createHydrant({
      id: "no-changes",
      osm_id: 7002,
      osm_version: 3,
      sync_status: "CONFLICT",
      osm_tags: JSON.stringify(REMOTE_TAGS),
    });
    vi.mocked(osmApi.getNode).mockResolvedValue({
      version: 4,
      lat: 41.6,
      lon: 1.6,
      tags: REMOTE_TAGS,
    });

    expect(await tryAutoResolve(HidrantsRepository.findByIds(["no-changes"])[0]!)).toBe(true);
    const row = HidrantsRepository.findByIds(["no-changes"])[0]!;
    expect(row.sync_status).toBe("SYNCED");
    expect(row.osm_version).toBe(4);
    expect(osmApi.updateNode).not.toHaveBeenCalled();
  });

  it("publica el merge de tags i marca SYNCED", async () => {
    seedConflict();
    vi.mocked(osmApi.getNode).mockResolvedValue({
      version: 4,
      lat: 41.6,
      lon: 1.6,
      tags: REMOTE_TAGS,
    });
    vi.mocked(osmApi.updateNode).mockResolvedValue({ ok: true, status: 200, data: "5" });

    expect(await tryAutoResolve(HidrantsRepository.findByIds(["conflict-1"])[0]!)).toBe(true);

    expect(osmApi.updateNode).toHaveBeenCalledWith(
      7001,
      4,
      41.6,
      1.6,
      expect.objectContaining({ "addr:street": "Carrer Local" }),
      4242,
    );
    const row = HidrantsRepository.findByIds(["conflict-1"])[0]!;
    expect(row.sync_status).toBe("SYNCED");
    expect(row.osm_version).toBe(5);
    expect((JSON.parse(row.osm_tags ?? "{}") as Record<string, string>)["addr:street"]).toBe(
      "Carrer Local",
    );
  });

  it("retorna false i no toca l'estat si OSM rebutja el merge", async () => {
    seedConflict();
    vi.mocked(osmApi.getNode).mockResolvedValue({
      version: 4,
      lat: 41.6,
      lon: 1.6,
      tags: REMOTE_TAGS,
    });
    vi.mocked(osmApi.updateNode).mockResolvedValue({
      ok: false,
      status: 409,
      osmVersion: 4,
      osmLat: 41.6,
      osmLon: 1.6,
      osmTags: REMOTE_TAGS,
    });

    expect(await tryAutoResolve(HidrantsRepository.findByIds(["conflict-1"])[0]!)).toBe(false);
    expect(HidrantsRepository.findByIds(["conflict-1"])[0]!.sync_status).toBe("CONFLICT");
  });
});

describe("getConflicts i generateOscFile", () => {
  it("retorna una llista buida i cap fitxer si no hi ha conflictes", () => {
    expect(getConflicts()).toEqual([]);
    expect(generateOscFile()).toBeNull();
  });

  it("exposa el diff i genera l'OSC", () => {
    seedConflict();

    const conflicts = getConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.diffFields.join(" ")).toContain("addr:street");

    const osc = generateOscFile();
    expect(osc).toContain("<osmChange");
    expect(osc).toContain("7001");
    expect(osc).toContain("Carrer Local");
  });
});

describe("resolveAfterJOSM", () => {
  it("retorna false per a un id desconegut", async () => {
    expect(await resolveAfterJOSM("unknown")).toBe(false);
  });

  it("retorna false si OSM no retorna el node", async () => {
    seedConflict();
    vi.mocked(osmApi.getNode).mockResolvedValue(null);

    expect(await resolveAfterJOSM("conflict-1")).toBe(false);
  });

  it("aplica la versió d'OSM i marca SYNCED", async () => {
    seedConflict();
    vi.mocked(osmApi.getNode).mockResolvedValue({
      version: 8,
      lat: 41.6005,
      lon: 1.6005,
      tags: REMOTE_TAGS,
    });

    expect(await resolveAfterJOSM("conflict-1")).toBe(true);

    const row = HidrantsRepository.findByIds(["conflict-1"])[0]!;
    expect(row.sync_status).toBe("SYNCED");
    expect(row.osm_version).toBe(8);
    expect((JSON.parse(row.osm_tags ?? "{}") as Record<string, string>)["addr:street"]).toBe(
      "Carrer OSM",
    );
  });
});
