import { useCallback, useEffect, useRef, useState } from "react";

import type { Adf } from "@territoriadf/contracts/adfs";

import { DEFAULT_VIEW, bboxToBounds, fromLngLat, viewForAdf } from "@/map/core/geometry";
import { getBottomSheetInset } from "@/map/shared/uiInset";
import type { FocusCommand, LatLon, MapFocus, ViewState } from "@/map/core/types";
import { clearSavedView, useMapViewPersistence } from "@/map/shared/useMapViewPersistence";

/** Comptador de mòdul: només cal que el token sigui únic i creixent. */
let focusSequence = 0;

function focusForAdf(adf: Adf | null): FocusCommand {
  if (adf?.bbox) {
    return { kind: "bounds", bounds: bboxToBounds(adf.bbox), padding: 0 };
  }
  if (adf?.center) {
    return { kind: "point", position: { lat: adf.center[0], lon: adf.center[1] }, zoom: 14 };
  }
  return { kind: "point", position: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom };
}

/**
 * Càmera del mapa: vista actual, ordres de focus i persistència per ADF.
 *
 * En canviar d'ADF es descarta la vista desada i s'encuadra el nou límit; la
 * resta d'ordres (`requestFocus`, `centerOn`) són les que reben la selecció, la
 * creació, la ruta i el seguiment.
 */
export function useMapFocus({ adf, hasDeepLink }: { adf: Adf | null; hasDeepLink: boolean }) {
  const adfId = adf?.id ?? null;
  const { initialView, hasSavedView, saveView } = useMapViewPersistence({
    adfId,
    fallbackView: viewForAdf(adf),
    ignoreSaved: hasDeepLink,
  });

  const [view, setView] = useState<ViewState | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const requestFocus = useCallback((command: FocusCommand) => {
    focusSequence += 1;
    setFocus({ ...command, token: focusSequence } as MapFocus);
  }, []);

  /** Descarta l'última ordre de càmera (en remuntar el motor). */
  const clearFocus = useCallback(() => setFocus(null), []);

  const handleViewChange = useCallback(
    (next: ViewState) => {
      setView(next);
      saveView(next);
    },
    [saveView],
  );

  const centerOn = useCallback(
    (target: LatLon, options?: { keepZoom?: boolean }) => {
      // El bottomsheet s'obre amb la selecció: es deixa un torn perquè el
      // panell ocupi la seva alçada final abans de calcular l'inset.
      window.setTimeout(() => {
        requestFocus({
          kind: "point",
          position: target,
          zoom: 15,
          keepZoom: options?.keepZoom ?? false,
          insetBottom: getBottomSheetInset(),
        });
      }, 400);
    },
    [requestFocus],
  );

  /** Centra a unes coordenades GeoJSON `[lon, lat]` (llistes, seguiment). */
  const centerOnCoordinates = useCallback(
    (coordinates: [number, number]) =>
      requestFocus({
        kind: "point",
        position: fromLngLat(coordinates[0], coordinates[1]),
        zoom: 15,
        insetBottom: getBottomSheetInset(),
      }),
    [requestFocus],
  );

  const bboxKey = adf?.bbox ? adf.bbox.join(",") : "";
  const lastAdfRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (lastAdfRef.current === undefined) {
      lastAdfRef.current = adfId;
      if (!hasSavedView && !hasDeepLink) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- la càmera del mapa és un sistema extern
        requestFocus(focusForAdf(adf));
      }
      return;
    }
    if (lastAdfRef.current !== adfId) {
      lastAdfRef.current = adfId;
      clearSavedView();
      requestFocus(focusForAdf(adf));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bboxKey cobreix canvis de límits
  }, [adfId, bboxKey, hasDeepLink, hasSavedView, requestFocus]);

  return {
    view,
    focus,
    initialView,
    requestFocus,
    clearFocus,
    centerOn,
    centerOnCoordinates,
    handleViewChange,
  };
}
