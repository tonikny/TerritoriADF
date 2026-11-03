import { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AdfProvider } from "./contexts/AdfContext";
import { AuthProvider } from "./contexts/AuthContext";
import { MapPanel } from "./components/layout/MapPanel";
import { AccessSetup } from "./components/shared/AccessSetup";
import { accessToken } from "./utils/route";

export default function App() {
  // Es llegeix una sola vegada: si l'URL és un enllaç d'accés, té pantalla pròpia.
  const [token] = useState(accessToken);

  if (token) {
    return <AccessSetup token={token} />;
  }

  return (
    <AuthProvider>
      <AdfProvider>
        <MapPanel />
        <ToastContainer position="top-center" autoClose={3000} theme="colored" />
      </AdfProvider>
    </AuthProvider>
  );
}
