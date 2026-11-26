import type { IncidenciaFeature } from "@territoriadf/contracts/incidencies";
import type {
  IncidenciaEstatFilter,
  IncidenciaFilters,
  IncidenciaPrioritatFilter,
} from "@/hooks/useListFilters";
import { useAdf } from "@/contexts/AdfContext";
import { exportIncidenciaListPdf } from "@/utils/listPdf";
import { PdfExportButton } from "./PdfExportButton";
import {
  ESTATS_INCIDENCIA,
  PRIORITATS_INCIDENCIA,
  emojiPrioritatIncidencia,
  emojiTipusIncidencia,
  labelDeCategoria,
} from "@/utils/incidenciaConstants";
import { compactSelectClass } from "@/styles/uiStyles";

const filterSelectClass = `${compactSelectClass} flex-1 min-w-0`;

export function IncidenciaList({
  filters,
  onSelectIncidencia,
}: {
  filters: IncidenciaFilters;
  onSelectIncidencia?: (feature: IncidenciaFeature) => void;
}) {
  const { activeAdf } = useAdf();
  const filtered = filters.filtered;

  return (
    <div>
      <div className="flex items-stretch gap-2 mb-2">
        <select
          aria-label="Filtra les incidències per estat"
          value={filters.estat}
          onChange={(e) => filters.setEstat(e.target.value as IncidenciaEstatFilter)}
          className={filterSelectClass}
        >
          <option value="">Tots els estats</option>
          {ESTATS_INCIDENCIA.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtra les incidències per prioritat"
          value={filters.prioritat}
          onChange={(e) => filters.setPrioritat(e.target.value as IncidenciaPrioritatFilter)}
          className={filterSelectClass}
        >
          <option value="">Totes les prioritats</option>
          {PRIORITATS_INCIDENCIA.map((option) => (
            <option key={option.value} value={option.value}>
              {option.icon} {option.label.split(" (")[0]}
            </option>
          ))}
        </select>
        <PdfExportButton
          errorLabel="Error generant el PDF de les incidències"
          onExport={() =>
            exportIncidenciaListPdf({
              adf: activeAdf,
              incidencies: filtered,
              total: filters.total,
              filterDescription: filters.description,
            })
          }
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-muted text-sm">
          {filters.isFiltered
            ? "Cap incidència coincideix amb els filtres."
            : "No hi ha incidències obertes."}
        </p>
      ) : (
        <div className="max-h-[45vh] overflow-y-auto border border-soft rounded-lg">
          {filtered.map((f) => {
            const p = f.properties;
            return (
              <div
                key={f.id}
                onClick={() => onSelectIncidencia?.(f)}
                className="px-3 py-2 border-b border-soft cursor-pointer transition-colors duration-100 hover:bg-soft"
              >
                <div className="flex items-start gap-2.5">
                  {/* Icona de domini: la mateixa del detall i del formulari. */}
                  <span aria-hidden className="mt-px shrink-0 text-[1.05rem] leading-none">
                    {emojiTipusIncidencia(p.tipus)}
                  </span>
                  <div className="min-w-0 flex-1 font-semibold text-base leading-tight truncate text-ink">
                    {p.titol}
                  </div>
                </div>
                {/* Segona línia a tot l'ample, començant sota la icona. */}
                <div className="mt-1 flex min-w-0 items-center gap-2.5 text-xs text-muted">
                  <span
                    className={`shrink-0 font-medium ${
                      p.estat === "OBERT"
                        ? "text-alert"
                        : p.estat === "RESOLT" || p.estat === "TANCAT"
                          ? "text-ok"
                          : "text-warn"
                    }`}
                  >
                    {p.estat}
                  </span>
                  {/* Prioritat amb la mateixa icona de domini que el detall. */}
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span aria-hidden>{emojiPrioritatIncidencia(p.prioritat)}</span>
                    <span className="truncate">
                      {labelDeCategoria(PRIORITATS_INCIDENCIA, p.prioritat).split(" (")[0]}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {new Date(p.actualitzat_at).toLocaleString("ca-ES", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
