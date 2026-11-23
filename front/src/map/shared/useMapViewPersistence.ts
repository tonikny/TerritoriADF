import { useCallback, useEffect, useRef, useState } from "react";
import { storageKey } from "@/utils/storageKeys";
import type { ViewState } from "@/map/core/types";

const MAP_POS_KEY = storageKey("map_pos");

type SavedView = {
  adfId: number;
  lat: number;
  lon: number;
  zoom: number;
};

export function readSavedView(adfId: number | null): ViewState | null {
  if (adfId === null) {
    return null;
  }
  try {
    const raw = localStorage.getItem(MAP_POS_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SavedView>;
    if (
      parsed.adfId !== adfId ||
      typeof parsed.lat !== "number" ||
      typeof parsed.lon !== "number" ||
      typeof parsed.zoom !== "number"
    ) {
      return null;
    }
    return { center: { lat: parsed.lat, lon: parsed.lon }, zoom: parsed.zoom };
  } catch {
    return null;
  }
}

export function clearSavedView(): void {
  try {
    localStorage.removeItem(MAP_POS_KEY);
  } catch {
    /* ignorem */
  }
}

export function useMapViewPersistence({
  adfId,
  fallbackView,
  ignoreSaved,
}: {
  adfId: number | null;
  fallbackView: ViewState;
  ignoreSaved: boolean;
}) {
  const [initial] = useState(() => {
    const saved = ignoreSaved ? null : readSavedView(adfId);
    return { view: saved ?? fallbackView, hasSaved: saved !== null };
  });
  const initialView = initial.view;
  const saveTimer = useRef<number | null>(null);

  const saveView = useCallback(
    (view: ViewState) => {
      if (adfId === null) {
        return;
      }
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        try {
          localStorage.setItem(
            MAP_POS_KEY,
            JSON.stringify({
              adfId,
              lat: view.center.lat,
              lon: view.center.lon,
              zoom: view.zoom,
            }),
          );
        } catch {
          /* storage ple o no disponible */
        }
      }, 250);
    },
    [adfId],
  );

  useEffect(
    () => () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
    },
    [],
  );

  return { initialView, hasSavedView: initial.hasSaved, saveView };
}
