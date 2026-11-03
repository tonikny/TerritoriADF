import React, { useState } from "react";
import { useAuth, type LoginResponse } from "../../contexts/AuthContext";
import { toast } from "react-toastify";
import { inputClass, primaryButtonClass } from "../../styles/uiStyles";
import { PasswordInput } from "./PasswordInput";

export const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = (await response.json()) as LoginResponse | { error?: string };

      if (response.ok && "user" in data) {
        login(data.user);
        toast.success(`Benvingut, ${data.user.username}`);
      } else {
        toast.error(("error" in data && data.error) || "Error en el login");
      }
    } catch {
      toast.error("No es pot connectar amb el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-2.5">
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="flex flex-col gap-3.75"
      >
        <h2 className="text-center m-0 mb-2.5 text-[1.2rem]">Accés Hidrants</h2>

        <div className="flex flex-col gap-1.25">
          <label htmlFor="username" className="text-[0.9rem] font-semibold">
            Usuari
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className={`${inputClass} p-2!`}
          />
        </div>

        <div className="flex flex-col gap-1.25">
          <label htmlFor="password" className="text-[0.9rem] font-semibold">
            Contrasenya
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={`${inputClass} p-2!`}
          />
        </div>

        <button type="submit" disabled={loading} className={`${primaryButtonClass} mt-2.5`}>
          {loading ? "Entrant..." : "Inicia sessió"}
        </button>
      </form>
    </div>
  );
};
