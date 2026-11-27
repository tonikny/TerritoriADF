import { useId } from "react";

const FLAME_PATH =
  "M12.4 1.8c.4 2.6 2 4.1 3.6 6.1 1.7 2.1 2.6 4.2 2.6 6.5A6.8 6.8 0 0 1 12 21.2a6.8 6.8 0 0 1-6.6-6.8c0-2.4 1-4.4 2.4-6.2.9-1.2 1.8-2.4 2.2-3.8.5 1.2 1 2 1.6 2.6.3-1.8 0-3.6-.2-5.2Z";
const CORE_PATH =
  "M12.2 9.6c.3 1.4 1.2 2.3 2 3.5.8 1.1 1.4 2.3 1.4 3.6a3.7 3.7 0 0 1-7.4 0c0-1.3.6-2.5 1.4-3.6.5-.7 1-1.4 1.2-2.2.3.7.6 1.1.9 1.4.2-1 0-2 .5-2.7Z";

/**
 * Spinner de càrrega de l'app: la flama de la marca batec (escala 0,86–1,14,
 * llum 10–62 % i ±1,4° de balanceig). Substitueix el text «Carregant...»; el
 * text es queda com a `aria-label` per als lectors de pantalla.
 *
 * El dibuix és SVG en línia (cap imatge ni llibreria) i només anima `transform`
 * i `opacity`, que el navegador pot compondre sense repintar. Amb
 * `prefers-reduced-motion` queda quieta (vegeu `.flame-spinner` a `styles/
 * index.css`). Els gradinets porten `useId()` perquè dues instàncies a la
 * mateixa pàgina no es trepitgin.
 */
export function FlameSpinner({
  size = 24,
  label = "Carregant",
  className,
}: {
  size?: number;
  /** Text per a lectors de pantalla; no es veu. */
  label?: string;
  className?: string;
}) {
  const id = useId();

  return (
    <span
      role="status"
      aria-label={label}
      className={className ? `flame-spinner ${className}` : "flame-spinner"}
      data-flame-spinner=""
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={`${id}-glow`} cx="50%" cy="62%" r="50%">
            <stop offset="0%" stopColor="var(--flame-hot)" stopOpacity="0.95" />
            <stop offset="50%" stopColor="var(--flame-mid)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--flame-mid)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-fire`} x1="50%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stopColor="var(--flame-deep)" />
            <stop offset="45%" stopColor="var(--flame-mid)" />
            <stop offset="100%" stopColor="var(--flame-hot)" />
          </linearGradient>
        </defs>
        <circle
          className="flame-spinner__glow"
          cx="12"
          cy="14"
          r="10.5"
          fill={`url(#${id}-glow)`}
        />
        <g className="flame-spinner__flame">
          <path fill={`url(#${id}-fire)`} d={FLAME_PATH} />
          <path fill="var(--flame-core)" opacity="0.9" d={CORE_PATH} />
        </g>
      </svg>
    </span>
  );
}
