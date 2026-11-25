import type { PendingHidrant } from "@territoriadf/contracts/osm";
import { useMemo, useState } from "react";

/**
 * Selecció múltiple de pendents. És estat de vista, no del servidor, i viu
 * aquí perquè les accions per lots rebin només els IDs visibles a l'ADF
 * actual: una selecció feta en una altra ADF no ha de comptar en aquesta.
 */
export function useOsmSelection(pending: PendingHidrant[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedIds = useMemo(
    () => pending.filter((h) => selected.has(h.id)).map((h) => h.id),
    [pending, selected],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSection = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  return {
    selectedIds,
    isSelected: (id: string) => selected.has(id),
    allSelected: (ids: string[]) => ids.every((id) => selected.has(id)),
    toggle,
    toggleSection,
    clear: () => setSelected(new Set()),
  };
}
