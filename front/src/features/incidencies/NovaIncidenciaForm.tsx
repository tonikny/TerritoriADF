import React, { useState } from "react";
import { useIncidencies } from "./useIncidencies";
import { useAuth } from "@/contexts/AuthContext";
import { useAdf } from "@/contexts/AdfContext";
import { toast } from "react-toastify";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  selectClass,
} from "@/styles/uiStyles";
import { CoordinatesLabel } from "@/shared/ui/CoordinatesLabel";
import { logError } from "@/utils/log";
import {
  PRIORITATS_INCIDENCIA,
  PRECISIONS_INCIDENCIA,
  TIPUS_INCIDENCIA,
  VISIBILITATS_INCIDENCIA,
} from "@/utils/incidenciaConstants";

interface NovaIncidenciaFormProps {
  lat: number;
  lon: number;
  onClose: () => void;
}

export const NovaIncidenciaForm = ({ lat, lon, onClose }: NovaIncidenciaFormProps) => {
  const { createIncidencia } = useIncidencies();
  const { user } = useAuth();
  const { activeAdf } = useAdf();
  // Rol efectiu (respecta "veure com" de l'admin): igual que a l'edició, un coordinador
  // només tria visibilitat dins la seva ADF; un admin sempre pot.
  const canChooseVisibility =
    user?.role === "admin" ||
    (user?.role === "coordinador" &&
      user.adf_id !== null &&
      activeAdf !== null &&
      user.adf_id === activeAdf.id);
  const [type, setType] = useState("GENERICA");
  const [priority, setPriority] = useState("MITJANA");
  const [precisio, setPrecisio] = useState("EXACTA");
  const [visibilitat, setVisibilitat] = useState("ADF_PRIVADA");
  const [titol, setTitol] = useState("");
  const [comentari, setComentari] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await createIncidencia({
        titol,
        tipus: type,
        prioritat: priority,
        precisio,
        visibilitat: canChooseVisibility ? visibilitat : "ADF_PRIVADA",
        lat,
        lon,
        comentari,
      });
      toast.success("Incidència reportada amb èxit!");
      onClose();
    } catch (err) {
      logError("Error enviant incidència", err);
      toast.error("Error enviant la incidència");
    } finally {
      setIsSubmitting(false);
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

      {/* Títol */}
      <label className="text-[0.8rem] italic mb-2">
        Títol de la incidència:
        <input
          type="text"
          value={titol}
          onChange={(e) => setTitol(e.target.value)}
          placeholder="Ex: Fum a prop de Can Gall"
          className={inputClass}
          required
        />
      </label>

      {/* Tipus d'Incidència */}
      <label className="text-[0.8rem] italic mb-2">
        Tipus d'incidència:
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={selectClass}
          required
        >
          {TIPUS_INCIDENCIA.map((t) => (
            <option key={t.value} value={t.value}>
              {t.icon ? `${t.icon} ${t.label}` : t.label}
            </option>
          ))}
        </select>
      </label>

      {/* Prioritat */}
      <label className="text-[0.8rem] italic mb-2">
        Prioritat:
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className={selectClass}
          required
        >
          {PRIORITATS_INCIDENCIA.map((p) => (
            <option key={p.value} value={p.value}>
              {p.icon ? `${p.icon} ${p.label}` : p.label}
            </option>
          ))}
        </select>
      </label>

      {/* Precissió de l'ubicació */}
      <label className="text-[0.8rem] italic mb-2">
        Precissió de l'ubicació:
        <select
          value={precisio}
          onChange={(e) => setPrecisio(e.target.value)}
          className={selectClass}
          required
        >
          {PRECISIONS_INCIDENCIA.map((p) => (
            <option key={p.value} value={p.value}>
              {p.icon ? `${p.icon} ${p.label}` : p.label}
            </option>
          ))}
        </select>
      </label>

      {/* Visibilitat: només la tria qui pot decidir-la (coordinador/admin). */}
      {canChooseVisibility ? (
        <label className="text-[0.8rem] italic mb-3">
          Visibilitat:
          <select
            value={visibilitat}
            onChange={(e) => setVisibilitat(e.target.value)}
            className={selectClass}
            required
          >
            {VISIBILITATS_INCIDENCIA.map((v) => (
              <option key={v.value} value={v.value}>
                {v.icon ? `${v.icon} ${v.label}` : v.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-[0.8rem] italic mb-3">
          Visibilitat: <strong>🔒 Només la pròpia ADF</strong>
        </p>
      )}

      {/* Comentari inicial */}
      <label className="text-[0.8rem] italic mb-3">
        Observacions inicials:
        <textarea
          value={comentari}
          onChange={(e) => setComentari(e.target.value)}
          placeholder="Més detalls..."
          className={`${inputClass} font-inherit h-15 resize-y p-[4px_6px]!`}
        />
      </label>

      {/* Botons */}
      <div className="flex justify-between gap-2 mt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`${primaryButtonClass} bg-[#dc3545] flex-1 p-2 text-[0.8rem] disabled:opacity-70 disabled:cursor-not-allowed`}
        >
          {isSubmitting ? "Enviant..." : "Reportar Incidència"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`${secondaryButtonClass} flex-1 p-2 text-[0.8rem]`}
        >
          Cancel·la
        </button>
      </div>
    </form>
  );
};
