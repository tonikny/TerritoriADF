import { useState } from "react";

import { secondaryTightClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";

import { useAdf } from "@/contexts/AdfContext";
import { OsmActionsBar } from "./OsmActionsBar";
import { OsmPendingSection } from "./OsmPendingSection";
import type { OsmRowActions } from "./OsmPendingRow";
import { groupPending, SECTION_ORDER, type SectionKey } from "./osmSections";
import { useOsmActions } from "./useOsmActions";
import { useOsmPending } from "./useOsmPending";
import { useOsmSelection } from "./useOsmSelection";

/**
 * Panell de canvis pendents d'OSM: consulta, selecció i accions viuen en hooks
 * propis; aquí només es compon la capçalera, la barra d'accions i les seccions
 * per estat. `docs/OSM_SYNC.md#4` descriu el comportament esperat.
 */
export function OsmSyncPanel({ onSelectHidrant }: { onSelectHidrant?: (id: string) => void }) {
  const { activeAdf } = useAdf();
  const adfId = activeAdf?.id ?? null;
  const { pending, stats, isFetching, loadError } = useOsmPending(adfId);
  const selection = useOsmSelection(pending);
  const osm = useOsmActions();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  if (!activeAdf) {
    return null;
  }

  const loading = isFetching || osm.pullSyncPending;
  const hasItems = pending.length > 0;
  const hasSelected = selection.selectedIds.length > 0;
  const grouped = groupPending(pending);

  // Les seccions amb items surten obertes per defecte.
  const isSectionOpen = (key: SectionKey) => openSections[key] ?? true;
  const toggleSectionOpen = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const rowActions: OsmRowActions = {
    disabled: osm.isPending,
    onSelectHidrant: (id) => onSelectHidrant?.(id),
    onPush: (id) => {
      void osm.pushOne(id);
    },
    onPullFromOsm: (id, label) => {
      void osm.pullFromOsm(id, label);
    },
    onDiscard: (id, section, label) => {
      void osm.discardOne(id, section, label);
    },
    onPurge: (ids) => {
      void osm.purgeMissing(ids, selection.clear);
    },
  };

  return (
    <div className="border border-border-strong rounded-lg shadow-control overflow-hidden">
      {/* Capçalera */}
      <div className="p-3 bg-soft">
        <div className="flex items-center justify-between">
          <h4 className="m-0 text-sm font-semibold">Canvis pendents</h4>
          <button
            onClick={() => {
              void osm.pullSync(stats);
            }}
            disabled={loading}
            aria-label="Baixar d'OSM"
            className={`${secondaryTightClass} disabled:opacity-50`}
            title="Actualitza els hidrants sincronitzats des d'OSM. Els canvis locals es mantenen."
          >
            <ActionGlyph name="arrowDown" />
            OSM
          </button>
        </div>
        <p className="m-0 mt-1 text-xs text-muted">
          Actualitza els hidrants SYNCED des d'OSM. Els canvis locals no es perden.
        </p>
        {loadError && <p className="m-0 mt-1 text-xs text-alert">{loadError}</p>}
      </div>

      {/* Contingut */}
      {loading && !hasItems ? (
        <div className="p-4 text-center text-muted text-sm">Carregant...</div>
      ) : !hasItems ? (
        <div className="p-4 text-center text-muted text-sm">No hi ha canvis pendents</div>
      ) : (
        <>
          {hasSelected && (
            <OsmActionsBar
              count={selection.selectedIds.length}
              disabled={osm.isPending}
              onPush={() => {
                void osm.pushSelected(selection.selectedIds, selection.clear);
              }}
              onDiscard={() => {
                void osm.discardSelected(selection.selectedIds, selection.clear);
              }}
            />
          )}

          <div className="divide-y divide-border">
            {SECTION_ORDER.map((key) => (
              <OsmPendingSection
                key={key}
                section={key}
                items={grouped[key]}
                isOpen={isSectionOpen(key)}
                isSelected={selection.isSelected}
                allSelected={selection.allSelected}
                actions={rowActions}
                onToggleOpen={() => toggleSectionOpen(key)}
                onToggleItem={selection.toggle}
                onToggleAll={selection.toggleSection}
                onPurgeAll={() => {
                  void osm.purgeMissing(undefined, selection.clear);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
