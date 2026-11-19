import { useState } from "react";
import { sendToTelegram } from "../../utils/sendToTelegram";
import type { LatLon } from "../../map/core/types";
import { toast } from "react-toastify";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "../../styles/uiStyles";
import type { HydrantUiFields } from "../../utils/osmConversion";
import { HydrantFormFields } from "./HydrantFormFields";
import { logError } from "../../utils/log";
import { useAdf } from "../../contexts/AdfContext";
import { CoordinatesLabel } from "../shared/CoordinatesLabel";

interface NewNodeFormProps {
  lat: number;
  lon: number;
  onClose: () => void;
  setNewNodePosition: (position: LatLon | null) => void;
  refreshHidrants?: () => void;
}

export const NewNodeForm = ({
  lat,
  lon,
  onClose,
  setNewNodePosition,
  refreshHidrants,
}: NewNodeFormProps) => {
  const [observacions, setObservacions] = useState("");
  const { activeAdf } = useAdf();
  const [isInspected, setIsInspected] = useState(false);

  const [data, setData] = useState<HydrantUiFields>({
    type: "",
    position: "",
    couplings: "",
    diameters: "",
    pressure: "",
    street: "",
    num: "",
    barri: "",
    estat: "Desconegut",
    surveyDate: "",
  });

  const handleInspectedChange = (checked: boolean) => {
    setIsInspected(checked);
    if (checked) {
      setData((prev) => ({
        ...prev,
        estat: "Operatiu",
        surveyDate: new Date().toISOString().split("T")[0],
      }));
    } else {
      setData((prev) => ({
        ...prev,
        estat: "Desconegut",
        surveyDate: "",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeAdf) {
      toast.error("Cal seleccionar una ADF");
      return;
    }

    try {
      // La creació es fa via l'endpoint protegit (valida permís i abast ADF);
      // sendToTelegram només notifica, ja no escriu a la BD.
      const createdRes = await fetch(`/api/hidrants?adf=${activeAdf.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lon,
          ui_fields: data,
          private_tags: {
            observacions: observacions.trim() || undefined,
          },
        }),
      });
      if (!createdRes.ok) {
        throw new Error("Error creant l'hidrant");
      }
      const created = (await createdRes.json()) as { id: string };

      try {
        await sendToTelegram({
          lat,
          lon,
          tags: {
            id: created.id,
            ui_fields: data,
            private_tags: {
              observacions: observacions.trim() || undefined,
            },
          },
          adf_id: activeAdf.id,
          action: "create",
        });
      } catch (err) {
        // L'hidrant ja s'ha creat: una fallada de Telegram no ha de fer-ho semblar fallit.
        logError("Error notificant la creació a Telegram", err);
      }
      toast.success("Hidrant afegit");
      setObservacions("");
      if (refreshHidrants) {
        await refreshHidrants();
      }
      onClose();
      setNewNodePosition(null);
    } catch {
      toast.error("Error en afegir l'hidrant");
    }
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="flex flex-col px-2"
    >
      <CoordinatesLabel lat={lat} lon={lon} />

      <div className="mb-2">
        <label
          className={`flex items-center gap-2 text-[0.85rem] cursor-pointer p-2 rounded border ${isInspected ? "bg-[#e8f5e9] border-[#2e7d32]" : "bg-[#f5f5f5] border-border"}`}
        >
          <input
            type="checkbox"
            checked={isInspected}
            onChange={(e) => handleInspectedChange(e.target.checked)}
          />
          <span>🔍 He revisat l'estat ara mateix</span>
        </label>
      </div>

      <HydrantFormFields data={data} onChange={setData} showSurveyDateAndStatus={isInspected} />

      <label className="text-[0.8rem] w-full italic mb-4 mt-2">
        Observacions:
        <textarea
          value={observacions}
          onChange={(e) => setObservacions(e.target.value)}
          rows={2}
          placeholder="Observacions internes de l'hidrant..."
          className={`${inputClass} w-full resize-y`}
        />
      </label>

      <div className="flex justify-between gap-2 mt-2">
        <button type="submit" className={`${primaryButtonClass} flex-1 p-1.5 text-xs`}>
          Enviar
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`${secondaryButtonClass} flex-1 p-1.5 text-xs`}
        >
          Cancel·la
        </button>
      </div>
    </form>
  );
};
