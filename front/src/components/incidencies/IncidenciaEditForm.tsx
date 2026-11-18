import { useState } from "react";
import type { Incidencia } from "../../types";
import { useIncidencies } from "../../hooks/useIncidencies";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "react-toastify";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  selectClass,
} from "../../styles/uiStyles";
import {
  ESTATS_INCIDENCIA,
  PRECISIONS_INCIDENCIA,
  PRIORITATS_INCIDENCIA,
  TIPUS_INCIDENCIA,
  VISIBILITATS_INCIDENCIA,
} from "../../utils/incidenciaConstants";

export function IncidenciaEditForm({
  incidencia,
  onCancel,
  onDone,
}: {
  incidencia: Incidencia;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { addEvent } = useIncidencies();
  const { user, actualRole } = useAuth();
  const canChangeVisibility =
    actualRole === "admin" ||
    (actualRole === "coordinador" &&
      user !== null &&
      user.adf_id !== null &&
      user.adf_id === incidencia.adf_id);
  const [newTipus, setNewTipus] = useState<string>(incidencia.tipus);
  const [newStatus, setNewStatus] = useState<string>(incidencia.estat);
  const [newPriority, setNewPriority] = useState<string>(incidencia.prioritat);
  const [newPrecisio, setNewPrecisio] = useState<string>(incidencia.precisio);
  const [newVisibilitat, setNewVisibilitat] = useState<string>(incidencia.visibilitat);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasChanges =
    newTipus !== incidencia.tipus ||
    newStatus !== incidencia.estat ||
    newPriority !== incidencia.prioritat ||
    newPrecisio !== incidencia.precisio ||
    newVisibilitat !== incidencia.visibilitat ||
    !!newComment;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasChanges) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (newTipus !== incidencia.tipus) {
        await addEvent(incidencia.id, "CANVI_TIPUS", {
          anterior: incidencia.tipus,
          nou: newTipus,
        });
      }
      if (newStatus !== incidencia.estat) {
        await addEvent(incidencia.id, "CANVI_ESTAT", {
          anterior: incidencia.estat,
          nou: newStatus,
        });
      }
      if (newPriority !== incidencia.prioritat) {
        await addEvent(incidencia.id, "CANVI_PRIORITAT", {
          anterior: incidencia.prioritat,
          nou: newPriority,
        });
      }
      if (newPrecisio !== incidencia.precisio) {
        await addEvent(incidencia.id, "CANVI_PRECISIO", {
          anterior: incidencia.precisio,
          nou: newPrecisio,
        });
      }
      if (canChangeVisibility && newVisibilitat !== incidencia.visibilitat) {
        await addEvent(incidencia.id, "CANVI_VISIBILITAT", {
          anterior: incidencia.visibilitat,
          nou: newVisibilitat,
        });
      }
      if (newComment) {
        await addEvent(incidencia.id, "OBSERVACIO", {
          comentari: newComment,
        });
      }
      toast.success("Incidència actualitzada");
      onDone();
    } catch {
      toast.error("Error al actualitzar la incidència");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col gap-3">
        <label className="text-[0.8rem] italic flex flex-col gap-1">
          Tipus d'incidència:
          <select
            value={newTipus}
            onChange={(e) => setNewTipus(e.target.value)}
            className={selectClass}
          >
            {TIPUS_INCIDENCIA.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon ? `${t.icon} ${t.label}` : t.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-[0.8rem] italic flex flex-col gap-1">
            Estat:
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className={selectClass}
            >
              {ESTATS_INCIDENCIA.map((estat) => (
                <option key={estat.value} value={estat.value}>
                  {estat.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-[0.8rem] italic flex flex-col gap-1">
            Prioritat:
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className={selectClass}
            >
              {PRIORITATS_INCIDENCIA.map((prioritat) => (
                <option key={prioritat.value} value={prioritat.value}>
                  {prioritat.icon ? `${prioritat.icon} ${prioritat.label}` : prioritat.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-[0.8rem] italic flex flex-col gap-1">
          Precissió de l'ubicació:
          <select
            value={newPrecisio}
            onChange={(e) => setNewPrecisio(e.target.value)}
            className={selectClass}
          >
            {PRECISIONS_INCIDENCIA.map((precisio) => (
              <option key={precisio.value} value={precisio.value}>
                {precisio.icon ? `${precisio.icon} ${precisio.label}` : precisio.label}
              </option>
            ))}
          </select>
        </label>

        {canChangeVisibility && (
          <label className="text-[0.8rem] italic flex flex-col gap-1">
            Visibilitat:
            <select
              value={newVisibilitat}
              onChange={(e) => setNewVisibilitat(e.target.value)}
              className={selectClass}
            >
              {VISIBILITATS_INCIDENCIA.map((visibilitat) => (
                <option key={visibilitat.value} value={visibilitat.value}>
                  {visibilitat.icon
                    ? `${visibilitat.icon} ${visibilitat.label}`
                    : visibilitat.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="text-[0.8rem] italic flex flex-col gap-1">
          Comentari:
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={3}
            className={`${inputClass} w-full resize-y text-[0.8rem] p-1.5`}
            placeholder="Afegeix una observació..."
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`${primaryButtonClass} flex-1 py-2 text-[0.8rem] disabled:opacity-70`}
          >
            {isSubmitting ? "Guardant..." : "Guardar"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }}
            className={`${secondaryButtonClass} flex-1 py-2 text-[0.8rem]`}
          >
            Cancel·lar
          </button>
        </div>
      </div>
    </form>
  );
}
