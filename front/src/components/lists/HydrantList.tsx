import type { HidrantFeature } from "../../hooks/useHidrantData";
import type { HidrantEstatFilter, HydrantFilters } from "../../hooks/useListFilters";
import { HIDRANT_ESTAT_OPTIONS } from "../../hooks/useListFilters";
import { useAdf } from "../../contexts/AdfContext";
import { exportHydrantListPdf } from "../../utils/listPdf";
import { getHydrantStatus, getHydrantIconUrl } from "../../utils/icons";
import { inputClass, selectClass } from "../../styles/uiStyles";
import { PdfExportButton } from "./PdfExportButton";

export function HydrantList({
  filters,
  onSelectNode,
}: {
  filters: HydrantFilters;
  onSelectNode?: (feature: HidrantFeature) => void;
}) {
  const { activeAdf } = useAdf();
  const filtered = filters.filtered;

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          placeholder="Cerca per carrer/barri..."
          aria-label="Cerca hidrants per carrer o barri"
          value={filters.search}
          onChange={(e) => filters.setSearch(e.target.value)}
          className={`${inputClass} flex-1 min-w-0 p-2! box-border`}
        />
        <select
          aria-label="Filtra els hidrants per estat"
          value={filters.estat}
          onChange={(e) => filters.setEstat(e.target.value as HidrantEstatFilter)}
          className={`${selectClass} w-auto! shrink-0 px-1.5 py-2 text-[0.8rem]`}
        >
          <option value="">Tots els estats</option>
          {HIDRANT_ESTAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <PdfExportButton
          errorLabel="Error generant el PDF dels hidrants"
          onExport={() =>
            exportHydrantListPdf({
              adf: activeAdf,
              hydrants: filtered,
              total: filters.total,
              filterDescription: filters.description,
            })
          }
        />
      </div>
      <div className="max-h-[35vh] overflow-y-auto border border-soft rounded">
        {filtered.length === 0 ? (
          <p className="text-center text-muted p-4 text-[0.85rem]">
            {filters.isFiltered
              ? "Cap hidrant coincideix amb els filtres."
              : "No s'han trobat hidrants."}
          </p>
        ) : (
          filtered.map((f) => {
            const ui = f.properties.ui_fields;
            const address = `${ui.street || ""} ${ui.num || ""}`.trim();
            const neighborhood = ui.barri ? `(${ui.barri})` : "";
            const diameters = ui.diameters ? ui.diameters.split(";").join(", ") + " mm" : "";
            const isOutOfService = ui.estat === "Fora de servei";
            return (
              <div
                key={f.id}
                onClick={() => onSelectNode?.(f)}
                className="flex items-center gap-3 px-3 py-2.5 border-b border-soft cursor-pointer transition-colors duration-100 hover:bg-[#f5f5f5]"
              >
                <img
                  src={getHydrantIconUrl(getHydrantStatus(ui))}
                  alt="Estat"
                  className="w-4 h-6.5 object-contain shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="font-bold text-[0.95rem] whitespace-nowrap overflow-hidden text-ellipsis text-ink"
                    title={`${address} ${neighborhood}`}
                  >
                    {address || "Sense adreça"}{" "}
                    <span className="font-normal text-muted text-[0.85rem]">{neighborhood}</span>
                  </div>
                  <div className="text-xs text-muted flex flex-wrap gap-1 mt-0.5">
                    <span
                      className={`font-medium ${isOutOfService ? "text-[#d32f2f]" : "text-[#2e7d32]"}`}
                    >
                      {ui.estat || "Desconegut"}
                    </span>
                    <span>•</span>
                    <span>{ui.surveyDate || "No revisat"}</span>
                    {diameters && (
                      <>
                        <span>•</span>
                        <span>{diameters}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
