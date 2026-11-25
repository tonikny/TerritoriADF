import type { HidrantFeature } from "@territoriadf/contracts/hidrants";

export type SyncStatus = HidrantFeature["properties"]["sync_status"];

export type SyncBadge = { cls: string; text: string };

/** Color i text del badge d'estat de sync d'un hidrant. */
export function syncBadge(status: SyncStatus): SyncBadge {
  switch (status) {
    case "SYNCED":
      return { cls: "bg-[#27ae60]", text: "Sincronitzat" };
    case "PENDING_CREATE":
      return { cls: "bg-[#f39c12]", text: "Pendent crear (local)" };
    case "PENDING_UPDATE":
      return { cls: "bg-[#3498db]", text: "Pendent actualitzar" };
    case "PENDING_DELETE":
      return { cls: "bg-[#e74c3c]", text: "Pendent esborrar" };
    case "CONFLICT":
      return { cls: "bg-[#e67e22]", text: "Conflicte amb OSM" };
    case "REVIEW":
      return { cls: "bg-[#f1c40f]", text: "Revisió pendent" };
    case "ERROR":
      return { cls: "bg-[#e74c3c]", text: "Error sync" };
    case "MISSING_IN_OSM":
      // Existia a OSM i ja no hi és: el push el tornarà a crear si cal.
      return { cls: "bg-[#7f8c8d]", text: "Ja no és a OSM" };
    default: {
      // Tots els estats de `SyncStatus` estan coberts: si se n'hi afegeix un,
      // el typecheck falla aquí en lloc de pintar l'identificador en cru.
      const inesperat: never = status;
      return { cls: "bg-gray-400", text: String(inesperat) };
    }
  }
}
