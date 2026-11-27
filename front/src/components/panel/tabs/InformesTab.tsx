import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { IncidenciaFeature } from "@territoriadf/contracts/incidencies";
import { useHidrantFilters, useIncidenciaFilters } from "@/hooks/useListFilters";
import { CollapsibleSection } from "@/shared/ui/CollapsibleSection";
import { HidrantList } from "@/components/lists/HidrantList";
import { IncidenciaList } from "@/components/lists/IncidenciaList";

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
  const hidrantFilters = useHidrantFilters(features);
  const incidenciaFilters = useIncidenciaFilters(incidenciaFeatures);

  return (
    <div className="p-4">
      <h3 className="panel-title mb-3">Informes</h3>
      <CollapsibleSection title="Hidrants" count={hidrantFilters.filtered.length}>
        <HidrantList filters={hidrantFilters} onSelectNode={onSelectNode} />
      </CollapsibleSection>
      <CollapsibleSection title="Incidències" count={incidenciaFilters.filtered.length}>
        <IncidenciaList filters={incidenciaFilters} onSelectIncidencia={onSelectIncidencia} />
      </CollapsibleSection>
    </div>
  );
}
