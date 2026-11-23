// Canvi de contrasenya del propi usuari. La resta de rutes d'autenticació
// (login/logout/me) les fa servir `AuthContext` directament perquè han de veure
// sempre la sessió real, sense capçaleres de «veure com».
import { request } from "./client";

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await request<unknown>("/api/auth/password", { method: "PUT", body: input });
}
