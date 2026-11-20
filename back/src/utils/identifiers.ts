import { z } from "zod";

/**
 * Identificadors del domini: l'ID d'ADF (enter de 3 xifres) i el nom d'usuari
 * (`XXX/YYY` o `XXX/GI/YYY`).
 *
 * Les regles viuen aquí perquè la validació de la frontera (Zod/OpenAPI) i els
 * guards de `plugins/authorize.ts` facin servir exactament la mateixa definició,
 * i perquè els missatges surtin en català tant si valida l'esquema com el guard.
 */

export const ADF_ID_MIN = 1;
export const ADF_ID_MAX = 999;
export const ADF_ID_MESSAGE = "ID d'ADF no vàlid";

/**
 * ID d'ADF. `?adf=` i `:id` arriben com a text, així que es converteixen a
 * número i es limiten a 1..999 (els noms d'usuari comencen per aquest prefix).
 * El missatge es pot sobreescriure per mantenir el d'una ruta concreta.
 */
export function adfIdSchema(message: string = ADF_ID_MESSAGE) {
  return z.coerce.number(message).int(message).min(ADF_ID_MIN, message).max(ADF_ID_MAX, message);
}

/** `:id` d'ADF per a les rutes `/api/adfs/:id/...`. */
export const adfIdParamsSchema = z.object({
  id: adfIdSchema().describe("Número d'ADF (1-999)"),
});

export const USERNAME_RE = /^(\d{3})\/(GI\/)?(\d{3})$/;
export const USERNAME_MESSAGE =
  "El nom d'usuari ha de tenir el format XXX/YYY o XXX/GI/YYY (3 dígits cadascun)";

/** L'ADF d'un nom d'usuari és el prefix de 3 xifres (`279/GI/001` → 279). */
export function adfIdFromUsername(username: string): number {
  return Number(username.slice(0, 3));
}
