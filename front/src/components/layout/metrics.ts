export const HANDLE_H = 16;
export const ICONS_H = 44;
export const BAR_HEIGHT = HANDLE_H + ICONS_H;

/**
 * Alçada real de la barra tancada amb pestanyes: el handle (16 px fixos) més
 * `min-h-11` de la TabBar, que creix amb «Mida de text». Ha de coincidir amb
 * `--sheet-bar-h` d'`index.css`.
 */
export function tabBarHeight(): number {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round(HANDLE_H + (ICONS_H * root) / 16);
}
