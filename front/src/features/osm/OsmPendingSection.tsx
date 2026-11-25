import type { PendingHidrant } from "@territoriadf/contracts/osm";

import { OsmPendingRow } from "./OsmPendingRow";
import type { OsmRowActions } from "./OsmPendingRow";
import { SECTION_CONFIG, type SectionKey } from "./osmSections";

/**
 * Secció col·lapsable per estat: capçalera amb comptador, ajut i la llista.
 * La purga massiva només té sentit a «Ja no són a OSM».
 */
export function OsmPendingSection({
  section,
  items,
  isOpen,
  isSelected,
  allSelected,
  actions,
  onToggleOpen,
  onToggleItem,
  onToggleAll,
  onPurgeAll,
}: {
  section: SectionKey;
  items: PendingHidrant[];
  isOpen: boolean;
  isSelected: (id: string) => boolean;
  allSelected: (ids: string[]) => boolean;
  actions: OsmRowActions;
  onToggleOpen: () => void;
  onToggleItem: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onPurgeAll: () => void;
}) {
  if (items.length === 0) {
    return null;
  }
  const config = SECTION_CONFIG[section];
  const ids = items.map((h) => h.id);

  return (
    <div>
      <button
        onClick={onToggleOpen}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-white hover:bg-bg cursor-pointer border-0"
      >
        <span className={`text-[0.8rem] font-semibold ${config.color}`}>
          {isOpen ? "▾" : "▸"} {config.label} ({items.length})
        </span>
        {isOpen && section !== "MISSING_IN_OSM" && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleAll(ids);
            }}
            className="text-[0.7rem] text-muted hover:text-ink cursor-pointer"
          >
            {allSelected(ids) ? "Desseleccionar tot" : "Sel·leccionar tot"}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="px-3 py-1 text-[0.7rem] text-muted bg-bg/50 border-t border-border">
          {config.hint}
          {section === "MISSING_IN_OSM" && (
            <button
              onClick={onPurgeAll}
              disabled={actions.disabled}
              className="ml-2 text-[0.7rem] px-1.5 py-0.5 bg-white text-red-600 border border-border rounded cursor-pointer disabled:opacity-50"
            >
              Esborrar-los tots
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className="bg-bg">
          {items.map((h) => (
            <OsmPendingRow
              key={h.id}
              item={h}
              section={section}
              selected={isSelected(h.id)}
              actions={actions}
              onToggle={() => onToggleItem(h.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
