import { apiFetch } from "../../utils/api";
import { useState } from "react";
import { toast } from "react-toastify";
import type { HidrantFeature } from "../../hooks/useHidrantData";
import type { HydrantUiFields } from "../../utils/osmConversion";
import type { AdfData } from "../../contexts/AdfContext";
import { sendToTelegram } from "../../utils/sendToTelegram";
import { logError } from "../../utils/log";

type FieldPatch = Partial<HydrantUiFields & { observacions: string; coordinates: string }>;

function calculateChanges(
  original: HydrantUiFields,
  modified: HydrantUiFields,
  originalObservacions: string,
  modifiedObservacions: string,
  originalCoords?: { lat: number; lon: number },
  newCoords?: { lat: number; lon: number },
) {
  const changes: FieldPatch = {};
  const originalValues: FieldPatch = {};

  for (const key in modified) {
    const k = key as keyof HydrantUiFields;
    if (original[k] !== modified[k]) {
      changes[k] = modified[k];
      originalValues[k] = original[k];
    }
  }

  if (originalObservacions !== modifiedObservacions) {
    changes.observacions = modifiedObservacions;
    originalValues.observacions = originalObservacions;
  } else {
    // Netejar observacions si no ha canviat (per netejar el valor buit)
    delete changes.observacions;
  }

  if (
    newCoords &&
    originalCoords &&
    (newCoords.lat !== originalCoords.lat || newCoords.lon !== originalCoords.lon)
  ) {
    changes.coordinates = `${newCoords.lat.toFixed(6)}, ${newCoords.lon.toFixed(6)}`;
    originalValues.coordinates = `${originalCoords.lat.toFixed(6)}, ${originalCoords.lon.toFixed(6)}`;
  }

  return { changes, originalValues };
}

export function useHydrantActions(
  feature: HidrantFeature,
  adf: AdfData | null,
  refreshHidrants?: () => Promise<void> | void,
) {
  const [busy, setBusy] = useState(false);
  const poi = {
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
  };

  const afterChange = async () => {
    if (refreshHidrants) {
      await refreshHidrants();
    }
  };

  const save = async (opts: {
    uiFields: HydrantUiFields;
    observacions: string;
    originalUiFields: HydrantUiFields;
    originalObservacions: string;
    newLat?: number;
    newLon?: number;
  }): Promise<boolean> => {
    if (!adf) {
      return false;
    }
    setBusy(true);
    try {
      const privateTags = {
        ...feature.properties.private_tags,
        observacions: opts.observacions.trim() || undefined,
      };
      const hasNewPosition = opts.newLat !== undefined && opts.newLon !== undefined;
      const finalLat = opts.newLat ?? poi.lat;
      const finalLon = opts.newLon ?? poi.lng;
      const { changes, originalValues } = calculateChanges(
        opts.originalUiFields,
        opts.uiFields,
        opts.originalObservacions,
        opts.observacions.trim(),
        { lat: poi.lat, lon: poi.lng },
        hasNewPosition ? { lat: finalLat, lon: finalLon } : undefined,
      );
      const response = await apiFetch(`/api/hidrants/${feature.id}?adf=${adf.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ui_fields: opts.uiFields,
          private_tags: privateTags,
          ...(hasNewPosition ? { lat: opts.newLat, lon: opts.newLon } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error("Error actualitzant dades");
      }

      await sendToTelegram({
        lat: finalLat,
        lon: finalLon,
        tags: { ...feature.properties, ui_fields: opts.uiFields, private_tags: privateTags },
        originalData: originalValues,
        changes,
        adf_id: adf.id,
        isEdit: true,
      });

      toast.success("Hidrant actualitzat");
      await afterChange();
      return true;
    } catch (err) {
      logError("Error en actualitzar l'hidrant", err);
      toast.error("Error en actualitzar l'hidrant");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const quickStatus = async (isOperative: boolean, data: HydrantUiFields) => {
    if (!adf) {
      return;
    }
    const statusText = isOperative ? "OPERATIU" : "FORA DE SERVEI";
    if (!window.confirm(`Vols marcar aquest hidrant com a ${statusText} amb data d'avui?`)) {
      return;
    }

    setBusy(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const newData: HydrantUiFields = {
        ...data,
        surveyDate: today,
        estat: isOperative ? "Operatiu" : "Fora de servei",
      };
      const response = await apiFetch(`/api/hidrants/${feature.id}?adf=${adf.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ui_fields: newData }),
      });
      if (!response.ok) {
        throw new Error("Error actualitzant");
      }
      toast.success(`Hidrant actualitzat a ${statusText}`);

      await sendToTelegram({
        lat: poi.lat,
        lon: poi.lng,
        tags: { ...feature.properties, ui_fields: newData },
        originalData: {
          estat: feature.properties.ui_fields.estat,
          surveyDate: feature.properties.ui_fields.surveyDate,
        },
        changes: { estat: newData.estat, surveyDate: today },
        adf_id: adf.id,
        isEdit: true,
      });

      await afterChange();
      return newData;
    } catch (err) {
      logError("Error en l'actualització ràpida", err);
      toast.error("Error en l’actualització ràpida");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!adf) {
      return;
    }
    if (!window.confirm("Estàs segur que vols esborrar aquest hidrant?")) {
      return;
    }

    setBusy(true);
    try {
      const response = await apiFetch(`/api/hidrants/${feature.id}?adf=${adf.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Error esborrant l'hidrant");
      }
      try {
        await sendToTelegram({
          lat: poi.lat,
          lon: poi.lng,
          tags: { ...feature.properties },
          adf_id: adf.id,
          action: "delete",
        });
      } catch (err) {
        // L'esborrat ja s'ha fet: una fallada de Telegram no ha de fer-lo semblar fallit.
        logError("Error notificant l'esborrat a Telegram", err);
      }
      toast.success("Hidrant esborrat");
      await afterChange();
    } catch (err) {
      logError("Error en esborrar l'hidrant", err);
      toast.error("Error en esborrar l'hidrant");
    } finally {
      setBusy(false);
    }
  };

  return { busy, save, quickStatus, remove, poi };
}
