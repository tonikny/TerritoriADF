import { filledButtonClass } from "@/styles/uiStyles";

export function QuickStatusButtons({
  onOperative,
  onOutOfService,
}: {
  onOperative: () => void;
  onOutOfService: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOperative();
        }}
        className={`${filledButtonClass} bg-ok`}
      >
        ✅ Operatiu (Avui)
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOutOfService();
        }}
        className={`${filledButtonClass} bg-alert`}
      >
        ❌ Fora de servei (Avui)
      </button>
    </div>
  );
}
