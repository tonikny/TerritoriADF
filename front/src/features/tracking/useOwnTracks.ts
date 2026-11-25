import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import { useAuth } from "@/contexts/AuthContext";
import { apiErrorMessage } from "@/shared/api/client";
import { queryKeys, viewerKey } from "@/shared/query/keys";
import { getTrackingConfig, getTrackingStatus } from "./api";
import { useTrackingMutations } from "./mutations";
import { downloadOtrc, launchUrl, owntracksConfigHref } from "./owntracks";

/** Estat d'OwnTracks de l'usuari i les accions per activar-lo i carregar-lo. */
export function useOwnTracks() {
  const { user } = useAuth();
  const mutations = useTrackingMutations();
  const viewer = viewerKey(user);
  const [loading, setLoading] = useState(false);

  // L'estat d'OwnTracks depèn de l'usuari: es repolla cada 5 min com abans.
  const statusQuery = useQuery({
    queryKey: queryKeys.trackingStatus(viewer),
    queryFn: ({ signal }) => getTrackingStatus(signal),
    enabled: !!user,
    refetchInterval: 300_000,
  });
  const available = statusQuery.data?.available ?? false;
  const enabled = statusQuery.data?.enabled ?? !!user?.mqtt_enabled;

  const enable = async () => {
    setLoading(true);
    try {
      await mutations.enable.mutateAsync();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Error activant OwnTracks"));
    } finally {
      setLoading(false);
    }
  };

  const loadOtrc = async (): Promise<Record<string, unknown> | null> => {
    try {
      return await getTrackingConfig();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Error descarregant config"));
      return null;
    }
  };

  const downloadConfig = async () => {
    setLoading(true);
    try {
      const otrc = await loadOtrc();
      if (otrc && user) {
        downloadOtrc(otrc, user.username);
      }
    } finally {
      setLoading(false);
    }
  };

  /** Carrega a OwnTracks la configuració incrustada a la URL (iOS i Android). */
  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await loadOtrc();
      if (cfg) {
        launchUrl(owntracksConfigHref(cfg));
      }
    } finally {
      setLoading(false);
    }
  };

  return { available, enabled, loading, enable, downloadConfig, loadConfig };
}
