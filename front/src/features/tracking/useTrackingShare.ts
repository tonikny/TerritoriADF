import { can } from "@territoriadf/contracts/permissions";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { useAdf } from "@/contexts/AdfContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiErrorMessage } from "@/shared/api/client";
import { useTrackingMutations } from "./mutations";

/** Compartició de les posicions de l'ADF activa; només qui la pot gestionar la veu. */
export function useTrackingShare() {
  const { user } = useAuth();
  const { activeAdf } = useAdf();
  const mutations = useTrackingMutations();
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const perms = user?.permissions ?? [];
  const canToggle =
    !!activeAdf &&
    can(perms, "manage_own_adf_sharing") &&
    (user?.role === "admin" || activeAdf?.id === user?.adf_id);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflecteix l'estat de compartició de l'ADF activa
    setShared(!!activeAdf?.tracking_shared);
  }, [activeAdf?.id, activeAdf?.tracking_shared]);

  async function toggle(checked: boolean) {
    if (!activeAdf) {
      return;
    }
    setShared(checked);
    setSaving(true);
    try {
      // La mutació invalida la llista d'ADFs: el context en recalcula l'activa.
      await mutations.setSharing.mutateAsync({ adfId: activeAdf.id, shared: checked });
      toast.success(checked ? "Tracking compartit amb totes les ADFs" : "Tracking privat de l'ADF");
    } catch (err) {
      setShared(!checked);
      toast.error(apiErrorMessage(err, "Error actualitzant el tracking"));
    } finally {
      setSaving(false);
    }
  }

  return { activeAdf, shared, saving, canToggle, toggle };
}
