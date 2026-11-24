import type { ReactNode } from "react";
import { useState } from "react";

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  open,
  onToggle,
  children,
}: {
  title: string;
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
    <div className="mb-4">
      <button
        onClick={() => setOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-transparent border-0 cursor-pointer p-0 m-0 text-[0.95rem] font-semibold text-ink"
      >
        <span>
          {title}
          {count !== undefined ? ` (${count})` : ""}
        </span>
        <span className="text-muted text-[0.8rem]">{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && <div className="mt-2">{children}</div>}
    </div>
  );
}
