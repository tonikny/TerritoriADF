import { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./shared/query/queryClient";
import { AdfProvider } from "./contexts/AdfContext";
import { AppConfigProvider } from "./contexts/AppConfigContext";
import { AuthProvider } from "./contexts/AuthContext";
import { MapPanel } from "./components/layout/MapPanel";
import { AccessSetup } from "./components/shared/AccessSetup";
import { PwaBanner } from "./components/shared/PwaBanner";
import { accessToken } from "./utils/route";

export default function App() {
  // Es llegeix una sola vegada: si l'URL és un enllaç d'accés, té pantalla pròpia.
  const [token] = useState(accessToken);

  return (
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider>
        {token ? (
          <AccessSetup token={token} />
        ) : (
          <AuthProvider>
            <AdfProvider>
              <MapPanel />
              <PwaBanner />
              <ToastContainer position="top-center" autoClose={3000} theme="colored" />
            </AdfProvider>
          </AuthProvider>
        )}
      </AppConfigProvider>
    </QueryClientProvider>
  );
}
