// Configuració pública del backend (GET /api/config): una sola consulta i una
// sola caché per a tota la sessió. La consumeixen l'AuthContext (matriu de
// permisos per a la vista prèvia) i els formularis (límit de moviment d'un
// hidrant i longitud mínima de contrasenya).
import type { AppConfig } from "@territoriadf/contracts/config";
import { useQuery } from "@tanstack/react-query";
import React, { createContext, useContext, useMemo } from "react";

import { request } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/keys";

/** Valor de reserva mentre `/api/config` no ha arribat: el backend és qui valida de veritat. */
const DEFAULT_MIN_PASSWORD_LENGTH = 8;

interface AppConfigContextType {
  maxHidrantMoveMeters: number | null;
  minPasswordLength: number;
  rolePermissions: AppConfig["role_permissions"] | null;
}

const AppConfigContext = createContext<AppConfigContextType | undefined>(undefined);

export const AppConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // La configuració no canvia durant una sessió: una petició, cap refetch.
  const { data } = useQuery({
    queryKey: queryKeys.config,
    queryFn: () => request<AppConfig>("/api/config"),
    staleTime: Infinity,
  });

  const value = useMemo<AppConfigContextType>(() => {
    const maxMeters = data?.max_hydrant_move_meters;
    const minLength = data?.min_password_length;
    return {
      // Sense configuració no es permet arrossegar i es manté el mínim de reserva.
      maxHidrantMoveMeters: typeof maxMeters === "number" && maxMeters > 0 ? maxMeters : null,
      minPasswordLength:
        typeof minLength === "number" && minLength > 0 ? minLength : DEFAULT_MIN_PASSWORD_LENGTH,
      rolePermissions: data?.role_permissions ?? null,
    };
  }, [data]);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- el hook ha de viure amb el context (patró canònic React)
export const useAppConfig = () => {
  const context = useContext(AppConfigContext);
  if (context === undefined) {
    throw new Error("useAppConfig must be used within an AppConfigProvider");
  }
  return context;
};
