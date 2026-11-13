import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { adfLabel } from "../../utils/adfLabel";
import { useAdf } from "../../contexts/AdfContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../styles/uiStyles";
import { CollapsibleSection } from "../panel/shared/CollapsibleSection";
import { PasswordInput } from "./PasswordInput";

type TelegramStatus =
  | "NO_CONFIGURAT"
  | "BOT_CONFIGURAT"
  | "GRUP_PENDENT"
  | "CONFIGURAT"
  | "DESACTIVAT"
  /** El token desat no es pot desxifrar: cal tornar-lo a introduir. */
  | "TOKEN_INVALID";

interface StatusResponse {
  status?: TelegramStatus;
  bot_username?: string;
  bot_name?: string;
  group_name?: string;
  error?: string;
}

interface LinkResponse {
  url?: string;
  expires_at?: string;
  bot_username?: string;
  error?: string;
}

const POLL_MS = 10000;

/** Poller compartit per ADF: encara que el panell es munti a dos contenidors
 *  (sidebar desktop + BottomSheet mòbil), només es fa UNA petició per ADF.
 *  Només s'activa mentre el col·lapsable de Telegram està obert i l'element
 *  és visible (IntersectionObserver a l'efecte del component): en col·lapsar
 *  o tancar el panell no es fan crides. */
type TelegramListener = (data: StatusResponse) => void;
const perAdf = new Map<number, Set<TelegramListener>>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollAdf(adfId: number) {
  try {
    const res = await fetch(`/api/adfs/${adfId}/telegram/status`, {
      credentials: "same-origin",
    });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as StatusResponse;
    perAdf.get(adfId)?.forEach((l) => l(data));
  } catch {
    /* ignore: el servidor pot no estar disponible */
  }
}

