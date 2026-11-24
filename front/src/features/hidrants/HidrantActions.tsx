import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import { getNodeShareUrl } from "@/utils/urlParams";
import { NodeActions } from "@/shared/ui/NodeActions";

export function HidrantActions({
  feature,
  showRoute,
  setShowRoute,
  hasLocation,
  showRouteButton,
}: {
  feature: HidrantFeature;
  showRouteButton?: boolean;
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
      showRouteButton={showRouteButton}
      showRoute={showRoute}
      setShowRoute={setShowRoute}
      hasLocation={hasLocation}
    />
  );
}
