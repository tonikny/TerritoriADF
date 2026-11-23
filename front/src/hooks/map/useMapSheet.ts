import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import type { Adf } from "@territoriadf/contracts/adfs";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { SessionUser } from "@territoriadf/contracts/users";

import { fromLngLat } from "@/map/core/geometry";
import type { LatLon } from "@/map/core/types";
import { getBottomSheetInset } from "@/map/shared/uiInset";
import type { CreateType, IncidenciaFeature } from "@/types";
import { isPointInBoundary } from "@/utils/geo";
import { setIncidenciaUrlParam, setNodeUrlParam } from "@/utils/urlParams";

import type { FocusCommand } from "./useMapFocus";

/**
 * Què hi ha obert al bottomsheet: un hidrant, una incidència o una creació.
 *
 * És un sol hook perquè només hi pot haver una cosa oberta: obrir-ne una en
 * tanca una altra. Els guards de creació són els mateixos per a les tres vies
 * (clic, menú contextual i long press): només es crea a l'ADF pròpia (l'admin,
 * a qualsevol) i dins del límit de l'ADF activa.
 */
export function useMapSheet({
  features,
  user,
  activeAdf,
  boundaryGeojson,
  onFocus,
  requestFocus,
}: {
  features: readonly HidrantFeature[];
  user: SessionUser | null;
  activeAdf: Adf | null;
  boundaryGeojson: string | null;
  onFocus: (target: LatLon) => void;
  requestFocus: (command: FocusCommand) => void;
}) {
  const [selectedNode, setSelectedNode] = useState<HidrantFeature | null>(null);
  const [selectedIncidencia, setSelectedIncidencia] = useState<IncidenciaFeature | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftPosition, setDraftPosition] = useState<LatLon | null>(null);
  const [createPosition, setCreatePosition] = useState<LatLon | null>(null);
  const [createForm, setCreateForm] = useState<CreateType>(null);

  /** Tanca el panell: selecció, edició, esborrany i creació. */
  const close = useCallback(() => {
    setNodeUrlParam(null);
    setIncidenciaUrlParam(null);
    setSelectedNode(null);
    setSelectedIncidencia(null);
    setEditing(false);
    setDraftPosition(null);
    setCreatePosition(null);
    setCreateForm(null);
  }, []);

  const selectNode = useCallback(
    (feature: HidrantFeature) => {
      close();
      setNodeUrlParam(feature.id);
      setSelectedNode(feature);
      onFocus(fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]));
    },
    [close, onFocus],
  );

  const selectIncidencia = useCallback(
    (feature: IncidenciaFeature) => {
      close();
      setIncidenciaUrlParam(feature.id);
      setSelectedIncidencia(feature);
      onFocus(fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]));
    },
    [close, onFocus],
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

  const openCreation = useCallback(
    (target: LatLon) => {
      if (!user) {
        return;
      }
      if (user.role !== "admin" && user.adf_id && activeAdf && activeAdf.id !== user.adf_id) {
        toast.warning("Només pots crear hidrants i incidències a la teva ADF");
        return;
      }
      if (!isPointInBoundary(target.lat, target.lon, boundaryGeojson)) {
        toast.warning("Coordenades fora del límit de l'ADF");
        return;
      }
      close();
      setCreatePosition(target);
      setCreateForm("selection");
      window.setTimeout(() => {
        requestFocus({
          kind: "point",
          position: target,
          keepZoom: true,
          insetBottom: getBottomSheetInset(),
        });
      }, 400);
    },
    [activeAdf, boundaryGeojson, close, requestFocus, user],
  );

  /** En sortir del mode edició es descarta la posició arrossegada sense desar. */
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
    setEditing,
    toggleEditing,
    setDraftPosition,
    selectNode,
    selectIncidencia,
    selectNodeById,
    close,
    creation: {
      position: createPosition,
      form: createForm,
      open: openCreation,
      setPosition: setCreatePosition,
      setForm: setCreateForm,
    },
  };
}
