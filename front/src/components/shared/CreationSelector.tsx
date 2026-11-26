import React, { useState } from "react";
import { secondaryButtonClass } from "@/styles/uiStyles";

interface CreationSelectorProps {
  onSelectHidrant: () => void;
  onSelectIncidencia: () => void;
  onClose: () => void;
}

export const CreationSelector: React.FC<CreationSelectorProps> = ({
  onSelectHidrant,
  onSelectIncidencia,
  onClose,
}) => {
  const [hoveredCard, setHoveredCard] = useState<"hydrant" | "incidencia" | null>(null);

  const cardClass = (type: "hydrant" | "incidencia"): string => {
    const isHovered = hoveredCard === type;
    const isHidrant = type === "hydrant";
    const hoverClass = isHovered
      ? isHidrant
        ? "border-primary bg-primary/10 shadow-control"
        : "border-alert bg-alert/10 shadow-control"
      : "border-border bg-white";
    return `flex flex-col items-center p-5 rounded-lg border-2 cursor-pointer transition-all duration-200 ease-in-out flex-1 min-w-25 text-center ${hoverClass}`;
  };

  return (
    <div className="flex flex-col gap-4 p-[0.5rem_0]">
      <div className="text-muted text-sm mb-2 text-center">
        Què vols afegir en aquesta ubicació?
      </div>

      <div className="flex gap-4 w-full">
        {/* Card Hidrant */}
        <div
          className={cardClass("hydrant")}
          onMouseEnter={() => setHoveredCard("hydrant")}
          onMouseLeave={() => setHoveredCard(null)}
          onClick={onSelectHidrant}
        >
          <span className="text-[2.5rem] mb-2">📍</span>
          <strong className="text-base text-ink mb-1">Nou Hidrant</strong>
          <span className="text-xs text-muted leading-[1.2]">
            Registra un nou hidrant amb dades tècniques.
          </span>
        </div>

        {/* Card Incidència */}
        <div
          className={cardClass("incidencia")}
          onMouseEnter={() => setHoveredCard("incidencia")}
          onMouseLeave={() => setHoveredCard(null)}
          onClick={onSelectIncidencia}
        >
          <span className="text-[2.5rem] mb-2">⚠️</span>
          <strong className="text-base text-ink mb-1">Incidència</strong>
          <span className="text-xs text-muted leading-[1.2]">
            Reporta un foc, obstacle, o anomalia a la zona.
          </span>
        </div>
      </div>

      <div className="flex justify-end mt-2">
        <button onClick={onClose} className={`${secondaryButtonClass} w-auto`}>
          Cancel·lar
        </button>
      </div>
    </div>
  );
};
