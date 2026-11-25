/**
 * Exemple d'usuari de bot per a @BotFather. Telegram limita el nom d'usuari a
 * ~32 caràcters, així que es queda amb les dues primeres paraules de l'ADF i
 * retalla la segona si cal, sense deixar-ne un tros tallat a mitges.
 */
export function botUsernameExample(adf: { id: number; nom?: string }): string {
  const words = (adf.nom ?? "")
    .replace(/^ADF\s+/i, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  let slug = words.slice(0, 2).join("_");
  if (slug.length > 16) {
    slug = slug.slice(0, 16).replace(/_\w*$/, "");
  }
  return `adf_${adf.id}_${slug}_bot`;
}
