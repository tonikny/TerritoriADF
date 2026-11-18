import type { HidrantFeature } from "../../hooks/useHidrantData";
import { getNodeShareUrl } from "../../utils/urlParams";
import { NodeActions } from "../shared/NodeActions";

export function HydrantActions({
  feature,
  showRoute,
  setShowRoute,
  hasLocation,
}: {
  feature: HidrantFeature;
  showRoute?: boolean;
  setShowRoute?: (v: boolean) => void;
  hasLocation?: boolean;
}) {
  const [lon, lat] = feature.geometry.coordinates;

  return (
    <NodeActions
      shareUrl={getNodeShareUrl(feature.id)}
      lat={lat}
      lon={lon}
      showRoute={showRoute}
      setShowRoute={setShowRoute}
      hasLocation={hasLocation}
    />
  );
}
