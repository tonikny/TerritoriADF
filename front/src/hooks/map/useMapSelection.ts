import { useCallback, useEffect, useState } from "react";

import type { HidrantFeature } from "@territoriadf/contracts/hidrants";

import type { IncidenciaFeature } from "@/types";
import { fromLngLat } from "@/map/core/geometry";
import type { LatLon } from "@/map/core/types";
import { setIncidenciaUrlParam, setNodeUrlParam } from "@/utils/urlParams";

/**
 * Selecció del mapa: hidrant o incidència obert al bottomsheet, mode edició i
 * posició arrossegada sense desar.
 *
 * `selectNode`/`selectIncidencia` sincronitzen la URL (`?node=`, `?incidencia=`)
 * perquè l'estat sigui compartible; els `deselect*` la netegen.
 */
export function useMapSelection({
  features,
  onFocus,
}: {
  features: readonly HidrantFeature[];
  onFocus: (target: LatLon) => void;
}) {
  const [selectedNode, setSelectedNode] = useState<HidrantFeature | null>(null);
  const [selectedIncidencia, setSelectedIncidencia] = useState<IncidenciaFeature | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftPosition, setDraftPosition] = useState<LatLon | null>(null);

  const selectNode = useCallback(
    (feature: HidrantFeature) => {
      setNodeUrlParam(feature.id);
      setIncidenciaUrlParam(null);
      setSelectedNode(feature);
      setSelectedIncidencia(null);
      setEditing(false);
      setDraftPosition(null);
      onFocus(fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]));
    },
    [onFocus],
  );

  const selectIncidencia = useCallback(
    (feature: IncidenciaFeature) => {
      setIncidenciaUrlParam(feature.id);
      setNodeUrlParam(null);
      setSelectedIncidencia(feature);
      setSelectedNode(null);
      setEditing(false);
      setDraftPosition(null);
      onFocus(fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]));
    },
    [onFocus],
  );

  /** Selecció per id (llistes, alertes, enllaços interns). */
  const selectNodeById = useCallback(
    (id: string) => {
      const feature = features.find((candidate) => candidate.id === id);
      if (feature) {
        selectNode(feature);
      }
    },
    [features, selectNode],
  );

  const deselectNode = useCallback(() => {
    setNodeUrlParam(null);
    setSelectedNode(null);
    setEditing(false);
    setDraftPosition(null);
  }, []);

  const deselectIncidencia = useCallback(() => {
    setIncidenciaUrlParam(null);
    setSelectedIncidencia(null);
    setEditing(false);
    setDraftPosition(null);
  }, []);

  /** Tanca qualsevol selecció i neteja la URL: punt de partida de la creació. */
  const clearSelection = useCallback(() => {
    setNodeUrlParam(null);
    setIncidenciaUrlParam(null);
    setSelectedNode(null);
    setSelectedIncidencia(null);
    setEditing(false);
    setDraftPosition(null);
  }, []);

  const toggleEditing = useCallback(() => {
    if (editing) {
      setDraftPosition(null);
    }
    setEditing(!editing);
  }, [editing]);

  // Després d'un refresc d'hidrants, la selecció apunta a l'objecte vell: si
  // el node encara existeix, es reemplaça per la versió nova (i si ha
  // desaparegut, es manté el que hi havia fins que l'usuari tanqui el panell).
  useEffect(() => {
    if (!selectedNode) {
      return;
    }
    const updated = features.find((feature) => feature.id === selectedNode.id);
    if (updated && updated !== selectedNode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronitza la selecció amb dades refrescades
      setSelectedNode(updated);
    }
  }, [features, selectedNode]);

  return {
    selectedNode,
    selectedIncidencia,
    editing,
    draftPosition,
    setDraftPosition,
    setEditing,
    selectNode,
    selectNodeById,
    selectIncidencia,
    deselectNode,
    deselectIncidencia,
    clearSelection,
    toggleEditing,
  };
}
