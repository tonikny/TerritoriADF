import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { toast } from "react-toastify";
import { useLocalStorage } from "../utils/useLocalStorage";
import { storageKey } from "../utils/storageKeys";

const geoAvailable = typeof navigator.geolocation?.watchPosition === "function";

export function useGeolocationTracking() {
  const map = useMap();
  const [tracking, setTracking] = useLocalStorage<boolean>(storageKey("gps_follow"), false);
  const [position, setPosition] = useState<L.LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const firstUpdateRef = useRef(true);
  const manualToggleRef = useRef(false);

  useEffect(() => {
    const onError = () => {
      toast.error("Permís de localització denegat o no disponible");
    };

    map.on("locationerror", onError);

    return () => {
      map.off("locationerror", onError);
    };
  }, [map]);

  useEffect(() => {
    if (tracking && !geoAvailable) {
      return;
    }

    if (tracking) {
      const manual = manualToggleRef.current;
      manualToggleRef.current = false;
      if (manual) {
        toast.success("Seguiment de la posició activat");
      }
      firstUpdateRef.current = true;

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (!map || !map.getContainer()) {
            return;
          }

          const { latitude, longitude, accuracy } = pos.coords;
          const latlng = L.latLng(latitude, longitude);
          setPosition(latlng);
          setAccuracy(accuracy);

          if (firstUpdateRef.current) {
            map.whenReady(() => {
              map.setView(latlng, 17);
              setTimeout(() => {
                if (map.getContainer()) {
                  map.invalidateSize();
                }
              }, 100);
            });
            firstUpdateRef.current = false;
          }
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
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        toast.info("Seguiment de la posició desactivat");
      }
    }

    // ✅ Funció de neteja correcta
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [tracking, map, setTracking]);

  const toggleTracking = () => {
    if (!tracking && !geoAvailable) {
      toast.error("Geolocalització no disponible al teu navegador");
      return;
    }
    manualToggleRef.current = !tracking;
    setTracking((prev) => !prev);
    if (tracking) {
      setPosition(null);
      setAccuracy(null);
    }
  };

  return {
    tracking,
    toggleTracking,
    position,
    accuracy,
  };
}
