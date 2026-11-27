import React from "react";
import type { IncidenciaEvent } from "@territoriadf/contracts/incidencies";

interface TimelineProps {
  events: IncidenciaEvent[];
}

export const Timeline = ({ events }: TimelineProps) => {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.creat_at).getTime() - new Date(a.creat_at).getTime(),
  );

  const formatData = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("ca-ES", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderEventContent = (event: IncidenciaEvent) => {
    const { tipus_event, dades } = event;

    switch (tipus_event) {
      case "CREACIO":
        return (
          <div>
            <strong>Creat l'incidència</strong>
            {dades.comentari && (
              <p className="m-[4px_0_0_0] italic font-inherit">"{dades.comentari}"</p>
            )}
          </div>
        );
      case "CANVI_ESTAT":
        return (
          <div className="font-inherit">
            Estat: <s>{dades.anterior}</s> ➡️ <strong>{dades.nou}</strong>
          </div>
        );
      case "OBSERVACIO":
        return (
          <div className="font-inherit">
            <strong>Observació:</strong>
            <p className="m-[4px_0_0_0] font-inherit">{dades.comentari}</p>
          </div>
        );
      case "CANVI_UBICACIO":
        return <div className="font-inherit">Ubicació actualitzada</div>;
      case "CANVI_TIPUS":
        return (
          <div className="font-inherit">
            Tipus: <s>{dades.anterior}</s> ➡️ <strong>{dades.nou}</strong>
          </div>
        );
      case "CANVI_PRIORITAT":
        return (
          <div className="font-inherit">
            Prioritat: <s>{dades.anterior}</s> ➡️ <strong>{dades.nou}</strong>
          </div>
        );
      case "CANVI_PRECISIO":
        return (
          <div className="font-inherit">
            Precissió de l'ubicació: <s>{dades.anterior}</s> ➡️ <strong>{dades.nou}</strong>
          </div>
        );
      case "CANVI_VISIBILITAT":
        return (
          <div className="font-inherit">
            Visibilitat: <s>{dades.anterior}</s> ➡️ <strong>{dades.nou}</strong>
          </div>
        );
      default:
        return <div className="font-inherit">{tipus_event}</div>;
    }
  };

  return (
    <div className="flex flex-col gap-4 pl-2.5 border-l-2 border-border relative">
      {sortedEvents.map((event) => (
        <div key={event.id} className="text-sm relative">
          <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-white" />
          <div className="text-faint text-xs mb-0.5">
            {formatData(event.creat_at)} - {event.nom_usuari || "Anònim"}
          </div>
          <div className="bg-soft p-[6px_10px] rounded-lg border border-soft font-inherit">
            {renderEventContent(event)}
          </div>
        </div>
      ))}
    </div>
  );
};
