// @vitest-environment jsdom
//
// Flux de sessió: la consulta ["session"] és l'única font de l'usuari, login i
// logout escriuen a la mateixa entrada de caché que llegeix la consulta, i
// `/api/config` es demana una sola vegada encara que hi hagi dos consumidors
// (el provider i l'AuthContext).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { AppConfig } from "@territoriadf/contracts/config";
import type { SessionUser } from "@territoriadf/contracts/users";

import { queryKeys } from "@/shared/query/keys";
import { queryClient } from "@/shared/query/queryClient";

import { AppConfigProvider } from "./AppConfigContext";
import { AuthProvider, useAuth } from "./AuthContext";

const CONFIG: AppConfig = {
  max_hydrant_move_meters: 25,
  min_password_length: 12,
  role_permissions: { admin: [], coordinador: [], voluntari: [] },
};

const USER: SessionUser = {
  id: "u1",
  username: "278/GI/001",
  adf_id: 278,
  role: "admin",
  mqtt_enabled: false,
  permissions: [],
};

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchCalls(path: string): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes(path)).length;
}

function Probe() {
  const { user, loading, login, logout } = useAuth();
  return (
    <>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? `${user.username}:${user.role}` : "cap"}</span>
      <button onClick={() => login(USER)}>entra</button>
      <button onClick={logout}>surt</button>
    </>
  );
}

function renderAuth() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </AppConfigProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/config")) {
      return json(CONFIG);
    }
    if (url.includes("/api/auth/me")) {
      return json({ error: "No autenticat" }, 401);
    }
    if (url.includes("/api/auth/logout")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Petició no esperada: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("AuthProvider", () => {
  it("resol el 401 com a sessió buida i demana la configuració una sola vegada", async () => {
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("cap");
    expect(queryClient.getQueryData(queryKeys.session)).toBeNull();
    await waitFor(() => expect(queryClient.getQueryData(queryKeys.config)).toEqual(CONFIG));

    // El 401 no es reintenta (retry: false) i ningú més demana `/api/config`.
    expect(fetchCalls("/api/auth/me")).toBe(1);
    expect(fetchCalls("/api/config")).toBe(1);
  });

  it("el 401 inicial no esborra dades públiques que ja són a la caché", async () => {
    queryClient.setQueryData(queryKeys.adfs, [{ id: 278 }]);
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    // Sense usuari previ no hi ha res de privat a purgar; esborrar-ho faria
    // que la llista d'ADFs es tornés a demanar just en carregar.
    expect(queryClient.getQueryData(queryKeys.adfs)).toEqual([{ id: 278 }]);
  });

  it("el login escriu la sessió a la caché sense tornar a demanar /auth/me", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("cap"));

    fireEvent.click(screen.getByText("entra"));

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("278/GI/001:admin"));
    expect(queryClient.getQueryData(queryKeys.session)).toEqual({ user: USER });
    expect(fetchCalls("/api/auth/me")).toBe(1);
    expect(fetchCalls("/api/config")).toBe(1);
  });

  it("el logout buida la sessió i les dades, però conserva la configuració", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("cap"));
    fireEvent.click(screen.getByText("entra"));
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("278/GI/001:admin"));

    // Dades d'API de l'usuari que no han de sobreviure al tancament de sessió.
    queryClient.setQueryData(queryKeys.adfs, [{ id: 278 }]);
    fireEvent.click(screen.getByText("surt"));

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("cap"));
    expect(queryClient.getQueryData(queryKeys.session)).toBeNull();
    await waitFor(() => expect(queryClient.getQueryData(queryKeys.adfs)).toBeUndefined());
    // La configuració és pública: es queda a la caché i no es torna a demanar.
    expect(queryClient.getQueryData(queryKeys.config)).toEqual(CONFIG);
    expect(fetchCalls("/api/auth/logout")).toBe(1);
    expect(fetchCalls("/api/config")).toBe(1);
  });
});
