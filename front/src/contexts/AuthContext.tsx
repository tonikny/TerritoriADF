// Context d'autenticació: gestor de sessió via cookie httpOnly, exposa user/login/logout.
// Permet a un admin "veure com" un altre rol (coordinador/voluntari) sense canviar la sessió.
import type { SessionResponse, SessionUser } from "@territoriadf/contracts/users";
import { useQuery } from "@tanstack/react-query";
import React, { createContext, useContext, useEffect, useState } from "react";

import { useAppConfig } from "@/contexts/AppConfigContext";
import { ApiError, request } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/keys";
import { queryClient } from "@/shared/query/queryClient";
import { clearOfflineData } from "@/utils/offlineData";
import { storageKey } from "@/utils/storageKeys";

/** Usuari de la sessió (contracte compartit amb el backend). */
export type User = SessionUser;

type ViewRole = "admin" | "coordinador" | "voluntari";

const VIEW_ROLE_KEY = storageKey("view_role");

/**
 * Sessió real (cookie httpOnly). Un 401 no és un error: vol dir "sense sessió"
 * i es resol amb `null` perquè no es reintenti. La resta de fallades (xarxa)
 * queden com a error i deixen l'usuari a `null`.
 */
async function fetchSession(): Promise<SessionResponse | null> {
  try {
    return await request<SessionResponse>("/api/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

/** Escriu la sessió a la mateixa entrada de caché que llegeix la consulta. */
function writeSession(session: SessionResponse | null): void {
  queryClient.setQueryData(queryKeys.session, session);
}

/**
 * Fora les dades de l'usuari anterior (caché de Query i còpia offline). Conserva
 * `session` (esborrar-la faria que el mateix observador la tornés a demanar i el
 * 401 es repetís en bucle) i `config` (és pública i no depèn de l'usuari).
 */
const SHARED_KEYS: ReadonlySet<string> = new Set([queryKeys.session[0], queryKeys.config[0]]);

function clearCachedData(): void {
  queryClient.removeQueries({ predicate: (query) => !SHARED_KEYS.has(String(query.queryKey[0])) });
  void clearOfflineData().catch(() => {});
}

interface AuthContextType {
  user: User | null;
  actualRole: string | null;
  viewRole: ViewRole | null;
  setViewRole: (role: ViewRole | null) => void;
  setActiveAdfId: (id: number | null) => void;
  login: (user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { rolePermissions } = useAppConfig();
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: fetchSession,
    retry: false,
  });
  const rawUser = sessionQuery.data?.user ?? null;

  const [viewRole, setViewRole] = useState<ViewRole | null>(() => {
    const saved = localStorage.getItem(VIEW_ROLE_KEY);
    return saved === "admin" || saved === "coordinador" || saved === "voluntari" ? saved : null;
  });
  const [activeAdfId, setActiveAdfId] = useState<number | null>(() => {
    const saved = localStorage.getItem("active_adf_id");
    return saved ? Number(saved) : null;
  });
  const [prevRawUser, setPrevRawUser] = useState<User | null>(null);

  // Els usuaris no-admin no poden mantenir la vista "com": s'ajusta en render, sense setState a l'effect.
  if (rawUser !== prevRawUser) {
    setPrevRawUser(rawUser);
    if (!rawUser || rawUser.role !== "admin") {
      setViewRole(null);
    }
  }

  // Sessió buida (401 inicial o logout): fora les dades de l'usuari anterior.
  useEffect(() => {
    if (sessionQuery.data === null) {
      clearCachedData();
    }
  }, [sessionQuery.data]);

  // Persisteix cada canvi de vista "com".
  useEffect(() => {
    if (viewRole) {
      localStorage.setItem(VIEW_ROLE_KEY, viewRole);
    } else {
      localStorage.removeItem(VIEW_ROLE_KEY);
    }
  }, [viewRole]);

  // La mateixa entrada que llegeix la consulta: entrar no ha de tornar a demanar `/auth/me`.
  const login = (newUser: User) => {
    writeSession({ user: newUser });
    setViewRole(null);
  };
  const logout = async () => {
    try {
      await request<void>("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      /* ignore */
    }
    setViewRole(null);
    // L'effect de sobre neteja la resta en veure la sessió buida.
    writeSession(null);
  };

  // Usuari efectiu: si l'admin "veu com" un altre rol, s'apliquen el rol i permisos d'aquell rol
  // i l'ADF activa passa a ser la seva (com a membre d'aquesta ADF).
  const user =
    rawUser && viewRole && viewRole !== "admin"
      ? {
          ...rawUser,
          role: viewRole,
          permissions: [...(rolePermissions?.[viewRole] ?? [])],
          adf_id: rawUser.adf_id ?? activeAdfId ?? null,
        }
      : rawUser;

  return (
    <AuthContext.Provider
      value={{
        user,
        actualRole: rawUser?.role ?? null,
        viewRole,
        setViewRole,
        setActiveAdfId,
        login,
        logout: () => {
          void logout();
        },
        loading: sessionQuery.isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- el hook ha de viure amb el context (patró canònic React)
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
