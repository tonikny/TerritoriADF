import type { PendingHidrant } from "@territoriadf/contracts/osm";

import { hidrantLabel, type SectionKey } from "./osmSections";
import { secondaryRowClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";
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
            className="text-sm font-semibold text-ink hover:text-primary cursor-pointer bg-transparent border-0 p-0 truncate"
            title="Seleccionar al mapa"
          >
            {label}
          </button>
          {/* El número només quan la fila té adreça: si no, ja és l'etiqueta. */}
          {item.osm_id && item.street && (
            <span className="text-xs text-muted shrink-0">OSM {item.osm_id}</span>
          )}
        </div>
        {errors.length > 0 && (
          <div className="text-xs text-muted mt-0.5">
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
            aria-label={
              section === "ERROR"
                ? "Reintentar pujada"
                : section === "REVIEW"
                  ? "Pujar (ignorar avisos)"
                  : "Pujar a OSM"
            }
            className={`${secondaryRowClass} disabled:opacity-50`}
            title={
              section === "ERROR"
                ? "Reintentar pujada"
                : section === "REVIEW"
                  ? "Pujar (ignorar warnings)"
                  : "Pujar a OSM"
            }
          >
            <ActionGlyph name="arrowUp" />
            OSM
          </button>
        )}
        {/* Baixar: CONFLICT (keep OSM) */}
        {section === "CONFLICT" && (
          <button
            onClick={() => actions.onPullFromOsm(item.id, label)}
            disabled={disabled}
            aria-label="Aplicar versió d'OSM"
            className={`${secondaryRowClass} disabled:opacity-50`}
            title="Aplicar versió d'OSM"
          >
            <ActionGlyph name="arrowDown" />
          </button>
        )}
        {/* Esborrar d'OSM: PENDING_DELETE */}
        {section === "PENDING_DELETE" && (
          <button
            onClick={() => actions.onPush(item.id)}
            disabled={disabled}
            aria-label="Confirmar esborrat a OSM"
            className={`${secondaryRowClass} disabled:opacity-50`}
            title="Confirmar esborrat a OSM"
          >
            <ActionGlyph name="arrowUp" />
          </button>
        )}
        {/* Ja no és a OSM → purga manual; la resta → descartar */}
        {section === "MISSING_IN_OSM" ? (
          <button
            onClick={() => actions.onPurge([item.id])}
            disabled={disabled}
            aria-label="Esborrar definitivament de la base de dades"
            className={`${secondaryRowClass} text-alert disabled:opacity-50`}
            title="Esborrar definitivament de la base de dades"
          >
            <ActionGlyph name="trash" />
          </button>
        ) : (
          <button
            onClick={() => actions.onDiscard(item.id, section, label)}
            disabled={disabled}
            aria-label={
              section === "PENDING_CREATE" ? "Esborrar de la BD" : "Revertir als valors d'OSM"
            }
            className={`${secondaryRowClass} disabled:opacity-50`}
            title={
              section === "PENDING_CREATE"
                ? "Esborrar de la BD"
                : "Revertir als valors d'OSM? Es perdràn els canvis locals."
            }
          >
            <ActionGlyph name="close" />
          </button>
        )}
      </div>
    </div>
  );
}
