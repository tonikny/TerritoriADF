import type { HidrantFeature } from "../../../hooks/useHidrantData";
import type { IncidenciaFeature } from "../../../types";
import { useHydrantFilters, useIncidenciaFilters } from "../../../hooks/useListFilters";
import { CollapsibleSection } from "../shared/CollapsibleSection";
import { HydrantList } from "../../lists/HydrantList";
import { IncidenciaList } from "../../lists/IncidenciaList";

export function InformesTab({
  features,
  incidenciaFeatures,
  onSelectNode,
  onSelectIncidencia,
}: {
  features: HidrantFeature[];
  incidenciaFeatures: IncidenciaFeature[];
  onSelectNode?: (feature: HidrantFeature) => void;
  onSelectIncidencia?: (feature: IncidenciaFeature) => void;
}) {
  const hydrantFilters = useHydrantFilters(features);
  const incidenciaFilters = useIncidenciaFilters(incidenciaFeatures);

  return (
    <div className="p-4">
      <h3 className="m-0 mb-3 text-[0.95rem] font-semibold">Informes</h3>
      <CollapsibleSection title="Hidrants" count={hydrantFilters.filtered.length}>
        <HydrantList filters={hydrantFilters} onSelectNode={onSelectNode} />
      </CollapsibleSection>
      <CollapsibleSection title="Incidències" count={incidenciaFilters.filtered.length}>
        <IncidenciaList filters={incidenciaFilters} onSelectIncidencia={onSelectIncidencia} />
      </CollapsibleSection>
    </div>
  );
}
