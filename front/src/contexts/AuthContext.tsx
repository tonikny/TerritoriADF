// Context d'autenticació: gestor de sessió via cookie httpOnly, exposa user/login/logout.
// Permet a un admin "veure com" un altre rol (coordinador/voluntari) sense canviar la sessió.
import React, { createContext, useContext, useState, useEffect } from "react";
import { storageKey } from "../utils/storageKeys";

export interface User {
  id: string;
  username: string;
  adf_id: number | null;
  role: string;
  mqtt_enabled: boolean;
  permissions: string[];
}

/** Resposta de GET /api/auth/me. */
export interface SessionResponse {
  user: User;
}

/** Resposta de POST /api/auth/login: el mateix usuari + el token (l'auth real és la cookie httpOnly). */
export interface LoginResponse extends SessionResponse {
  token: string;
}

type ViewRole = "admin" | "coordinador" | "voluntari";

const VIEW_ROLE_KEY = storageKey("view_role");

// Matriu rol → permisos publicada pel backend (GET /api/config, que la treu de
// back/src/permissions.ts). Es demana una sola vegada per sessió; mentre no ha arribat
// (o si falla), la vista "veure com" queda sense permisos en lloc de duplicar la matriu aquí.
let cachedRolePermissions: Record<string, string[]> | null = null;

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
  const [rawUser, setRawUser] = useState<User | null>(null);
  const [viewRole, setViewRole] = useState<ViewRole | null>(() => {
    const saved = localStorage.getItem(VIEW_ROLE_KEY);
    return saved === "admin" || saved === "coordinador" || saved === "voluntari" ? saved : null;
  });
  const [activeAdfId, setActiveAdfId] = useState<number | null>(() => {
    const saved = localStorage.getItem("active_adf_id");
    return saved ? Number(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [prevRawUser, setPrevRawUser] = useState<User | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]> | null>(
    cachedRolePermissions,
  );

  // Els usuaris no-admin no poden mantenir la vista "com": s'ajusta en render, sense setState a l'effect.
  if (rawUser !== prevRawUser) {
    setPrevRawUser(rawUser);
    if (!rawUser || rawUser.role !== "admin") {
      setViewRole(null);
    }
  }

  // Segueix l'ADF activa (emesa per AdfContext) per assignar-la quan un admin "veu com" un rol d'ADF.
  // Verifica la sessió al mount (la cookie auth_token la gestiona el servidor).
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (response.ok) {
          const data = await response.json();
          setRawUser(data.user);
        } else {
          setRawUser(null);
        }
      } catch {
        setRawUser(null);
      } finally {
        setLoading(false);
      }
    };
    void verifyToken();
  }, []);

  // Carrega la matriu de permisos per rol (només una vegada per sessió).
  useEffect(() => {
    if (cachedRolePermissions) {
      return;
    }
    let cancelled = false;
    void fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const value = data?.role_permissions;
        if (value && typeof value === "object") {
          cachedRolePermissions = value as Record<string, string[]>;
          if (!cancelled) {
            setRolePermissions(cachedRolePermissions);
          }
        }
      })
      .catch(() => {
        /* sense config no hi ha permisos de vista prèvia; no bloquegem la sessió */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persisteix cada canvi de vista "com".
  useEffect(() => {
    if (viewRole) {
      localStorage.setItem(VIEW_ROLE_KEY, viewRole);
    } else {
      localStorage.removeItem(VIEW_ROLE_KEY);
    }
  }, [viewRole]);

  const login = (newUser: User) => {
    setRawUser(newUser);
    setViewRole(null);
  };
  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* ignore */
    }
    setRawUser(null);
    setViewRole(null);
  };

  // Usuari efectiu: si l'admin "veu com" un altre rol, s'apliquen el rol i permisos d'aquell rol
  // i l'ADF activa passa a ser la seva (com a membre d'aquesta ADF).
  const user =
    rawUser && viewRole && viewRole !== "admin"
      ? {
          ...rawUser,
          role: viewRole,
          permissions: rolePermissions?.[viewRole] ?? [],
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
        loading,
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
