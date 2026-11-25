import { describe, expect, it } from "vitest";

import { syncBadge, type SyncStatus } from "./syncBadge";

const CASES: [SyncStatus, string][] = [
  ["SYNCED", "Sincronitzat"],
  ["PENDING_CREATE", "Pendent crear (local)"],
  ["PENDING_UPDATE", "Pendent actualitzar"],
  ["PENDING_DELETE", "Pendent esborrar"],
  ["CONFLICT", "Conflicte amb OSM"],
  ["REVIEW", "Revisió pendent"],
  ["ERROR", "Error sync"],
  ["MISSING_IN_OSM", "Ja no és a OSM"],
];

describe("syncBadge", () => {
  it("dona un text propi a cada estat de sync", () => {
    for (const [status, text] of CASES) {
      expect(syncBadge(status).text).toBe(text);
    }
  });

  it("cap estat queda sense color", () => {
    for (const [status] of CASES) {
      expect(syncBadge(status).cls).toMatch(/^bg-/);
    }
  });
});
