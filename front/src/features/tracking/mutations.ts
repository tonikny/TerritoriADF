import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { enableTracking, setAdfTrackingSharing } from "./api";
import { queryKeys, viewerKey } from "@/shared/query/keys";

export function useTrackingMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const viewer = viewerKey(user);

  const enable = useMutation({
    mutationFn: enableTracking,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trackingStatus(viewer) }),
  });

  const setSharing = useMutation({
    mutationFn: ({ adfId, shared }: { adfId: number; shared: boolean }) =>
      setAdfTrackingSharing(adfId, shared),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adfs }),
  });

  return { enable, setSharing };
}
