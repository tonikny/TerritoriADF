import type { LatLon } from "@/map/core/types";
import type { CreateType } from "@/types";
import { CreationSelector } from "@/components/shared/CreationSelector";
import { NewNodeForm } from "@/features/hidrants/NewNodeForm";
import { NovaIncidenciaForm } from "@/features/incidencies/NovaIncidenciaForm";

export function CreateNodePanel({
  form,
  position,
  setForm,
  onClose,
  setNewNodePosition,
}: {
  form: Exclude<CreateType, null>;
  position: LatLon;
  setForm: (form: CreateType) => void;
  onClose: () => void;
  setNewNodePosition: (position: LatLon | null) => void;
}) {
  if (form === "selection") {
    return (
      <div className="p-3">
        <CreationSelector
          onSelectHidrant={() => setForm("hydrant")}
          onSelectIncidencia={() => setForm("incidencia")}
          onClose={onClose}
        />
      </div>
    );
  }

  if (form === "hydrant") {
    return (
      <div className="p-3">
        <NewNodeForm
          lat={position.lat}
          lon={position.lon}
          onClose={onClose}
          setNewNodePosition={setNewNodePosition}
        />
      </div>
    );
  }

  return (
    <div className="p-3">
      <NovaIncidenciaForm lat={position.lat} lon={position.lon} onClose={onClose} />
    </div>
  );
}
