import type { HidrantFeature } from "@territoriadf/contracts/hidrants";

export type SyncStatus = HidrantFeature["properties"]["sync_status"];

export type SyncBadge = { cls: string; fg: string; text: string };

/**
 * Color i text del badge d'estat de sync d'un hidrant. Els colors surten dels
 * tokens de marca; `fg` és el color del text perquè el groc no pot portar blanc.
 */
export function syncBadge(status: SyncStatus): SyncBadge {
  switch (status) {
    case "SYNCED":
      return { cls: "bg-ok", fg: "text-white", text: "Sincronitzat" };
    case "PENDING_CREATE":
      return { cls: "bg-primary", fg: "text-white", text: "Pendent crear (local)" };
    case "PENDING_UPDATE":
      return { cls: "bg-muted", fg: "text-white", text: "Pendent actualitzar" };
    case "PENDING_DELETE":
      return { cls: "bg-alert", fg: "text-white", text: "Pendent esborrar" };
    case "CONFLICT":
      return { cls: "bg-accent", fg: "text-ink", text: "Conflicte amb OSM" };
    case "REVIEW":
      return { cls: "bg-accent", fg: "text-ink", text: "Revisió pendent" };
    case "ERROR":
      return { cls: "bg-alert", fg: "text-white", text: "Error sync" };
    case "MISSING_IN_OSM":
      // Existia a OSM i ja no hi és: el push el tornarà a crear si cal.
      return { cls: "bg-muted", fg: "text-white", text: "Ja no és a OSM" };
    default: {
      // Tots els estats de `SyncStatus` estan coberts: si se n'hi afegeix un,
      // el typecheck falla aquí en lloc de pintar l'identificador en cru.
      const inesperat: never = status;
      return { cls: "bg-muted", fg: "text-white", text: String(inesperat) };
    }
  }
}
