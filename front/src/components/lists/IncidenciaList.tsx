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
  emojiPrioritatIncidencia,
  emojiTipusIncidencia,
  ESTATS_INCIDENCIA,
  PRIORITATS_INCIDENCIA,
  labelDeCategoria,
} from "@/utils/incidenciaConstants";
import { selectClass } from "@/styles/uiStyles";

const filterSelectClass = `${selectClass} w-auto! flex-1 px-1.5 py-2 text-[0.8rem]`;

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
      <div className="flex gap-2 mb-2">
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
        <p className="text-muted text-[0.85rem]">
          {filters.isFiltered
            ? "Cap incidència coincideix amb els filtres."
            : "No hi ha incidències obertes."}
        </p>
      ) : (
        <div className="max-h-[35vh] overflow-y-auto border border-soft rounded">
          {filtered.map((f) => {
            const p = f.properties;
            return (
              <div
                key={f.id}
                onClick={() => onSelectIncidencia?.(f)}
                className="flex items-center gap-3 px-3 py-2.5 border-b border-soft cursor-pointer transition-colors duration-100 hover:bg-[#f5f5f5]"
              >
                <span className="text-[1.1rem]">{emojiTipusIncidencia(p.tipus)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[0.95rem] whitespace-nowrap overflow-hidden text-ellipsis text-ink">
                    {p.titol}
                  </div>
                  <div className="text-xs text-muted flex flex-wrap gap-1 mt-0.5">
                    <span
                      className={`font-medium ${
                        p.estat === "OBERT"
                          ? "text-[#d32f2f]"
                          : p.estat === "RESOLT" || p.estat === "TANCAT"
                            ? "text-[#2e7d32]"
                            : "text-[#ed6c02]"
                      }`}
                    >
                      {p.estat}
                    </span>
                    <span>•</span>
                    <span>
                      {emojiPrioritatIncidencia(p.prioritat)}{" "}
                      {labelDeCategoria(PRIORITATS_INCIDENCIA, p.prioritat)}
                    </span>
                    <span>•</span>
                    <span>{new Date(p.actualitzat_at).toLocaleString("ca-ES")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
