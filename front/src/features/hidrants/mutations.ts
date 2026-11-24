import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAdf } from "@/contexts/AdfContext";
import { useAuth } from "@/contexts/AuthContext";
import { createHidrant, type HidrantCreateInput } from "./api";
import { invalidateHidrantQueries } from "@/shared/query/invalidate";
import { viewerKey } from "@/shared/query/keys";

export function useCreateHidrant() {
  const queryClient = useQueryClient();
  const { activeAdf } = useAdf();
  const { user } = useAuth();
  const adfId = activeAdf?.id ?? null;
  const viewer = viewerKey(user);

  return useMutation({
    mutationFn: (input: HidrantCreateInput) => createHidrant(adfId!, input),
    onSuccess: () => invalidateHidrantQueries(queryClient, adfId, viewer),
  });
}
