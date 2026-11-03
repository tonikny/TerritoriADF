/** Longitud mínima de contrasenya (enllaç d'accés, canvi propi i `create:user`). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Context opcional per rebutjar contrasenyes fetes amb dades públiques de l'usuari.
 * Les dades del formulari no es poden duplicar al front, així que la comprovació viu aquí.
 */
export interface PasswordContext {
  username?: string | null;
  adfNom?: string | null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Paraules del nom de l'ADF que val la pena bloquejar ("ADF Vallbona" → "vallbona"). */
function adfWords(adfNom: string | null | undefined): string[] {
  if (!adfNom) {
    return [];
  }
  return normalize(adfNom)
    .replace(/^adf\s*/, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 5);
}

/**
 * Retorna el motiu pel qual la contrasenya no és acceptable, o null si ho és.
 * El missatge és el que es mostra a l'usuari, per això va en català.
 */
export function passwordProblem(
  password: unknown,
  label = "La contrasenya",
  context: PasswordContext = {},
): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `${label} ha de tenir com a mínim ${MIN_PASSWORD_LENGTH} caràcters`;
  }
  if (/^(.)\1+$/u.test(password)) {
    return `${label} no pot ser el mateix caràcter repetit.`;
  }
  // Sense xifres (o sense lletres) la força cau molt, i és fàcil d'explicar al voluntari.
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    return `${label} ha de combinar lletres i xifres.`;
  }

  const normalized = normalize(password);

  // El nom d'usuari i el de l'ADF són públics (surten a la interfície i a OSM).
  const reserved = [context.username, ...adfWords(context.adfNom)]
    .map((word) => (word ? normalize(word) : ""))
    .filter((word) => word.length >= 5);

  if (reserved.some((word) => normalized.includes(word))) {
    return `${label} no pot contenir el nom d'usuari ni el de l'ADF.`;
  }

  return null;
}
