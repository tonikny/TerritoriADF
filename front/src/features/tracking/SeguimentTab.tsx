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
            {own.available ? "disponible" : "no disponible"}
            <span
              className={`w-2 h-2 rounded-full ${own.available ? "bg-[#22c55e]" : "bg-[#ef4444]"}`}
              title={own.available ? "disponible" : "no disponible"}
            />
          </span>
        </div>
        {own.enabled && (
          <div className="flex items-center justify-end gap-1.5 leading-none text-[0.8rem] text-muted mt-px">
            <span>usuari activat</span>
            <span className="w-2 h-2 rounded-full bg-[#22c55e]" title="usuari activat" />
          </div>
        )}
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
          <p className="m-0 text-[0.8rem] text-muted">
            <span className="text-[0.9rem]">📡</span> Obre OwnTracks al mòbil (des de la pantalla
            d'inici: el navegador no pot llançar-la) i deixa-la oberta, encara que sigui en segon
            pla o amb la pantalla bloquejada. Si la tanques ("Sortir" al menú), deixaràs de
            compartir la posició.
          </p>
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

      <ConnectedUsersList users={connected} onCenter={centerOnUser} />
    </div>
  );
}
