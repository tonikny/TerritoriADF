import { storageKey } from "./storageKeys";

const KEY = storageKey("font_scale");

export const FONT_SCALES = [
  { label: "Petita", value: 0.9 },
  { label: "Normal", value: 1 },
  { label: "Gran", value: 1.15 },
  { label: "Molt gran", value: 1.3 },
];

export function getFontScale(): number {
  const n = Number(localStorage.getItem(KEY));
  return FONT_SCALES.some((s) => s.value === n) ? n : 1;
}

export function setFontScale(v: number) {
  localStorage.setItem(KEY, String(v));
  document.documentElement.style.fontSize = `${v * 100}%`;
}
