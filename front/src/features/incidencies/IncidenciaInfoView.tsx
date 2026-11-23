import type { Incidencia, IncidenciaEvent } from "@/types";
import { Timeline } from "./Timeline";
import { NodeActions } from "@/components/shared/NodeActions";
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
    year: "numeric",
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
}: {
  incidencia: Incidencia;
  events: IncidenciaEvent[];
  loadingEvents: boolean;
  showRoute?: boolean;
  setShowRoute?: (v: boolean) => void;
  hasLocation?: boolean;
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
      <div className="flex gap-3 text-[0.85rem]">
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
        <div className="text-muted text-[0.8rem]">Carregant historial...</div>
      ) : (
        <div className="max-h-45 overflow-y-auto">
          <Timeline events={events} />
        </div>
      )}

      <NodeActions
        shareUrl={getIncidenciaShareUrl(incidencia.id)}
        lat={incidencia.lat}
        lon={incidencia.lon}
        showRoute={showRoute}
        setShowRoute={setShowRoute}
        hasLocation={hasLocation}
      />
    </>
  );
}
