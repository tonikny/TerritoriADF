import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import { toast } from "react-toastify";

import { useAdf } from "@/contexts/AdfContext";
import { apiErrorMessage } from "@/shared/api/client";
import { sendToTelegram } from "@/shared/api/notifications";
import { logError } from "@/utils/log";
import { useOsmMutations } from "./mutations";

/**
 * Accions de sync d'un hidrant concret. L'esborrat a OSM també s'ha de
 * notificar a Telegram, i ho fa qui executa l'acció guanyada (push d'un
 * PENDING_DELETE o descartar un PENDING_CREATE).
 */
export function useHidrantSyncActions(feature: HidrantFeature) {
  const { activeAdf } = useAdf();
  const actions = useOsmMutations();
  const { id, sync_status } = feature.properties;

  const notifyDeleted = async () => {
    if (!activeAdf) {
      return;
    }
    try {
      await sendToTelegram({
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        tags: { ...feature.properties },
        adf_id: activeAdf.id,
        action: "delete",
      });
    } catch (err) {
      logError("Error notificant l'esborrat a Telegram", err);
    }
  };

  const push = async () => {
    try {
      const data = await actions.push.mutateAsync([id]);
      if (data.synced > 0) {
        toast.success("Pujat a OSM");
      }
      if (data.conflicts > 0) {
        toast.warning("Conflicte de versió");
      }
      if (data.errors > 0) {
        toast.error("Error en pujar");
      }
      if (data.reviewed > 0) {
        toast.info("Per revisar");
      }
      if (sync_status === "PENDING_DELETE" && data.synced > 0) {
        await notifyDeleted();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const pull = async () => {
    if (!window.confirm("Aplicar versió d'OSM?\nLes dades locals es sobreescriuran.")) {
      return;
    }
    try {
      await actions.pull.mutateAsync(id);
      toast.success("Dades d'OSM aplicades");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const discard = async () => {
    const msg =
      sync_status === "PENDING_CREATE"
        ? "Esborrar aquest hidrant de la base de dades?"
        : "Revertir als valors d'OSM? Es perdràn els canvis locals.";
    if (!window.confirm(msg)) {
      return;
    }
    try {
      await actions.discard.mutateAsync([id]);
      if (sync_status === "PENDING_CREATE") {
        await notifyDeleted();
      }
      toast.success("Descartat");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return { isPending: actions.isPending, push, pull, discard };
}
