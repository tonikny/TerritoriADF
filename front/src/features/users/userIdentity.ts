// L'`username` és l'única clau que veu l'ADF i té la forma `278/001` o
// `278/GI/001`. Aquestes funcions són pures perquè el formulari d'alta i el
// d'edició no divergeixin; el backend valida la mateixa forma.

const pad3 = (n: number) => String(n).padStart(3, "0");

/** Prefix visible del formulari: `278/` o `278/GI/`. */
export function prefixFor(adfId: number, gi: boolean): string {
  return `${pad3(adfId)}/${gi ? "GI/" : ""}`;
}

/** Número de tres xifres, ajustat al rang 1–999 com fa el camp del formulari. */
export function clampNumero(value: string): string {
  return pad3(Math.min(Math.max(Number(value) || 0, 1), 999));
}

export function buildUsername(adfId: number, gi: boolean, numero: string): string {
  return `${prefixFor(adfId, gi)}${clampNumero(numero)}`;
}

/** `278/GI/001` → `{ numero: "001", gi: true }`; si no encaixa, camps buits. */
export function parseUsername(username: string): { numero: string; gi: boolean } {
  const match = /^(\d{3})\/(?:GI\/)?(\d{3})$/.exec(username);
  return { numero: match?.[2] ?? "", gi: username.includes("/GI/") };
}
