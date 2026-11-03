import { useEffect, useState } from "react";

// Es demana una sola vegada per sessió i només es cacheja si la resposta és vàlida
// (si falla, el següent muntatge ho tornarà a intentar).
let cachedMaxHydrantMoveMeters: number | null = null;
let cachedMinPasswordLength: number | null = null;

/** Valor de reserva mentre `/api/config` no ha arribat: el backend és qui valida de veritat. */
const DEFAULT_MIN_PASSWORD_LENGTH = 8;

/**
 * Configuració pública del backend (GET /api/config). El límit de moviment d'un hidrant es defineix
 * només al backend; mentre no s'hagi carregat (o si falla) és `null` i no es permet arrossegar.
 * El mínim de contrasenya també ve d'allà (`back/src/utils/password.ts`); aquí només s'usa per a
 * l'atribut `minLength` dels formularis.
 */
export function useAppConfig() {
  const [maxHydrantMoveMeters, setMaxHydrantMoveMeters] = useState<number | null>(
    cachedMaxHydrantMoveMeters,
  );
  const [minPasswordLength, setMinPasswordLength] = useState<number>(
    cachedMinPasswordLength ?? DEFAULT_MIN_PASSWORD_LENGTH,
  );

  useEffect(() => {
    if (cachedMaxHydrantMoveMeters !== null && cachedMinPasswordLength !== null) {
      return;
    }
    let cancelled = false;
    void fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const maxMeters = data?.max_hydrant_move_meters;
        if (typeof maxMeters === "number" && maxMeters > 0) {
          cachedMaxHydrantMoveMeters = maxMeters;
          if (!cancelled) {
            setMaxHydrantMoveMeters(maxMeters);
          }
        }
        const minLength = data?.min_password_length;
        if (typeof minLength === "number" && minLength > 0) {
          cachedMinPasswordLength = minLength;
          if (!cancelled) {
            setMinPasswordLength(minLength);
          }
        }
      })
      .catch(() => {
        /* sense configuració: no es permet arrossegar i es manté el mínim de reserva */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { maxHydrantMoveMeters, minPasswordLength };
}
