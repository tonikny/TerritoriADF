import { useEffect, useRef } from "react";

import type { HidrantFeature } from "@territoriadf/contracts/hidrants";

import type { IncidenciaFeature } from "@/types";

/**
 * Deep links `?node=` i `?incidencia=`: s'obren un sol cop, quan les dades de
 * l'ADF ja han arribat. Cada id té el seu `ref` perquè un refresc de dades no
 * torni a obrir el panell que l'usuari ja ha tancat.
 *
 * Es manté la compatibilitat amb enllaços antics de `?node=` que apuntaven a
 * una incidència.
 */
export function useMapDeepLinks({
  nodeId,
  incidenciaId,
  features,
  incidenciaFeatures,
  selectNode,
  selectIncidencia,
}: {
  nodeId: string | null;
  incidenciaId: string | null;
  features: readonly HidrantFeature[];
  incidenciaFeatures: readonly IncidenciaFeature[];
  selectNode: (feature: HidrantFeature) => void;
  selectIncidencia: (feature: IncidenciaFeature) => void;
}) {
  const handledNode = useRef<string | null>(null);
  const handledIncidencia = useRef<string | null>(null);

  useEffect(() => {
    if (!nodeId || handledNode.current === nodeId) {
      return;
    }
    const hidrant = features.find((feature) => feature.id === nodeId);
    if (hidrant) {
      handledNode.current = nodeId;
      selectNode(hidrant);
      return;
    }
    // Compatibilitat amb enllaços antics, quan les incidències també feien servir `node`.
    const incidencia = incidenciaFeatures.find((feature) => feature.id === nodeId);
    if (incidencia) {
      handledNode.current = nodeId;
      selectIncidencia(incidencia);
    }
  }, [nodeId, features, incidenciaFeatures, selectNode, selectIncidencia]);

  useEffect(() => {
    if (!incidenciaId || handledIncidencia.current === incidenciaId) {
      return;
    }
    const incidencia = incidenciaFeatures.find((feature) => feature.id === incidenciaId);
    if (incidencia) {
      handledIncidencia.current = incidenciaId;
      selectIncidencia(incidencia);
    }
  }, [incidenciaId, incidenciaFeatures, selectIncidencia]);
}
