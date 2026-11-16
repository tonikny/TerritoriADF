import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useLocalStorage } from "../utils/useLocalStorage";
import { storageKey } from "../utils/storageKeys";
import type { LatLon } from "../map/core/types";

const geoAvailable =
  typeof navigator !== "undefined" && typeof navigator.geolocation?.watchPosition === "function";

export function useGeolocationTracking() {
  const [tracking, setTracking] = useLocalStorage<boolean>(storageKey("gps_follow"), false);
  const [position, setPosition] = useState<LatLon | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  useEffect(() => {
    if (!tracking || !geoAvailable) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy);
      },
      () => {
        toast.error("No s'ha pogut obtenir la teva posició");
        setTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [tracking, setTracking]);

  const toggleTracking = () => {
    if (!tracking && !geoAvailable) {
      toast.error("Geolocalització no disponible al teu navegador");
      return;
    }
    if (tracking) {
      setPosition(null);
      setAccuracy(null);
      toast.info("Seguiment de la posició desactivat");
    } else {
      toast.success("Seguiment de la posició activat");
    }
    setTracking((prev) => !prev);
  };

  return {
    tracking,
    toggleTracking,
    position,
    accuracy,
  };
}
