import type { PendingHidrant } from "@territoriadf/contracts/osm";

import { hidrantLabel, type SectionKey } from "./osmSections";
import { syncErrorMessages } from "./syncErrorMessages";

/** Accions que una fila necessita; les comparteix la secció. */
export type OsmRowActions = {
  disabled: boolean;
  onSelectHidrant: (id: string) => void;
  onPush: (id: string) => void;
  onPullFromOsm: (id: string, label: string) => void;
  onDiscard: (id: string, section: SectionKey, label: string) => void;
  onPurge: (ids: string[]) => void;
};

/**
 * Fila d'un pendent: casella (tret dels que ja no són a OSM), errors de
 * validació i les accions que tenen sentit per al seu estat.
 */
export function OsmPendingRow({
  item,
  section,
  selected,
  actions,
  onToggle,
}: {
  item: PendingHidrant;
  section: SectionKey;
  selected: boolean;
  actions: OsmRowActions;
  onToggle: () => void;
}) {
  const errors = syncErrorMessages(item.sync_error);
  const label = hidrantLabel(item);
  const disabled = actions.disabled;

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-t border-border">
      {section !== "MISSING_IN_OSM" && (
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => actions.onSelectHidrant(item.id)}
            className="text-[0.8rem] font-semibold text-ink hover:text-blue-600 cursor-pointer bg-transparent border-0 p-0 truncate"
            title="Seleccionar al mapa"
          >
            {label}
          </button>
          {item.osm_id && <span className="text-[0.7rem] text-muted">OSM {item.osm_id}</span>}
        </div>
        {errors.length > 0 && (
          <div className="text-[0.7rem] text-muted mt-0.5">
            {errors.map((e, i) => (
              <div key={i}>• {e}</div>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {/* Pujar: PENDING_CREATE, PENDING_UPDATE, CONFLICT (keep local), ERROR (retry), REVIEW */}
        {(section === "PENDING_CREATE" ||
          section === "PENDING_UPDATE" ||
          section === "ERROR" ||
          section === "REVIEW") && (
          <button
            onClick={() => actions.onPush(item.id)}
            disabled={disabled}
            className="text-[0.7rem] px-1.5 py-0.5 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
            title={
              section === "ERROR"
                ? "Reintentar pujada"
                : section === "REVIEW"
                  ? "Pujar (ignorar warnings)"
                  : "Pujar a OSM"
            }
          >
            ↑
          </button>
        )}
        {/* Baixar: CONFLICT (keep OSM) */}
        {section === "CONFLICT" && (
          <button
            onClick={() => actions.onPullFromOsm(item.id, label)}
            disabled={disabled}
            className="text-[0.7rem] px-1.5 py-0.5 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
            title="Aplicar versió d'OSM"
          >
            ↓
          </button>
        )}
        {/* Esborrar d'OSM: PENDING_DELETE */}
        {section === "PENDING_DELETE" && (
          <button
            onClick={() => actions.onPush(item.id)}
            disabled={disabled}
            className="text-[0.7rem] px-1.5 py-0.5 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
            title="Confirmar esborrat a OSM"
          >
            ↑
          </button>
        )}
        {/* Ja no és a OSM → purga manual; la resta → descartar */}
        {section === "MISSING_IN_OSM" ? (
          <button
            onClick={() => actions.onPurge([item.id])}
            disabled={disabled}
            className="text-[0.7rem] px-1.5 py-0.5 bg-white text-red-600 border border-border rounded cursor-pointer disabled:opacity-50"
            title="Esborrar definitivament de la base de dades"
          >
            🗑
          </button>
        ) : (
          <button
            onClick={() => actions.onDiscard(item.id, section, label)}
            disabled={disabled}
            className="text-[0.7rem] px-1.5 py-0.5 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
            title={
              section === "PENDING_CREATE"
                ? "Esborrar de la BD"
                : "Revertir als valors d'OSM? Es perdràn els canvis locals."
            }
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
