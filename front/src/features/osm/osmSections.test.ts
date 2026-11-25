import { describe, expect, it } from "vitest";
import type { PendingHidrant } from "@territoriadf/contracts/osm";

import { groupPending, hidrantLabel, SECTION_ORDER } from "./osmSections";

const pending = (patch: Partial<PendingHidrant> & Pick<PendingHidrant, "id">): PendingHidrant => ({
  osm_id: null,
  lat: 41.5,
  lon: 1.9,
  sync_status: "PENDING_CREATE",
  sync_error: null,
  street: "",
  num: "",
  ...patch,
});

describe("osmSections", () => {
  it("etiqueta un hidrant pel carrer o, si no n'hi ha, per OSM o per l'id", () => {
    expect(hidrantLabel(pending({ id: "h1", street: "Carrer A", num: "1" }))).toBe("Carrer A, 1");
    expect(hidrantLabel(pending({ id: "h2", street: "Carrer B" }))).toBe("Carrer B");
    expect(hidrantLabel(pending({ id: "h3", osm_id: 123 }))).toBe("OSM 123");
    expect(hidrantLabel(pending({ id: "abcdefgh1234" }))).toBe("abcdefgh");
  });

  it("agrupa per estat amb totes les seccions presents", () => {
    const grouped = groupPending([
      pending({ id: "a", sync_status: "PENDING_CREATE" }),
      pending({ id: "b", sync_status: "CONFLICT" }),
      pending({ id: "c", sync_status: "PENDING_CREATE" }),
    ]);

    expect(grouped.PENDING_CREATE.map((h) => h.id)).toEqual(["a", "c"]);
    expect(grouped.CONFLICT.map((h) => h.id)).toEqual(["b"]);
    expect(grouped.MISSING_IN_OSM).toEqual([]);
    expect(Object.keys(grouped).sort()).toEqual([...SECTION_ORDER].sort());
  });
});
