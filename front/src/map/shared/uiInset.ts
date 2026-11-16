/**
 * Alçada del bottomsheet en píxels. A escriptori l'element existeix però té
 * `display:none` (tb:hidden), així que el rectangle fa 0 i no cal cap media query.
 */
export function getBottomSheetInset(): number {
  const element = document.querySelector<HTMLElement>("[data-bottom-sheet]");
  if (!element) {
    return 0;
  }
  const rect = element.getBoundingClientRect();
  return rect.height > 0 ? Math.round(rect.height) : 0;
}
