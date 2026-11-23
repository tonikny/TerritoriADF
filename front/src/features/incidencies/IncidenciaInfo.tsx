import { useEffect, useState } from "react";
import { useIncidencies } from "./useIncidencies";
import type { Incidencia, IncidenciaEvent, IncidenciaFeature } from "@/types";
import { IncidenciaInfoView } from "./IncidenciaInfoView";
import { IncidenciaEditForm } from "./IncidenciaEditForm";
import { logError } from "@/utils/log";
import { usePreventLeave } from "@/hooks/usePreventLeave";

export const IncidenciaInfo = ({
  incidencia,
  showRoute,
  setShowRoute,
  hasLocation,
  canEdit,
  editing,
  setEditing,
  className = "",
}: {
  incidencia: IncidenciaFeature;
  showRoute?: boolean;
  setShowRoute?: (v: boolean) => void;
  hasLocation?: boolean;
  canEdit: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  className?: string;
}) => {
  const { getIncidencia, refresh } = useIncidencies();
  const [detail, setDetail] = useState<(Incidencia & { events: IncidenciaEvent[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const base: Incidencia = incidencia.properties;

  usePreventLeave(editing);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const data = await getIncidencia(base.id);
      setDetail(data);
    } catch (err) {
      logError("Error carregant incidència", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- càrrega asíncrona legítima
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.id]);

  const handleCancelEdit = () => {
    if (window.confirm("Hi ha canvis sense desar. Si tanques ara, es perdran. Vols continuar?")) {
      setEditing(false);
    }
  };

  return (
    <div className={`${className} p-3 flex flex-col gap-3`}>
      {!editing || !canEdit ? (
        <IncidenciaInfoView
          incidencia={detail ?? base}
          events={detail?.events ?? []}
          loadingEvents={loading}
          showRoute={showRoute ?? false}
          setShowRoute={setShowRoute}
          hasLocation={hasLocation}
        />
      ) : (
        <IncidenciaEditForm
          incidencia={base}
          onDone={() => {
            setEditing(false);
            void loadDetail();
            void refresh();
          }}
          onCancel={handleCancelEdit}
        />
      )}
    </div>
  );
};
