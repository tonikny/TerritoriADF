import type { HidrantFeature } from "../../hooks/useHidrantData";
import { getHydrantDisplayData, getHydrantImages } from "../../utils/osmConversion";
import { HydrantImages } from "./HydrantImages";
import { QuickStatusButtons } from "./QuickStatusButtons";
import { HydrantActions } from "./HydrantActions";
import { HydrantSyncActions } from "./HydrantSyncActions";

export function HydrantInfoView({
  feature,
  canEdit,
  isAdmin,
  showRoute,
  setShowRoute,
  hasLocation,
  onQuickStatus,
  refreshHidrants,
}: {
  feature: HidrantFeature;
  canEdit: boolean;
  isAdmin: boolean;
  showRoute?: boolean;
  setShowRoute?: (v: boolean) => void;
  hasLocation?: boolean;
  onQuickStatus: (isOperative: boolean) => void;
  refreshHidrants?: () => Promise<void>;
}) {
  const props = feature.properties;
  const displayData = getHydrantDisplayData(props.ui_fields);

  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-3 text-[0.85rem]">
          <div className="flex flex-col items-end gap-y-1.5 text-muted">
            {displayData.map(({ label }) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="flex flex-col items-start gap-y-1.5 text-ink">
            {displayData.map(({ label, value }) => (
              <span key={label}>{value}</span>
            ))}
          </div>
        </div>
        <HydrantImages images={getHydrantImages(props.osm_tags)} />
      </div>

      {props.private_tags?.observacions && (
        <div className="border border-border rounded p-2">
          <div className="text-xs text-muted mb-1">Observacions</div>
          <div className="text-[0.85rem] text-ink whitespace-pre-wrap">
            {props.private_tags.observacions}
          </div>
        </div>
      )}

      {isAdmin && <HydrantSyncActions feature={feature} refreshHidrants={refreshHidrants} />}

      {canEdit && (
        <QuickStatusButtons
          onOperative={() => onQuickStatus(true)}
          onOutOfService={() => onQuickStatus(false)}
        />
      )}

      <HydrantActions
        feature={feature}
        showRoute={showRoute}
        setShowRoute={setShowRoute}
        hasLocation={hasLocation}
      />
    </>
  );
}
