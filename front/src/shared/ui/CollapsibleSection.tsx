import type { ReactNode } from "react";
import { useState } from "react";
import { Glyph } from "./Glyphs";

/**
 * Acordió únic de l'app (Informes, Configuració, seguiment, Telegram): mateixa
 * targeta blanca, vora forta, ombra de control i xebró que gira. Qualsevol
 * secció plegable nova ha de fer servir aquest component per no divergir.
 */
export function CollapsibleSection({
  title,
  icon,
  count,
  defaultOpen = false,
  open,
  onToggle,
  children,
}: {
  title: string;
  /** Icona monocroma opcional davant del títol. */
  icon?: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalOpen(v);
    }
  };
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex min-h-8 items-center justify-between gap-2 bg-white border border-border-strong rounded-lg shadow-control px-3 py-1 text-left cursor-pointer hover:bg-soft active:shadow-none"
      >
        <span className="flex items-center gap-2 text-base font-semibold text-ink leading-tight">
          {icon && <span className="shrink-0 text-primary">{icon}</span>}
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold leading-tight text-ink">
              {count}
            </span>
          )}
        </span>
        <Glyph
          name="chevron"
          size={15}
          strokeWidth={2.4}
          className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
      </button>
      {isOpen && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
