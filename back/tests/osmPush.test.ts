import { beforeEach, describe, expect, it, vi } from "vitest";

import { HidrantsRepository } from "../src/db/repositories/hidrantsRepository.js";
import * as osmApi from "../src/services/osmApi.js";
import { buildChangesetComment, pushSyncToOSM } from "../src/services/osmPushSync.js";
import { createHydrant, FULL_OSM_TAGS, resetWorld } from "./helpers/db.js";

/**
 * La capa HTTP d'OSM es substitueix sencera: la suite no ha de sortir a la
 * xarxa. Així es prova la lògica de la màquina d'estats (creació, conflicte
 * 409, esborrat) amb respostes controlades.
 */
vi.mock("../src/services/osmApi.js", () => ({
  isConfigured: vi.fn(() => true),
  createChangeset: vi.fn(async () => 4242),
  closeChangeset: vi.fn(async () => undefined),
  createNode: vi.fn(async () => ({ osmId: 900001, newVersion: 1 })),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  getNode: vi.fn(async () => null),
}));

beforeEach(() => {
  resetWorld();
  vi.clearAllMocks();

  vi.mocked(osmApi.isConfigured).mockReturnValue(true);
  vi.mocked(osmApi.createChangeset).mockResolvedValue(4242);
  vi.mocked(osmApi.closeChangeset).mockResolvedValue(undefined);
  vi.mocked(osmApi.createNode).mockResolvedValue({ osmId: 900001, newVersion: 1 });
  vi.mocked(osmApi.getNode).mockResolvedValue(null);
  vi.mocked(osmApi.updateNode).mockReset();
  vi.mocked(osmApi.deleteNode).mockReset();
});

describe("pushSyncToOSM: creació", () => {
  it("PENDING_CREATE → SYNCED i desa osm_id, versió i dades remotes", async () => {
    createHydrant({
      id: "new-hydrant",
      sync_status: "PENDING_CREATE",
      osm_tags: FULL_OSM_TAGS,
    });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result).toMatchObject({ synced: 1, conflicts: 0, errors: 0, reviewed: 0 });
    expect(osmApi.createNode).toHaveBeenCalledTimes(1);
    expect(osmApi.closeChangeset).toHaveBeenCalledWith(4242);

    const row = HidrantsRepository.findByIds(["new-hydrant"])[0]!;
    expect(row.sync_status).toBe("SYNCED");
    expect(row.osm_id).toBe(900001);
    expect(row.osm_version).toBe(1);
    expect(row.synced_at).toBeTruthy();
    expect(row.remote_osm_tags).toEqual(FULL_OSM_TAGS);
  });

  it("no obre cap changeset si no hi ha res pendent", async () => {
    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result).toEqual({ synced: 0, conflicts: 0, errors: 0, reviewed: 0, details: [] });
    expect(osmApi.createChangeset).not.toHaveBeenCalled();
  });

  it("falla amb un error clar si no hi ha token d'OSM", async () => {
    vi.mocked(osmApi.isConfigured).mockReturnValueOnce(false);

    await expect(pushSyncToOSM()).rejects.toThrow("Token OSM no configurat");
  });

  it("un tag invàlid deixa l'hidrant en ERROR sense cridar OSM", async () => {
    createHydrant({
      id: "bad-hydrant",
      sync_status: "PENDING_CREATE",
      osm_tags: { "fire_hydrant:type": "invalid" },
    });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.errors).toBe(1);
    expect(osmApi.createNode).not.toHaveBeenCalled();
    const row = HidrantsRepository.findByIds(["bad-hydrant"])[0]!;
    expect(row.sync_status).toBe("ERROR");
    expect(row.sync_error?.kind).toBe("error");
    expect(row.sync_error?.kind === "error" ? row.sync_error.message : "").toContain(
      "Dades invàlides",
    );
  });

  it("un error de xarxa en crear deixa l'hidrant en ERROR", async () => {
    createHydrant({
      id: "network-error",
      sync_status: "PENDING_CREATE",
      osm_tags: FULL_OSM_TAGS,
    });
    vi.mocked(osmApi.createNode).mockRejectedValueOnce(new Error("OSM timeout"));

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.errors).toBe(1);
    const row = HidrantsRepository.findByIds(["network-error"])[0]!;
    expect(row.sync_status).toBe("ERROR");
    expect(row.sync_error?.kind).toBe("error");
    expect(row.sync_error?.kind === "error" ? row.sync_error.message : "").toContain("OSM timeout");
  });

  it("un warning deixa l'hidrant en REVIEW sense cridar OSM", async () => {
    createHydrant({
      id: "review-hydrant",
      sync_status: "PENDING_CREATE",
      osm_tags: { emergency: "fire_hydrant", "addr:street": "CARRER GRAN" },
    });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.reviewed).toBe(1);
    expect(osmApi.createNode).not.toHaveBeenCalled();
    const row = HidrantsRepository.findByIds(["review-hydrant"])[0]!;
    expect(row.sync_status).toBe("REVIEW");
  });
});

