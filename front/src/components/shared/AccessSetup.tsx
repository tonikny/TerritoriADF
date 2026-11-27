import React, { useEffect, useState } from "react";

import { apiErrorMessage, request } from "@/shared/api/client";
import { inputClass, primaryButtonClass } from "@/styles/uiStyles";
import { PasswordInput } from "@/shared/ui/PasswordInput";
import { enterApp } from "@/utils/route";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { APP_NAME } from "@/utils/appInfo";

/**
 * Pantalla d'un enllaç d'accés (/acces/<token>): l'usuari hi tria la seva contrasenya.
 * Es mostra fora de l'aplicació (sense sessió); en desar-la, el backend ja deixa la
 * sessió oberta i es recarrega l'app.
 */
export const AccessSetup: React.FC<{ token: string }> = ({ token }) => {
  // Longitud mínima definida al backend (GET /api/config); aquí només per a l'atribut `minLength`.
  const { minPasswordLength } = useAppConfig();
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await request<{ username: string }>(`/api/auth/access/${token}`);
        if (!cancelled) {
          setUsername(data.username);
        }
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, "No es pot connectar amb el servidor"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) {
      return;
    }
    if (password !== repeat) {
      setError("Les contrasenyes no coincideixen");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await request<unknown>(`/api/auth/access/${token}`, {
        method: "POST",
        body: { password },
      });
      enterApp();
    } catch (err) {
      setError(apiErrorMessage(err, "No es pot connectar amb el servidor"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-soft font-sans">
      <form
        onSubmit={(e) => {
          void submit(e);
        }}
        className="w-full max-w-[340px] bg-white border border-border rounded-lg p-4 shadow-panel"
      >
        <h1 className="m-0 mb-1 text-lg text-center">{APP_NAME}</h1>
        <p className="m-0 mb-3 text-center text-muted text-sm">
          {username ? `Tria la contrasenya per a ${username}` : "Enllaç d'accés"}
        </p>

        {username && (
          <>
            <label className="block text-sm text-muted mb-2">
              Contrasenya nova:
              <PasswordInput
                autoComplete="new-password"
                minLength={minPasswordLength}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} bg-white`}
                required
              />
            </label>
            <label className="block text-sm text-muted mb-2">
              Repeteix la contrasenya:
              <PasswordInput
                autoComplete="new-password"
                minLength={minPasswordLength}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                className={`${inputClass} bg-white`}
                required
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className={`${primaryButtonClass} w-full mt-1 disabled:opacity-70`}
            >
              {saving ? "Guardant..." : "Desa i entra"}
            </button>
            <p className="m-0 mt-3 text-muted text-sm text-center">
              Aquest enllaç només es pot fer servir un cop.
            </p>
          </>
        )}

        {error && <p className="m-0 mt-3 text-alert text-sm">{error}</p>}
      </form>
    </div>
  );
};
