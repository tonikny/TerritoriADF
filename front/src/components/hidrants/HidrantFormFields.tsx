import React from "react";
import { inputClass, selectClass } from "@/styles/uiStyles";
import type { HidrantUiFields } from "@territoriadf/contracts/hidrants";

interface HidrantFormFieldsProps {
  data: HidrantUiFields;
  onChange: (newData: HidrantUiFields) => void;
  showSurveyDateAndStatus: boolean;
}

export const HidrantFormFields: React.FC<HidrantFormFieldsProps> = ({
  data,
  onChange,
  showSurveyDateAndStatus,
}) => {
  const currentDiameters = data.diameters ? data.diameters.split(";") : [];
  const numCouplings = Number(data.couplings) || 0;

  // Assegurar que tenim prou diàmetres segons el nombre de couplings
  while (currentDiameters.length < numCouplings) {
    currentDiameters.push("");
  }

  const handleFieldChange = (field: keyof HidrantUiFields, value: string) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      {/* Estat i Data de revisió (Només en edició) */}
      {showSurveyDateAndStatus && (
        <div className="flex gap-2">
          <label className="flex-1 text-xs italic">
            Estat:
            <select
              value={data.estat}
              onChange={(e) => handleFieldChange("estat", e.target.value)}
              className={selectClass}
            >
              <option value="Operatiu">Operatiu</option>
              <option value="Fora de servei">Fora de servei</option>
            </select>
          </label>
          <label className="flex-1 text-xs italic">
            Data revisió:
            <input
              type="date"
              value={data.surveyDate}
              onChange={(e) => handleFieldChange("surveyDate", e.target.value)}
              className={`${inputClass} p-0.5!`}
            />
          </label>
        </div>
      )}

      {/* Tipus - Posició */}
      <div className="flex gap-2">
        <label className="flex-1 text-xs italic">
          Tipus:
          <select
            value={data.type}
            onChange={(e) => handleFieldChange("type", e.target.value)}
            className={selectClass}
          >
            <option value=""></option>
            <option value="pillar">Columna</option>
            <option value="underground">Subterrani</option>
          </select>
        </label>
        <label className="flex-1 text-xs italic">
          Posició:
          <select
            value={data.position}
            onChange={(e) => handleFieldChange("position", e.target.value)}
            className={selectClass}
          >
            <option value=""></option>
            <option value="lane">Calçada</option>
            <option value="sidewalk">Vorera</option>
            <option value="green">Verd</option>
          </select>
        </label>
      </div>

      {/* Acoblaments - Pressió */}
      <div className="flex gap-2">
        <label className="flex-1 text-xs italic">
          Acoblaments:
          <select
            value={data.couplings}
            onChange={(e) => handleFieldChange("couplings", e.target.value)}
            className={selectClass}
          >
            <option value=""></option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
        <label className="flex-1 text-xs italic">
          Pressió (bar):
          <input
            type="text"
            inputMode="decimal"
            value={data.pressure}
            onChange={(e) => handleFieldChange("pressure", e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {/* Diàmetres dinàmics */}
      {numCouplings > 0 && (
        <label className="text-xs italic">
          Diàmetre{numCouplings > 1 ? "s" : ""} (mm):
          <div className="flex flex-wrap gap-1.2 mt-0.8">
            {Array.from({ length: numCouplings }, (_, i) => (
              <select
                key={i}
                value={currentDiameters[i] || ""}
                onChange={(e) => {
                  const nd = [...currentDiameters];
                  nd[i] = e.target.value;
                  handleFieldChange("diameters", nd.join(";"));
                }}
                className={`${selectClass} flex-[1_1_30%]`}
              >
                <option value=""></option>
                <option value="45">45</option>
                <option value="70">70</option>
                <option value="100">100</option>
              </select>
            ))}
          </div>
        </label>
      )}

      {/* Carrer */}
      <label className="text-xs italic">
        Carrer:
        <input
          type="text"
          value={data.street}
          onChange={(e) => handleFieldChange("street", e.target.value)}
          className={inputClass}
        />
      </label>

      {/* Número i Barri/Urbanització */}
      <div className="flex gap-2">
        <label className="flex-1 text-xs italic">
          Núm:
          <input
            type="text"
            value={data.num}
            onChange={(e) => handleFieldChange("num", e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex-[2] text-xs italic">
          Barri/Urbanització:
          <input
            type="text"
            value={data.barri}
            onChange={(e) => handleFieldChange("barri", e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
    </div>
  );
};
