import { useCallback, useState } from "react";
import { toast } from "react-toastify";

import type { Adf } from "@territoriadf/contracts/adfs";
import type { SessionUser } from "@territoriadf/contracts/users";

import type { CreateType } from "@/types";
import type { LatLon } from "@/map/core/types";
import { getBottomSheetInset } from "@/map/shared/uiInset";
import { isPointInBoundary } from "@/utils/geo";

import type { FocusCommand } from "./useMapFocus";

/**
 * Creació de nodes: punt triat al mapa i pas del formulari.
 *
 * Els guards viuen aquí perquè són els mateixos per a les tres vies (clic,
 * menú contextual i long press): només es crea a l'ADF pròpia (l'admin, a
 * qualsevol) i dins del límit de l'ADF activa.
 */
export function useMapCreation({
  user,
  activeAdf,
  boundaryGeojson,
  requestFocus,
  onStart,
}: {
  user: SessionUser | null;
  activeAdf: Adf | null;
  boundaryGeojson: string | null;
  requestFocus: (command: FocusCommand) => void;
  onStart: () => void;
}) {
  const [position, setPosition] = useState<LatLon | null>(null);
  const [form, setForm] = useState<CreateType>(null);

  const open = useCallback(
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
      onStart();
      setPosition(target);
      setForm("selection");
      window.setTimeout(() => {
        requestFocus({
          kind: "point",
          position: target,
          keepZoom: true,
          insetBottom: getBottomSheetInset(),
        });
      }, 400);
    },
    [activeAdf, boundaryGeojson, onStart, requestFocus, user],
  );

  const close = useCallback(() => {
    setPosition(null);
    setForm(null);
  }, []);

  return { position, form, setPosition, setForm, open, close };
}