function subscribeTelegram(adfId: number, listener: TelegramListener) {
  let set = perAdf.get(adfId);
  if (!set) {
    set = new Set();
    perAdf.set(adfId, set);
  }
  set.add(listener);
  void pollAdf(adfId);
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (document.visibilityState === "hidden") {
        return; // no farruquejar si la pestanya no es veu
      }
      for (const id of perAdf.keys()) {
        void pollAdf(id);
      }
    }, POLL_MS);
  }
  return () => {
    set!.delete(listener);
    if (set!.size === 0) {
      perAdf.delete(adfId);
    }
    if (perAdf.size === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

/** Exemple d'usuari de bot per a @BotFather: curts (màxim ~32 caràcters a Telegram). */
function botUsernameExample(adf: { id: number; nom?: string }): string {
  const words = (adf.nom ?? "")
    .replace(/^ADF\s+/i, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  let slug = words.slice(0, 2).join("_");
  if (slug.length > 16) {
    slug = slug.slice(0, 16).replace(/_\w*$/, "");
  }
  return `adf_${adf.id}_${slug}_bot`;
}

/** Punt numerat. `muted` = pas encara no accessible (gris, sense fons blau). */
function StepNumber({ number, muted }: { number: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4.5 h-4.5 mr-1.5 rounded-full text-[0.7rem] font-semibold align-middle ${
        muted ? "bg-faint text-muted" : "bg-primary text-white"
      }`}
    >
      {number}
    </span>
  );
}

export function TelegramConfigPanel() {
  const { user } = useAuth();
  const { activeAdf } = useAdf();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [botUsername, setBotUsername] = useState<string>();
  const [botName, setBotName] = useState<string>();
  const [groupName, setGroupName] = useState<string>();
  const [tokenInput, setTokenInput] = useState("");
  const [customMsg, setCustomMsg] = useState("");
  const [registering, setRegistering] = useState(false);
  const [linking, setLinking] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string>();
  const [telegramOpen, setTelegramOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const perms = user?.permissions ?? [];
  const canManage =
    !!activeAdf &&
    perms.includes("manage_telegram") &&
    (user?.role === "admin" || activeAdf.id === user?.adf_id);

  useEffect(() => {
    const adfId = activeAdf?.id;
    if (!adfId || !canManage || !telegramOpen || !wrapperRef.current) {
      return;
    }
    let unsub: (() => void) | null = null;

    const handleData = (data: StatusResponse) => {
      if (data.status) {
        setStatus(data.status);
      }
      setBotUsername(data.bot_username);
      setBotName(data.bot_name);
      setGroupName(data.group_name);
    };

    // Només fem polling mentre el panell és realment visible: en tancar el
    // bottom sheet o canviar de pestanya no es fan crides al backend.
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible && !unsub) {
        unsub = subscribeTelegram(adfId, handleData);
      } else if (!visible && unsub) {
        unsub();
        unsub = null;
      }
    });
    io.observe(wrapperRef.current);
    return () => {
      io.disconnect();
      unsub?.();
    };
  }, [activeAdf?.id, canManage, telegramOpen]);

  if (!user) {
    return (
      <div className="text-[0.85rem] text-muted">
        Inicia sessió a la pestanya <strong>Usuaris</strong> per configurar les notificacions de
        Telegram.
      </div>
    );
  }

  if (!activeAdf) {
    return (
      <div className="text-[0.85rem] text-muted">
        Selecciona una ADF a la pestanya <strong>ADF</strong> per gestionar les seves notificacions
        de Telegram.
      </div>
    );
  }

  const adfId = activeAdf.id;
  const groupAdf = adfLabel(adfId, activeAdf.nom);
  const botReady = status === "BOT_CONFIGURAT" || status === "GRUP_PENDENT";
  const configured = status === "CONFIGURAT";

  async function handleRegister() {
    const token = tokenInput.trim();
    if (!token) {
      toast.warn("Enganxa primer el token del bot.");
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch(`/api/adfs/${adfId}/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as StatusResponse;
      if (!res.ok) {
        throw new Error(data.error || `API ${res.status}`);
      }
      setStatus(data.status ?? "BOT_CONFIGURAT");
      setBotUsername(data.bot_username);
      setBotName(data.bot_name);
      if (data.group_name !== undefined) {
        setGroupName(data.group_name);
      }
      setTokenInput("");
      toast.success("✅ Bot validat i connectat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperat");
    } finally {
      setRegistering(false);
    }
  }

  async function handleLink() {
    setLinking(true);
    setLinkUrl(undefined);
    try {
      const res = await fetch(`/api/adfs/${adfId}/telegram/link`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as LinkResponse;
      if (!res.ok || !data.url) {
        throw new Error(data.error || `API ${res.status}`);
      }
      setLinkUrl(data.url);
      if (data.bot_username) {
        setBotUsername(data.bot_username);
      }
      const win = window.open(data.url, "_blank");
      if (win) {
        toast.info("Obre Telegram, escull el grup de la teva ADF i prem «Afegeix».");
      } else {
        toast.info("Si no s'ha obert Telegram, toca l'enllaç de sota.");
      }
      setStatus("GRUP_PENDENT");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error generant l'enllaç");
    } finally {
      setLinking(false);
    }
  }

  async function handleSend() {
    const message = customMsg.trim();
    if (!message) {
      toast.warn("Escriu primer el missatge que vols enviar.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/adfs/${adfId}/telegram/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as StatusResponse;
        throw new Error(data.error || `API ${res.status}`);
      }
      setCustomMsg("");
      toast.success("📨 Missatge enviat al grup");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error enviant el missatge");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Segur que vols desvincular Telegram d'aquesta ADF? " +
          "Deixaràs de rebre notificacions al grup.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/adfs/${adfId}/telegram`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as StatusResponse;
        throw new Error(data.error || `API ${res.status}`);
      }
      setStatus("NO_CONFIGURAT");
      setBotUsername(undefined);
      setBotName(undefined);
      setGroupName(undefined);
      setLinkUrl(undefined);
      toast.success("Telegram desconnectat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconnectant");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div ref={wrapperRef}>
      <CollapsibleSection
        title="🔔 Notificacions de Telegram"
        open={telegramOpen}
        onToggle={() => setTelegramOpen(!telegramOpen)}
      >
        <div className="space-y-3 text-[0.85rem]">
          <p className="m-0 text-[0.8rem] text-muted leading-snug">
            {canManage && status === "TOKEN_INVALID"
              ? "El bot i el grup continuen associats, però el token desat no es pot desxifrar (ha canviat la clau de xifrat del servidor). Torna a enganxar el token per reactivar les notificacions."
              : canManage && !configured
                ? "Les notificacions de l'ADF (noves incidències, altes i edicions d'hidrants) s'envien al grup de Telegram. Quatre passos i llest."
                : configured
                  ? `Telegram està configurat per enviar notificacions de l'app${
                      groupName ? ` al grup ${groupName}` : ""
                    }.`
                  : "Només els coordinadors de l'ADF poden modificar la configuració de Telegram."}
          </p>

          {/* Token indesxifrable: el grup ja hi és, només cal tornar a validar el bot */}
          {canManage && status === "TOKEN_INVALID" && (
            <div className="border border-border rounded p-3 space-y-2">
              <p className="m-0 text-[0.8rem] text-muted leading-snug">
                Bot: <strong>{botName ?? botUsername ?? "desconegut"}</strong>
                {botUsername ? ` (@${botUsername})` : ""}
                {groupName ? (
                  <>
                    {" · "}Grup: <strong>{groupName}</strong>
                  </>
                ) : null}
              </p>
              <p className="m-0 text-[0.8rem] text-muted leading-snug">
                Obre <strong>@BotFather</strong>, escriu <em>/token</em> i tria aquest bot per
                recuperar el token. Enganxa'l aquí: si és el mateix bot, el grup es manté vinculat i
                podràs enviar missatges de seguida.
              </p>
              <PasswordInput
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="123456789:AAF..."
                className={`${inputClass} px-2`}
                autoComplete="off"
              />
              <button
                onClick={() => {
                  void handleRegister();
                }}
                disabled={registering}
                className={`${primaryButtonClass} w-full`}
                title="Torna a validar el token del bot"
              >
                {registering ? "⏳ Validant..." : "🆔 Tornar a validar el bot"}
              </button>
            </div>
          )}

          {/* Configuració en marxa: passos per al coordinador */}
          {canManage && !botReady && !configured && status !== "TOKEN_INVALID" && (
            <div className="border border-border rounded p-3">
              <ol className="m-0 p-0 list-none space-y-3 leading-relaxed">
                <li>
                  <h5 className="m-0 mb-1 font-semibold">
                    <StepNumber number="1" /> Crea el grup de la teva ADF
                  </h5>
                  <p className="m-0 text-[0.8rem] text-muted leading-snug">
                    És el lloc on arribaran tots els avisos de l'aplicació (incidències, hidrants,
                    edicions). Crea'l a Telegram: botó <strong>Nou grup</strong> → tria un nom (per
                    exemple <em>{groupAdf} Avisos</em>) i afegeix-hi els membres. Necessitaràs ser
                    administrador per afegir-hi el bot.
                  </p>
                </li>
                <li>
                  <h5 className="m-0 mb-1 font-semibold">
                    <StepNumber number="2" /> Crea el bot de la teva ADF
                  </h5>
                  <p className="m-0 text-[0.8rem] text-muted leading-snug">
                    El bot és la identitat que enviarà cada notificació de{" "}
                    <strong>{groupAdf}</strong> al grup; cada ADF en té un de propi. A Telegram,
                    escriu a <strong>@BotFather</strong> → <strong>/newbot</strong>. Et demanarà dos
                    noms: el <strong>nom</strong> (com es veurà al grup, per exemple{" "}
                    <em>{groupAdf} · Bot d'avisos</em>) i el <strong>nom d'usuari</strong>, que ha
                    d'acabar en <em>bot</em> (per exemple <em>{botUsernameExample(activeAdf)}</em>).
                    BotFather et donarà un <strong>token</strong>.
                  </p>
                </li>
                <li>
                  <h5 className="m-0 mb-1 font-semibold">
                    <StepNumber number="3" /> Introdueix el token
                  </h5>
                  <p className="m-0 mb-2 text-[0.8rem] text-muted">
                    Enganxa aquí el token de <strong>@BotFather</strong> i prem{" "}
                    <strong>Validar bot</strong>. El token és una contrasenya: es guarda xifrat i no
                    s'ha de compartir amb ningú.
                  </p>
                  <PasswordInput
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="123456789:AAF..."
                    className={`${inputClass} px-2`}
                    autoComplete="off"
                  />
                  <button
                    onClick={() => {
                      void handleRegister();
                    }}
                    disabled={registering}
                    className={`${primaryButtonClass} w-full mt-2`}
                    title="Valida el token contra Telegram i activa el bot"
                  >
                    {registering ? "⏳ Validant..." : "🆔 Validar bot"}
                  </button>
                </li>
                <li className="text-muted">
                  <h5 className="m-0 mb-1 font-semibold text-muted">
                    <StepNumber number="4" muted /> Vincula el grup de la teva ADF
                  </h5>
                  <p className="m-0 text-[0.8rem] text-muted">
                    Un cop el bot sigui vàlid et donarem un enllaç d'un sol ús per afegir-lo al grup
                    (caduca als 15 minuts). Encara no disponible: primer valida el bot.
                  </p>
                </li>
              </ol>
            </div>
          )}

          {/* Bot validat: falta vincular el grup */}
          {canManage && botReady && (
            <div className="border border-border rounded p-3">
              <ol className="m-0 p-0 list-none space-y-3 leading-relaxed">
                <li className="text-muted">
                  <h5 className="m-0 mb-1 font-semibold text-muted">
                    <StepNumber number="1" muted /> Crea el grup de la teva ADF
                  </h5>
                  <p className="m-0 text-[0.8rem] text-muted">Fet.</p>
                </li>
                <li className="text-muted">
                  <h5 className="m-0 mb-1 font-semibold text-muted">
                    <StepNumber number="2" muted /> Crea el bot de la teva ADF
                  </h5>
                  <p className="m-0 text-[0.8rem] text-muted">Fet.</p>
                </li>
                <li className="text-muted">
                  <h5 className="m-0 mb-1 font-semibold text-muted">
                    <StepNumber number="3" muted /> Introdueix el token
                  </h5>
                  <p className="m-0 text-[0.8rem] text-muted">
                    ✅ Bot configurat:
                    {botName ? ` ${botName}` : ""} {botUsername ? `(@${botUsername})` : ""}.
                  </p>
                </li>
                <li>
                  <h5 className="m-0 mb-1 font-semibold">
                    <StepNumber number="4" /> Vincula el grup de la teva ADF
                  </h5>
                  <p className="m-0 mb-2 text-[0.8rem] text-muted leading-snug">
                    Prem el botó i a Telegram escull el grup de <strong>{groupAdf}</strong> que has
                    creat al pas 1. Has de ser administrador per afegir-hi el bot. L'enllaç té un
                    codi d'un sol ús (caduca als 15 minuts) i la vinculació es fa tota sola. Si
                    algun dia es treu el bot del grup, aquest pas tornará a aparèixer per
                    re-vincular-lo sense crear-ne un de nou.
                  </p>
                  <button
                    onClick={() => {
                      void handleLink();
                    }}
                    disabled={linking}
                    className={`${primaryButtonClass} w-full`}
                    title="Obre Telegram per afegir el bot al grup de la teva ADF"
                  >
                    {linking ? "⏳ Generant enllaç..." : "📎 Vincular grup de Telegram"}
                  </button>
                  {linkUrl && (
                    <a
                      href={linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-2 text-[0.8rem] text-blue-600 underline"
                    >
                      Si no s'ha obert Telegram, toca aquí
                    </a>
                  )}
                </li>
              </ol>
            </div>
          )}

          {/* Configurat: ús + què significa cada botó */}
          {canManage && configured && (
            <div className="border border-border rounded p-3 space-y-3">
              <p className="m-0 text-[0.85rem]">
                ✅ <strong>Grup vinculat:</strong> {groupName ?? "desconegut"}
                {botUsername ? ` (bot @${botUsername})` : ""}
              </p>
              <div className="space-y-1">
                <input
                  type="text"
                  value={customMsg}
                  onChange={(e) => setCustomMsg(e.target.value)}
                  placeholder="Escriu el missatge que vols enviar al grup..."
                  className={`${inputClass} px-2`}
                  autoComplete="off"
                />
                <button
                  onClick={() => {
                    void handleSend();
                  }}
                  disabled={sending || customMsg.trim() === ""}
                  className={`${primaryButtonClass} w-full`}
                  title="Envia el missatge al grup a través del bot"
                >
                  {sending ? "⏳ Enviant..." : "📨 Enviar missatge al grup"}
                </button>
                <p className="m-0 text-[0.75rem] text-muted">
                  Tot el que escriguis aquí es publicarà al grup a través del bot d'aquesta ADF.
                </p>
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    void handleLink();
                  }}
                  disabled={linking}
                  className={`${secondaryButtonClass} w-full`}
                  title="Genera un enllaç nou per canviar el grup"
                >
                  {linking ? "⏳ Generant enllaç..." : "🔄 Canviar el grup"}
                </button>
                <p className="m-0 text-[0.75rem] text-muted">
                  Canvia el grup de destí sense crear un bot nou: generaràs un enllaç d'un sol ús
                  nou.
                </p>
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    void handleDelete();
                  }}
                  disabled={deleting}
                  className={`${dangerButtonClass}`}
                  title="Desconnecta Telegram d'aquesta ADF"
                >
                  {deleting ? "⏳ Desconnectant..." : "⛔ Desconnectar Telegram"}
                </button>
                <p className="m-0 text-[0.75rem] text-muted">
                  Deixa de rebre notificacions al grup i esborra la configuració. Podràs tornar a
                  configurar-ho des de zero.
                </p>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
