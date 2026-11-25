import type { HidrantSyncError } from "@territoriadf/contracts/hidrants";

/**
 * Missatges llegibles d'un `sync_error`: els warnings d'una revisió o el text
 * d'un error. Un conflicte no és un missatge: el seu detall es pinta com a diff.
 */
export function syncErrorMessages(syncError?: HidrantSyncError | null): string[] {
  if (!syncError) {
    return [];
  }
  if (syncError.kind === "review") {
    return syncError.issues.map((issue) => issue.message);
  }
  if (syncError.kind === "error") {
    return [syncError.message];
  }
  return [];
}
