import React, { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./Icons";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/** Camp de contrasenya amb botó d'ull per mostrar o amagar el text. */
export const PasswordInput: React.FC<Props> = ({ className = "", ...props }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full flex items-center">
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-8!`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Amaga la contrasenya" : "Mostra la contrasenya"}
        title={visible ? "Amaga la contrasenya" : "Mostra la contrasenya"}
        className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center bg-transparent border-0 p-1 cursor-pointer leading-none z-10"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
};
