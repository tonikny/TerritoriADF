// Estat de l'assistent de Telegram: token, missatge de prova, enllaç de
// vinculació, visibilitat del panell i les quatre accions. La consulta només
// polla mentre el panell és obert i realment visible.
import { can } from "@territoriadf/contracts/permissions";
import { useState } from "react";
import { toast } from "react-toastify";

import { useAdf } from "@/contexts/AdfContext";
import { useAuth } from "@/contexts/AuthContext";
import { adfLabel } from "@/utils/adfLabel";
import { useTelegramActions, useTelegramStatus } from "./useTelegram";

export function useTelegramSetup() {
  const { user } = useAuth();
  const { activeAdf } = useAdf();
  const [tokenInput, setTokenInput] = useState("");
  const [customMsg, setCustomMsg] = useState("");
  const [linkUrl, setLinkUrl] = useState<string>();
  const [telegramOpen, setTelegramOpen] = useState(false);
  // El panell informa si és visible (`VisibleObserver`): si no ho és, no es polla.
  const [visible, setVisible] = useState(false);

  const adfId = activeAdf?.id ?? null;
  const perms = user?.permissions ?? [];
  const canManage =
    !!activeAdf &&
    can(perms, "manage_telegram") &&
    (user?.role === "admin" || activeAdf.id === user?.adf_id);

  // En col·lapsar el panell o tancar el bottom sheet no es fan crides.
  const statusQuery = useTelegramStatus(adfId, canManage && telegramOpen && visible);
  const actions = useTelegramActions(adfId);
  const status = statusQuery.data?.status ?? null;
  const botUsername = statusQuery.data?.bot_username ?? undefined;
  const botName = statusQuery.data?.bot_name ?? undefined;
  const groupName = statusQuery.data?.group_name ?? undefined;

  const groupAdf = activeAdf ? adfLabel(activeAdf.id, activeAdf.nom) : "";
  const botReady = status === "BOT_CONFIGURAT" || status === "GRUP_PENDENT";
  const configured = status === "CONFIGURAT";

  const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Error inesperat");

  async function register() {
    const token = tokenInput.trim();
    if (!token) {
      toast.warn("Enganxa primer el token del bot.");
      return;
    }
    try {
      await actions.register.mutateAsync(token);
      setTokenInput("");
      toast.success("✅ Bot validat i connectat");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function link() {
    setLinkUrl(undefined);
    try {
      const data = await actions.link.mutateAsync();
      if (!data.url) {
        throw new Error("No s'ha pogut generar l'enllaç");
      }
      setLinkUrl(data.url);
      const win = window.open(data.url, "_blank");
      if (win) {
        toast.info("Obre Telegram, escull el grup de la teva ADF i prem «Afegeix».");
      } else {
        toast.info("Si no s'ha obert Telegram, toca l'enllaç de sota.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error generant l'enllaç");
    }
  }

  async function send() {
    const message = customMsg.trim();
    if (!message) {
      toast.warn("Escriu primer el missatge que vols enviar.");
      return;
    }
    try {
      await actions.sendTest.mutateAsync(message);
      setCustomMsg("");
      toast.success("📨 Missatge enviat al grup");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error enviant el missatge");
    }
  }

  async function remove() {
    if (
      !window.confirm(
        "Segur que vols desvincular Telegram d'aquesta ADF? " +
          "Deixaràs de rebre notificacions al grup.",
      )
    ) {
      return;
    }
    try {
      await actions.remove.mutateAsync();
      setLinkUrl(undefined);
      toast.success("Telegram desconnectat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconnectant");
    }
  }

  return {
    user,
    activeAdf,
    setVisible,
    canManage,
    status,
    botName,
    botUsername,
    groupName,
    groupAdf,
    botReady,
    configured,
    tokenInput,
    setTokenInput,
    customMsg,
    setCustomMsg,
    linkUrl,
    telegramOpen,
    toggleOpen: () => setTelegramOpen((open) => !open),
    pending: {
      register: actions.register.isPending,
      link: actions.link.isPending,
      send: actions.sendTest.isPending,
      remove: actions.remove.isPending,
    },
    register,
    link,
    send,
    remove,
  };
}

export type TelegramSetup = ReturnType<typeof useTelegramSetup>;
