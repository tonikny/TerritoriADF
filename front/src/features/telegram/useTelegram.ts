import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TelegramStatusResponse } from "@territoriadf/contracts/telegram";

import {
  createTelegramLink,
  deleteTelegram,
  getTelegramStatus,
  registerTelegramBot,
  sendTelegramTest,
} from "@/shared/api/telegram";
import { queryKeys } from "@/shared/query/keys";

/** El panell refresca l'estat mentre és visible; la consulta es comparteix per ADF. */
const POLL_MS = 10_000;

export function useTelegramStatus(adfId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.telegramStatus(adfId),
    queryFn: ({ signal }) => getTelegramStatus(adfId!, signal),
    enabled: enabled && adfId !== null,
    // En obrir el panell es vol l'estat d'ara mateix, no el de fa 30 s.
    staleTime: 0,
    // `refetchIntervalInBackground` és fals per defecte: no polla amb la pestanya amagada.
    refetchInterval: POLL_MS,
  });
}

/** Accions de configuració: escriuen l'estat nou a la mateixa entrada de caché. */
export function useTelegramActions(adfId: number | null) {
  const queryClient = useQueryClient();
  const key = queryKeys.telegramStatus(adfId);

  const register = useMutation({
    mutationFn: (token: string) => registerTelegramBot(adfId!, token),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });

  const link = useMutation({
    mutationFn: () => createTelegramLink(adfId!),
    onSuccess: (data) => {
      const previous = queryClient.getQueryData(key) as TelegramStatusResponse | undefined;
      const next: TelegramStatusResponse = {
        status: "GRUP_PENDENT",
        bot_username: data.bot_username,
        bot_name: data.bot_name ?? previous?.bot_name ?? null,
        group_name: previous?.group_name ?? null,
      };
      queryClient.setQueryData(key, next);
    },
  });

  const sendTest = useMutation({
    mutationFn: (message: string) => sendTelegramTest(adfId!, message),
  });

  const remove = useMutation({
    mutationFn: () => deleteTelegram(adfId!),
    onSuccess: () => {
      const next: TelegramStatusResponse = {
        status: "NO_CONFIGURAT",
        bot_username: null,
        bot_name: null,
        group_name: null,
      };
      queryClient.setQueryData(key, next);
    },
  });

  return { register, link, sendTest, remove };
}