describe("pushSyncToOSM: actualització", () => {
  it("un 409 d'OSM deixa l'hidrant en CONFLICT amb el detall", async () => {
    createHydrant({
      id: "conflict-hydrant",
      osm_id: 700,
      osm_version: 2,
      sync_status: "PENDING_UPDATE",
      osm_tags: FULL_OSM_TAGS,
    });
    vi.mocked(osmApi.updateNode).mockResolvedValue({
      ok: false,
      status: 409,
      osmVersion: 4,
      osmLat: 41.7,
      osmLon: 1.7,
      osmTags: { ...FULL_OSM_TAGS, "addr:street": "Carrer d'OSM" },
    });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.conflicts).toBe(1);
    const row = HidrantsRepository.findByIds(["conflict-hydrant"])[0]!;
    expect(row.sync_status).toBe("CONFLICT");
    expect(row.sync_error).toMatchObject({ kind: "conflict", osmVersion: 4 });
    const diffFields = row.sync_error?.kind === "conflict" ? (row.sync_error.diffFields ?? []) : [];
    expect(diffFields.join(" ")).toContain("addr:street");
  });

  it("un 400 d'OSM deixa l'hidrant en ERROR", async () => {
    createHydrant({
      id: "update-400",
      osm_id: 702,
      osm_version: 2,
      sync_status: "PENDING_UPDATE",
      osm_tags: FULL_OSM_TAGS,
    });
    vi.mocked(osmApi.updateNode).mockResolvedValue({
      ok: false,
      status: 400,
      error: "invalid tag",
    });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.errors).toBe(1);
    expect(HidrantsRepository.findByIds(["update-400"])[0]!.sync_status).toBe("ERROR");
  });

  it("una actualització amb warnings queda en REVIEW", async () => {
    createHydrant({
      id: "update-review",
      osm_id: 703,
      osm_version: 2,
      sync_status: "PENDING_UPDATE",
      osm_tags: { emergency: "fire_hydrant", "addr:street": "CARRER GRAN" },
    });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.reviewed).toBe(1);
    expect(osmApi.updateNode).not.toHaveBeenCalled();
    expect(HidrantsRepository.findByIds(["update-review"])[0]!.sync_status).toBe("REVIEW");
  });

  it("una actualització correcta → SYNCED amb la versió nova", async () => {
    createHydrant({
      id: "update-hydrant",
      osm_id: 701,
      osm_version: 2,
      sync_status: "PENDING_UPDATE",
      osm_tags: FULL_OSM_TAGS,
    });
    vi.mocked(osmApi.updateNode).mockResolvedValue({ ok: true, status: 200, data: "3" });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.synced).toBe(1);
    const row = HidrantsRepository.findByIds(["update-hydrant"])[0]!;
    expect(row.sync_status).toBe("SYNCED");
    expect(row.osm_version).toBe(3);
  });
});

describe("pushSyncToOSM: esborrat", () => {
  it("PENDING_DELETE amb node a OSM → s'esborra d'OSM i de la BD", async () => {
    createHydrant({
      id: "delete-hydrant",
      osm_id: 800,
      osm_version: 3,
      sync_status: "PENDING_DELETE",
    });
    vi.mocked(osmApi.deleteNode).mockResolvedValue({ ok: true, status: 200, data: "" });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.synced).toBe(1);
    expect(HidrantsRepository.findByIds(["delete-hydrant"])).toHaveLength(0);
  });

  it("PENDING_DELETE sense osm_id només s'esborra de la BD", async () => {
    createHydrant({ id: "delete-local", sync_status: "PENDING_DELETE" });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.synced).toBe(1);
    expect(osmApi.deleteNode).not.toHaveBeenCalled();
    expect(HidrantsRepository.findByIds(["delete-local"])).toHaveLength(0);
  });

  it("un 409 en esborrar deixa l'hidrant en CONFLICT i no l'esborra", async () => {
    createHydrant({
      id: "delete-conflict",
      osm_id: 801,
      osm_version: 3,
      sync_status: "PENDING_DELETE",
    });
    vi.mocked(osmApi.deleteNode).mockResolvedValue({
      ok: false,
      status: 409,
      osmVersion: 4,
      osmLat: 41.6,
      osmLon: 1.6,
      osmTags: FULL_OSM_TAGS,
    });

    const result = await pushSyncToOSM({ adfId: 278 });

    expect(result.conflicts).toBe(1);
    expect(HidrantsRepository.findByIds(["delete-conflict"])[0]!.sync_status).toBe("CONFLICT");
  });
});

describe("buildChangesetComment", () => {
  it("resumeix altes, actualitzacions i esborrats amb el nom de l'ADF", () => {
    createHydrant({ id: "c1", sync_status: "PENDING_CREATE" });
    createHydrant({ id: "u1", sync_status: "PENDING_UPDATE", osm_id: 1, osm_version: 1 });
    createHydrant({ id: "d1", sync_status: "PENDING_DELETE", osm_id: 2, osm_version: 1 });

    const pending = HidrantsRepository.findBySyncStatus([
      "PENDING_CREATE",
      "PENDING_UPDATE",
      "PENDING_DELETE",
    ]);

    const comment = buildChangesetComment(pending);
    expect(comment).toContain("TerritoriADF");
    expect(comment).toContain("ADF Prova 278");
    expect(comment).toContain("alta");
    expect(comment).toContain("actualització");
    expect(comment).toContain("esborrat");
  });
});
