import { useState, useEffect, type ReactNode } from "react";
import { can } from "@territoriadf/contracts/permissions";
import type { LatLon } from "@/map/core/types";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import { useAuth } from "@/contexts/AuthContext";
import { useAdf } from "@/contexts/AdfContext";
import { useHidrantActions } from "./useHidrantActions";
import { HidrantInfoView } from "./HidrantInfoView";
import { HidrantEditForm } from "./HidrantEditForm";
import { usePreventLeave } from "@/hooks/usePreventLeave";

export const NodeInfo = ({
  feature,
  showRoute,
  setShowRoute,
  hasLocation,
  canEdit,
  syncActions,
  editing,
  setEditing,
  draftPosition,
  setDraftPosition,
  className = "",
}: {
  feature: HidrantFeature;
  showRoute?: boolean;
  setShowRoute?: (value: boolean) => void;
  hasLocation?: boolean;
  canEdit: boolean;
  syncActions?: ReactNode;
  editing: boolean;
  setEditing: (v: boolean) => void;
  draftPosition?: LatLon | null;
  setDraftPosition?: (v: LatLon | null) => void;
  className?: string;
}) => {
  const { user } = useAuth();
  const { activeAdf } = useAdf();
  const props = feature.properties;
  const [data, setData] = useState(props.ui_fields);
  const [observacions, setObservacions] = useState(props.service_tags?.observacions || "");

  // Sincronitzar l'estat del formulari quan feature canvia (actualització des del backend)
  /* eslint-disable react-hooks/set-state-in-effect -- actualització necessària quan canvien les dades del backend */
  useEffect(() => {
    setData(props.ui_fields);
    setObservacions(props.service_tags?.observacions || "");
  }, [props.ui_fields, props.service_tags?.observacions]);

  const canDelete = canEdit && can(user?.permissions, "delete_hydrant");

  const { busy, save, quickStatus, remove } = useHidrantActions(feature, activeAdf);

  const handleSave = async () => {
    const ok = await save({
      uiFields: data,
      observacions,
      originalUiFields: props.ui_fields,
      originalObservacions: props.service_tags?.observacions || "",
      newLat: draftPosition?.lat,
      newLon: draftPosition?.lon,
    });
    if (ok) {
      setEditing(false);
      setDraftPosition?.(null);
    }
  };

  const handleQuickStatus = async (isOperative: boolean) => {
    const newData = await quickStatus(isOperative, data);
    if (newData) {
      setData(newData);
    }
  };

  const handleCancelEdit = () => {
    if (
      !hasChanges ||
      window.confirm("Hi ha canvis sense desar. Si tanques ara, es perdran. Vols continuar?")
    ) {
      setEditing(false);
      setDraftPosition?.(null);
    }
  };

  const hasChanges =
    editing &&
    (JSON.stringify(data) !== JSON.stringify(props.ui_fields) ||
      observacions !== (props.service_tags?.observacions || "") ||
      !!draftPosition);

  usePreventLeave(hasChanges);

  return (
    <div className={`${className} p-3 flex flex-col gap-3`}>
      {!editing ? (
        <HidrantInfoView
          feature={feature}
          canEdit={canEdit}
          syncActions={syncActions}
          showRoute={showRoute ?? false}
          setShowRoute={setShowRoute}
          hasLocation={hasLocation}
          showRouteButton={!!user}
          onQuickStatus={(v) => {
            void handleQuickStatus(v);
          }}
        />
      ) : (
        <HidrantEditForm
          data={data}
          setData={setData}
          observacions={observacions}
          setObservacions={setObservacions}
          busy={busy}
          onSave={() => {
            void handleSave();
          }}
          onCancel={handleCancelEdit}
          onDelete={
            canDelete
              ? () => {
                  void remove();
                }
              : undefined
          }
        />
      )}
    </div>
  );
};
