import { can } from "@territoriadf/contracts/permissions";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../contexts/AuthContext";
import { apiErrorMessage } from "../../../shared/api/client";
import { setAdfTrackingSharing } from "../../../shared/api/adfs";
import { enableTracking, getTrackingConfig, getTrackingStatus } from "../../../shared/api/tracking";
import { queryKeys, viewerKey } from "../../../shared/query/keys";
import { useAdf } from "../../../contexts/AdfContext";
import type { Position } from "../../../hooks/usePositionPolling";
import { timeAgo } from "../../../utils/time";
import { CollapsibleSection } from "../shared/CollapsibleSection";
import { adfLabel } from "../../../utils/adfLabel";
import { primaryButtonClass, secondaryButtonClass } from "../../../styles/uiStyles";
import { toast } from "react-toastify";

const CONNECTED_MS = 15 * 60 * 1000;

/** Base64 (UTF-8) que espera el paràmetre `inline` de l'esquema owntracks://. */
function toBase64(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** URL d'importació de configuració (l'única ruta owntracks:// que Chrome pot obrir).
 *  El base64 s'ha de percent-encodar: OwnTracks fa URLDecoder.decode de la query i
 *  un `+` cru es converteix en espai, cosa que trenca el base64. */
function owntracksConfigHref(otrc: Record<string, unknown> | null): string {
  if (!otrc) {
    return "owntracks:///config";
  }
  return `owntracks:///config?inline=${encodeURIComponent(toBase64(JSON.stringify(otrc)))}`;
}

/** Llança una URL d'esquema propi des d'un gest de l'usuari. */
function launchUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.click();
}

