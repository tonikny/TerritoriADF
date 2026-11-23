import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { createUser, deleteUser, getUsers, updateUser } from "@/shared/api/users";
import { queryKeys, viewerKey } from "@/shared/query/keys";

/**
 * Usuaris visibles per al visor actual (admin: tots; coordinador: la seva ADF).
 * La clau porta el visor perquè la vista "veure com" canvia la resposta.
 */
export function useUsers(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.users(viewerKey(user)),
    queryFn: ({ signal }) => getUsers(signal),
    enabled,
  });
}

/** Mutacions d'usuaris: cada canvi invalida la llista de la vista actual. */
export function useUserMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const viewer = viewerKey(user);

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.users(viewer) });

  const create = useMutation({ mutationFn: createUser, onSuccess: invalidateUsers });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { username?: string; role?: string } }) =>
      updateUser(id, input),
    onSuccess: invalidateUsers,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: invalidateUsers,
  });

  return { create, update, remove };
}
