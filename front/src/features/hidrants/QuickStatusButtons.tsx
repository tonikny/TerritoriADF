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
        className="bg-[#27ae60] text-white border-0 rounded py-2 text-[0.8rem] cursor-pointer font-semibold"
      >
        ✅ Operatiu (Avui)
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOutOfService();
        }}
        className="bg-[#e74c3c] text-white border-0 rounded py-2 text-[0.8rem] cursor-pointer font-semibold"
      >
        ❌ Fora de servei (Avui)
      </button>
    </div>
  );
}
