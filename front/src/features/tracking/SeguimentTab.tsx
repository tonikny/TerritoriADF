import type { Position } from "@territoriadf/contracts/tracking";

import { useAuth } from "@/contexts/AuthContext";
import { ConnectedUsersList } from "./ConnectedUsersList";
import { SeguimentSetupSteps } from "./SeguimentSetupSteps";
import { TrackingConfigSection } from "./TrackingConfigSection";
import { TrackingShareToggle } from "./TrackingShareToggle";
import { useConnectedUsers } from "./useConnectedUsers";
import { useOwnTracks } from "./useOwnTracks";
import { useTrackingShare } from "./useTrackingShare";

/**
 * Pestanya de seguiment: estat d'OwnTracks, posicions compartides i usuaris
 * connectats. L'estat viu a `useOwnTracks` i `useTrackingShare`; aquí només es
 * compon la vista.
 */
export function SeguimentTab({
  positions,
  onCenterCoordinates,
}: {
  positions: Record<string, Position>;
  onCenterCoordinates?: (coords: [number, number]) => void;
}) {
  const { user } = useAuth();
  const own = useOwnTracks();
  const share = useTrackingShare();
  const connected = useConnectedUsers(positions);

  const centerOnUser = (username: string) => {
    const pos = positions[username];
    if (!pos) {
      return;
    }
    onCenterCoordinates?.([pos.lon, pos.lat]);
  };

  if (!user) {
    return (
      <div className="p-4 text-sm text-muted">
        Inicia sessió a la pestanya <strong>Usuaris</strong> per activar el seguiment.
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="panel-title">Seguiment OwnTracks</h3>
        {/* Estat en dues pastilles enganxades a la dreta del títol. */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs leading-tight ${
              own.available
                ? "border-border bg-soft text-ink"
                : "border-alert/40 bg-alert/10 text-alert"
            }`}
          >
            {own.available ? "disponible" : "no disponible"}
            <span
              className={`w-2 h-2 rounded-full ${own.available ? "bg-ok" : "bg-alert"}`}
              aria-hidden
            />
          </span>
          {own.enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-soft px-2 py-0.5 text-xs leading-tight text-ink">
              usuari activat
              <span className="w-2 h-2 rounded-full bg-ok" aria-hidden />
            </span>
          )}
        </div>
      </div>

      {/* Primera cosa que es vol veure: qui comparteix posició ara mateix. */}
      <div className="mb-4">
        <ConnectedUsersList users={connected} onCenter={centerOnUser} />
      </div>

      {!own.enabled ? (
        <SeguimentSetupSteps
          loading={own.loading}
          onEnable={() => {
            void own.enable();
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="space-y-2 text-sm text-muted">
            <p className="m-0">
              Obre OwnTracks al mòbil i deixa-la oberta, encara que sigui en segon pla o amb la
              pantalla bloquejada.
            </p>
            <p className="m-0">
              Si la tanques («Sortir» al menú), deixaràs de compartir la posició.
            </p>
          </div>
          <TrackingConfigSection
            loading={own.loading}
            onEnable={() => {
              void own.enable();
            }}
            onLoadConfig={() => {
              void own.loadConfig();
            }}
            onDownloadConfig={() => {
              void own.downloadConfig();
            }}
          />
        </div>
      )}

      {share.canToggle && share.activeAdf && (
        <TrackingShareToggle
          adf={share.activeAdf}
          shared={share.shared}
          saving={share.saving}
          onToggle={(checked) => {
            void share.toggle(checked);
          }}
        />
      )}
    </div>
  );
}
