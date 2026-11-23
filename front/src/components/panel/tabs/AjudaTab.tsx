import {
  hidrant_op_rev,
  hidrant_op_nrev,
  hidrant_nop_rev,
  hidrant_nop_nrev,
  hidrant_no_info,
} from "@/utils/icons";

export function AjudaTab() {
  const currentYear = new Date().getFullYear();
  const itemClass = "flex items-center gap-3.75 mb-2.5";
  const imgClass = "w-6.25 h-10.25 object-contain";

  return (
    <div className="p-4">
      <h3 className="m-0 mb-3 text-[0.95rem] font-semibold">Llegenda</h3>
      <h4 className="mt-0 mb-2 text-[0.85rem]">Hidrants</h4>
      <div className={itemClass}>
        <img src={hidrant_op_rev} alt="Verd" className={imgClass} />
        <span className="text-[0.85rem]">Operatiu (revisat {currentYear})</span>
      </div>
      <div className={itemClass}>
        <img src={hidrant_op_nrev} alt="Verd apagat" className={imgClass} />
        <span className="text-[0.85rem]">Operatiu (no revisat {currentYear})</span>
      </div>
      <div className={itemClass}>
        <img src={hidrant_nop_rev} alt="Vermell" className={imgClass} />
        <span className="text-[0.85rem]">Fora de servei (revisat {currentYear})</span>
      </div>
      <div className={itemClass}>
        <img src={hidrant_nop_nrev} alt="Vermell apagat" className={imgClass} />
        <span className="text-[0.85rem]">Fora de servei (no revisat {currentYear})</span>
      </div>
      <div className={itemClass}>
        <img src={hidrant_no_info} alt="Negre" className={imgClass} />
        <span className="text-[0.85rem]">Sense data de revisió coneguda</span>
      </div>
    </div>
  );
}
