import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useRegisterSW } from "virtual:pwa-register/react";

const INSTALL_TOAST_ID = "pwa-install";
const INSTALL_DISMISSED_KEY = "territoriadf-pwa-install-dismissed";
const UPDATED_FLAG_KEY = "territoriadf-pwa-updated";

/** Esdeveniment no estàndard: només el dispara Chromium. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PRIMARY_BUTTON =
  "bg-primary text-white border-0 rounded px-3 py-1.5 text-[0.8rem] cursor-pointer";
const GHOST_BUTTON =
  "bg-neutral-200 text-ink border-0 rounded px-3 py-1.5 text-[0.8rem] cursor-pointer";

function isStandalone(): boolean {
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

function ToastBody({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 text-[0.85rem] leading-snug">{text}</p>
      <div className="mt-2 flex gap-2">{children}</div>
    </div>
  );
}

/**
 * Gestiona la instal·lació de la PWA (només on hi ha `beforeinstallprompt`) i
 * l'actualització automàtica del service worker.
 *
 * El service worker nou s'activa sol (`registerType: 'autoUpdate'`); aquí només
 * recarreguem la pàgina perquè el codi que corre sigui el nou i, en tornar,
 * confirmem a l'usuari que l'aplicació s'ha actualitzat.
 */
export function PwaBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return;
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) {
          return;
        }
        installing.addEventListener("statechange", () => {
          // Només si ja hi havia una versió anterior controlant la pàgina:
          // la primera instal·lació també passa per "installed".
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            window.sessionStorage.setItem(UPDATED_FLAG_KEY, "1");
          }
        });
      });
    },
  });

  // Avís de confirmació després de recarregar per una actualització.
  useEffect(() => {
    if (window.sessionStorage.getItem(UPDATED_FLAG_KEY) !== "1") {
      return;
    }
    window.sessionStorage.removeItem(UPDATED_FLAG_KEY);
    toast.success("Aplicació actualitzada correctament");
  }, []);

  // El SW nou pren el control de la pàgina: recarreguem perquè no convisquin
  // chunks de dues versions.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    const container = navigator.serviceWorker;
    const hadController = Boolean(container.controller);
    let reloading = false;

    const onControllerChange = () => {
      if (!hadController || reloading) {
        return;
      }
      reloading = true;
      window.location.reload();
    };

    container.addEventListener("controllerchange", onControllerChange);
    return () => container.removeEventListener("controllerchange", onControllerChange);
  }, []);

  const dismissInstall = useCallback(() => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    setPromptEvent(null);
    toast.dismiss(INSTALL_TOAST_ID);
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setPromptEvent(null);
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
      toast.dismiss(INSTALL_TOAST_ID);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!promptEvent || isStandalone()) {
      return;
    }
    if (window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") {
      return;
    }

    const install = async () => {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") {
          setPromptEvent(null);
        } else {
          dismissInstall();
        }
      } catch {
        // El navegador pot rebutjar el prompt si l'usuari ja l'ha descartat abans.
        dismissInstall();
      }
    };

    // Toast neutre (fons blanc de l'app): no és un avís informatiu, és una
    // pregunta, i `theme="colored"` pintaria de blau el tipus `info`.
    void toast(
      <ToastBody text="Instal·la el TerritoriADF per obrir-lo més ràpid i a pantalla completa.">
        <button type="button" className={PRIMARY_BUTTON} onClick={() => void install()}>
          Instal·la
        </button>
        <button type="button" className={GHOST_BUTTON} onClick={dismissInstall}>
          Ara no
        </button>
      </ToastBody>,
      {
        toastId: INSTALL_TOAST_ID,
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        className: "bg-white! text-ink! border border-border",
      },
    );
  }, [promptEvent, dismissInstall]);

  return null;
}
