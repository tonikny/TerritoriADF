import { useMemo, useState } from "react";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { IncidenciaEstat, IncidenciaFeature, IncidenciaPrioritat } from "@/types";
import { ESTATS_INCIDENCIA, PRIORITATS_INCIDENCIA } from "@/utils/incidenciaConstants";

/** Valor del filtre per als hidrants sense estat informat. */
export const HIDRANT_ESTAT_DESCONEGUT = "DESCONEGUT";

export type HidrantEstatFilter =
  "" | "Operatiu" | "Fora de servei" | typeof HIDRANT_ESTAT_DESCONEGUT;

export const HIDRANT_ESTAT_OPTIONS: { value: Exclude<HidrantEstatFilter, "">; label: string }[] = [
  { value: "Operatiu", label: "Operatiu" },
  { value: "Fora de servei", label: "Fora de servei" },
  { value: HIDRANT_ESTAT_DESCONEGUT, label: "Sense dades" },
];

/** Etiqueta curta d'una opció ("Baixa (No urgent)" → "Baixa") per a filtres i informes. */
function shortLabel(options: { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label.split(" (")[0] ?? value;
}

export function useHidrantFilters(features: HidrantFeature[]) {
  const [search, setSearch] = useState("");
  const [estat, setEstat] = useState<HidrantEstatFilter>("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return features.filter((feature) => {
      const ui = feature.properties.ui_fields;
      if (estat === HIDRANT_ESTAT_DESCONEGUT) {
        if (ui.estat) {
          return false;
        }
      } else if (estat && ui.estat !== estat) {
        return false;
      }
      if (!term) {
        return true;
      }
      return `${ui.street ?? ""} ${ui.num ?? ""} ${ui.barri ?? ""}`.toLowerCase().includes(term);
    });
  }, [features, search, estat]);

  const description = [
    estat ? `estat «${estat === HIDRANT_ESTAT_DESCONEGUT ? "sense dades" : estat}»` : "",
    search.trim() ? `cerca «${search.trim()}»` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    search,
    setSearch,
    estat,
    setEstat,
    filtered,
    total: features.length,
    description,
    isFiltered: description !== "",
  };
}

export type HidrantFilters = ReturnType<typeof useHidrantFilters>;

export type IncidenciaEstatFilter = "" | IncidenciaEstat;
export type IncidenciaPrioritatFilter = "" | IncidenciaPrioritat;

export function useIncidenciaFilters(features: IncidenciaFeature[]) {
  const [estat, setEstat] = useState<IncidenciaEstatFilter>("");
  const [prioritat, setPrioritat] = useState<IncidenciaPrioritatFilter>("");

  const filtered = useMemo(
    () =>
      features.filter(
        (feature) =>
          (!estat || feature.properties.estat === estat) &&
          (!prioritat || feature.properties.prioritat === prioritat),
      ),
    [features, estat, prioritat],
  );

  const description = [
    estat ? `estat «${shortLabel(ESTATS_INCIDENCIA, estat)}»` : "",
    prioritat ? `prioritat «${shortLabel(PRIORITATS_INCIDENCIA, prioritat)}»` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    estat,
    setEstat,
    prioritat,
    setPrioritat,
    filtered,
    total: features.length,
    description,
    isFiltered: description !== "",
  };
}

export type IncidenciaFilters = ReturnType<typeof useIncidenciaFilters>;