export function SeguimentTab({
  positions,
  onCenterCoordinates,
}: {
  positions: Record<string, Position>;
  onCenterCoordinates?: (coords: [number, number]) => void;
}) {
  const { user } = useAuth();
  const { activeAdf, setActiveAdf } = useAdf();
  const [loading, setLoading] = useState(false);
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const queryClient = useQueryClient();
  const viewer = viewerKey(user);

  // L'estat d'OwnTracks depèn de l'usuari: es repolla cada 5 min com abans.
  const statusQuery = useQuery({
    queryKey: queryKeys.trackingStatus(viewer),
    queryFn: ({ signal }) => getTrackingStatus(signal),
    enabled: !!user,
    refetchInterval: 300_000,
  });
  const available = statusQuery.data?.available ?? false;
  const enabled = enabledOverride ?? statusQuery.data?.enabled ?? !!user?.mqtt_enabled;
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

  async function toggleShare(checked: boolean) {
    if (!activeAdf) {
      return;
    }
    setShared(checked);
    setSaving(true);
    try {
      await setAdfTrackingSharing(activeAdf.id, checked);
      setActiveAdf({ ...activeAdf, tracking_shared: checked });
      // La llista d'ADFs porta `tracking_shared`: cal refrescar-la a la caché.
      await queryClient.invalidateQueries({ queryKey: queryKeys.adfs });
      toast.success(checked ? "Tracking compartit amb totes les ADFs" : "Tracking privat de l'ADF");
    } catch (err) {
      setShared(!checked);
      toast.error(apiErrorMessage(err, "Error actualitzant el tracking"));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      await enableTracking();
      setEnabledOverride(true);
      await queryClient.invalidateQueries({ queryKey: queryKeys.trackingStatus(viewer) });
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

  const handleConfig = async () => {
    setLoading(true);
    try {
      const otrc = await loadOtrc();
      if (otrc) {
        downloadOtrc(otrc);
      }
    } finally {
      setLoading(false);
    }
  };

  /** Carrega a OwnTracks la configuració incrustada a la URL (iOS i Android). */
  const handleLoadConfig = async () => {
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

  const downloadOtrc = (config: Record<string, unknown>) => {
    if (!user) {
      return;
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${user.username.replace(/\//g, "_")}.otrc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const connected = useMemo(() => {
    return Object.entries(positions)
      .map(([username, pos]) => ({ username, ts: pos.receivedAt || pos.timestamp }))
      .filter((p) => now - p.ts < CONNECTED_MS)
      .sort((a, b) => b.ts - a.ts);
  }, [positions, now]);

  const handleCenterOnUser = (username: string) => {
    const pos = positions[username];
    if (!pos) {
      return;
    }
    onCenterCoordinates?.([pos.lon, pos.lat]);
  };

  if (!user) {
    return (
      <div className="p-4 text-[0.85rem] text-muted">
        Inicia sessió a la pestanya <strong>Usuaris</strong> per activar el seguiment.
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3">
        <div className="flex items-baseline justify-between leading-none">
          <h3 className="m-0 text-[0.95rem] font-semibold">Seguiment OwnTracks</h3>
          <span className="flex items-center gap-1.5 text-[0.8rem] text-muted">
            {available ? "disponible" : "no disponible"}
            <span
              className={`w-2 h-2 rounded-full ${available ? "bg-[#22c55e]" : "bg-[#ef4444]"}`}
              title={available ? "disponible" : "no disponible"}
            />
          </span>
        </div>
        {enabled && (
          <div className="flex items-center justify-end gap-1.5 leading-none text-[0.8rem] text-muted mt-px">
            <span>usuari activat</span>
            <span className="w-2 h-2 rounded-full bg-[#22c55e]" title="usuari activat" />
          </div>
        )}
      </div>
      {!enabled ? (
        <ol className="m-0 p-0 list-none space-y-3 text-[0.85rem] leading-relaxed">
          <li>
            <h4 className="m-0 mb-1 text-[0.85rem] font-semibold">
              <span className="inline-flex items-center justify-center w-4.5 h-4.5 mr-1 rounded-full bg-primary text-white text-[0.7rem] align-middle">
                1
              </span>
              Instal·la l'app OwnTracks
            </h4>
            <p className="m-0 mb-2 text-[0.8rem] text-muted">
              Tria la tenda segons la teva plataforma:
            </p>
            <div className="flex gap-2">
              <a
                href="https://play.google.com/store/apps/details?id=org.owntracks.android"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex flex-col items-center gap-0.5 border border-border rounded-xl p-2 no-underline text-center hover:bg-soft"
              >
                <span className="text-[1.3rem]">📱</span>
                <span className="text-[0.8rem] font-semibold text-ink">Android</span>
                <span className="text-[0.7rem] text-muted">Google Play</span>
              </a>
              <a
                href="https://apps.apple.com/app/owntracks/id692424691"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex flex-col items-center gap-0.5 border border-border rounded-xl p-2 no-underline text-center hover:bg-soft"
              >
                <span className="text-[1.3rem]">🍏</span>
                <span className="text-[0.8rem] font-semibold text-ink">iPhone</span>
                <span className="text-[0.7rem] text-muted">App Store</span>
              </a>
            </div>
            <p className="text-xs text-muted mt-1 mb-0">
              Perquè l'app funcioni bé, concedeix-li els permisos de localització precisa i
              desactiva l'optimització de bateria perquè no s'aturi sola.
            </p>
          </li>
          <li>
            <h4 className="m-0 mb-1 text-[0.85rem] font-semibold">
              <span className="inline-flex items-center justify-center w-4.5 h-4.5 mr-1 rounded-full bg-primary text-white text-[0.7rem] align-middle">
                2
              </span>
              Activa el seguiment
            </h4>
            <p className="m-0 mb-2 text-[0.8rem] text-muted">
              Genera les teves credencials personals i habilita la recepció de posicions:
            </p>
            <button
              onClick={() => {
                void handleEnable();
              }}
              disabled={loading}
              className={`${primaryButtonClass} w-full`}
              title="Activa OwnTracks i genera credencials"
            >
              {loading ? "⏳" : "🛡️ Activar"}
            </button>
          </li>
          <li>
            <h4 className="m-0 mb-1 text-[0.85rem] font-semibold">
              <span className="inline-flex items-center justify-center w-4.5 h-4.5 mr-1 rounded-full bg-primary text-white text-[0.7rem] align-middle">
                3
              </span>
              Importa les credencials
            </h4>
            <p className="m-0 text-[0.8rem] text-muted">
              Un cop activat apareixerà <strong>Tornar a configurar l'app</strong> per carregar la
              configuració directament a OwnTracks o baixar el fitxer <strong>.otrc</strong>. El
              fitxer conté les teves credencials: <strong>no el comparteixis amb ningú</strong>. Per
              començar a compartir la posició, obre OwnTracks des de la pantalla d'inici del mòbil:
              el navegador no pot obrir-la.
            </p>
          </li>
          <li>
            <h4 className="m-0 mb-1 text-[0.85rem]">
              <span className="inline-flex items-center justify-center w-4.5 h-4.5 mr-1 rounded-full bg-primary text-white text-[0.7rem] align-middle">
                4
              </span>
              Comparteix la teva posició
            </h4>
            <p className="m-0 text-[0.8rem] text-muted">
              Per aparèixer al mapa, obre OwnTracks i deixa-la oberta (pot funcionar en segon plà,
              amb la pantalla bloquejada). Quan la tanquis ("Sortir" al menú), deixaràs de compartir
              la teva posició.
            </p>
          </li>
        </ol>
      ) : (
        <div className="space-y-3">
          <p className="m-0 text-[0.8rem] text-muted">
            <span className="text-[0.9rem]">📡</span> Obre OwnTracks al mòbil (des de la pantalla
            d'inici: el navegador no pot llançar-la) i deixa-la oberta, encara que sigui en segon
            pla o amb la pantalla bloquejada. Si la tanques ("Sortir" al menú), deixaràs de
            compartir la posició.
          </p>
          <CollapsibleSection title="Tornar a configurar l'app">
            <div className="space-y-2">
              <p className="m-0 text-[0.8rem] text-muted">
                <span className="text-[0.9rem]">🛡️</span> Si la configuració no es pot desxifrar
                (per exemple si ha canviat la clau de xifrat del servidor), torna a activar per
                generar credencials noves:
              </p>
              <button
                onClick={() => {
                  void handleEnable();
                }}
                disabled={loading}
                className={`${secondaryButtonClass} w-full`}
                title="Genera credencials noves i torna a desar la contrasenya xifrada"
              >
                {loading ? "⏳" : "🛡️ Tornar a activar"}
              </button>
              <p className="m-0 text-[0.8rem] text-muted">
                <span className="text-[0.9rem]">⚙️</span> Si has canviat de mòbil o les credencials
                no funcionen, carrega la configuració directament a OwnTracks:
              </p>
              <button
                onClick={() => {
                  void handleLoadConfig();
                }}
                disabled={loading}
                className={`${secondaryButtonClass} w-full`}
                title="Obre OwnTracks amb la configuració ja carregada"
              >
                {loading ? "⏳" : "⚙️ Carregar configuració"}
              </button>
              <p className="m-0 text-[0.75rem] text-muted">
                Només per carregar la configuració (o per obrir un <strong>.otrc</strong>) cal tenir
                activat <strong>«Permet configuració externa»</strong> (en anglès «Allow external
                configuration») a OwnTracks (Ajustos → Avançat); a les versions noves ve desactivat
                per seguretat. Ni «Tornar a activar» ni la descàrrega del fitxer no ho necessiten.
              </p>
              <p className="m-0 text-[0.8rem] text-muted">
                <span className="text-[0.9rem]">🔑</span> Alternativa: baixa el fitxer{" "}
                <strong>.otrc</strong> amb les teves credencials (són personals, no les
                comparteixis):
              </p>
              <button
                onClick={() => {
                  void handleConfig();
                }}
                disabled={loading}
                className={`${secondaryButtonClass} w-full`}
                title="Descarrega el fitxer de configuració OwnTracks"
              >
                {loading ? "⏳" : "📥 Baixar credencials"}
              </button>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {canToggle && (
        <div className="mt-4 border border-border rounded p-3">
          <h4 className="m-0 mb-1 text-[0.85rem] font-semibold">
            Compartir tracking ({activeAdf ? adfLabel(activeAdf.id, activeAdf.nom) : ""})
          </h4>
          <label className="flex items-center gap-2 text-[0.85rem] cursor-pointer">
            <input
              type="checkbox"
              checked={shared}
              disabled={saving}
              onChange={(e) => {
                void toggleShare(e.target.checked);
              }}
            />
            Permetre que altres ADFs vegin les posicions OwnTracks d'aquesta ADF
          </label>
        </div>
      )}

      <h3 className="mt-5 mb-1 text-[0.95rem] font-semibold">
        Usuaris connectats ({connected.length})
      </h3>
      {connected.length === 0 ? (
        <p className="text-muted text-[0.85rem]">Cap usuari actiu ara mateix.</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {connected.map((p) => (
            <li
              key={p.username}
              onClick={() => handleCenterOnUser(p.username)}
              className="flex justify-between items-center px-3 py-2.5 border-b border-soft cursor-pointer hover:bg-soft"
              title="Centra el mapa en aquesta posició"
            >
              <span className="text-[0.9rem] font-medium text-ink">{p.username}</span>
              <span className="text-[0.8rem] text-muted">{timeAgo(p.ts)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
