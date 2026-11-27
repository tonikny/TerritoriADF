import type { Incidencia, IncidenciaEvent } from "@territoriadf/contracts/incidencies";
import { Timeline } from "./Timeline";
import { NodeActions } from "@/shared/ui/NodeActions";
import { getIncidenciaShareUrl } from "@/utils/urlParams";
import {
  ESTATS_INCIDENCIA,
  PRECISIONS_INCIDENCIA,
  PRIORITATS_INCIDENCIA,
  TIPUS_INCIDENCIA,
  VISIBILITATS_INCIDENCIA,
  displayCategoria,
} from "@/utils/incidenciaConstants";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("ca-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IncidenciaInfoView({
  incidencia,
  events,
  loadingEvents,
  showRoute,
  setShowRoute,
  hasLocation,
  showRouteButton,
}: {
  incidencia: Incidencia;
  events: IncidenciaEvent[];
  loadingEvents: boolean;
  showRoute?: boolean;
  setShowRoute?: (v: boolean) => void;
  hasLocation?: boolean;
  showRouteButton?: boolean;
}) {
  const rows: Array<[string, string]> = [
    ["Tipus", displayCategoria(TIPUS_INCIDENCIA, incidencia.tipus)],
    ["Estat", displayCategoria(ESTATS_INCIDENCIA, incidencia.estat)],
    ["Prioritat", displayCategoria(PRIORITATS_INCIDENCIA, incidencia.prioritat)],
    ["Precisió", displayCategoria(PRECISIONS_INCIDENCIA, incidencia.precisio)],
    ["Visibilitat", displayCategoria(VISIBILITATS_INCIDENCIA, incidencia.visibilitat)],
    ["Creada", formatDate(incidencia.creat_at)],
    ["Actualitzada", formatDate(incidencia.actualitzat_at)],
  ];

  return (
    <>
      <div className="flex gap-3 text-sm">
        <div className="flex flex-col items-end gap-y-1.5 text-muted">
          {rows.map(([label]) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="flex flex-col items-start gap-y-1.5 text-ink">
          {rows.map(([label, value]) => (
            <span key={label}>{value}</span>
          ))}
        </div>
      </div>

      {loadingEvents ? (
        <div className="text-muted text-sm">Carregant historial...</div>
      ) : (
        <div className="max-h-[45vh] overflow-y-auto">
          <Timeline events={events} />
        </div>
      )}

      <NodeActions
        shareUrl={getIncidenciaShareUrl(incidencia.id)}
        lat={incidencia.lat}
        lon={incidencia.lon}
        showRouteButton={showRouteButton}
        showRoute={showRoute}
        setShowRoute={setShowRoute}
        hasLocation={hasLocation}
      />
    </>
  );
}
