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
let cacheDelete: ReturnType<typeof vi.fn>;

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
  cacheDelete = vi.fn(() => Promise.resolve(true));
  vi.stubGlobal("caches", {
    keys: () => Promise.resolve(["api-data", "api-incidencies", "tiles-osm"]),
    delete: cacheDelete,
  });
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
    // La caché del service worker pot tenir incidències privades d'una sessió anterior.
    await waitFor(() => expect(cacheDelete).toHaveBeenCalledWith("api-incidencies"));
    expect(cacheDelete).toHaveBeenCalledWith("api-data");
    expect(cacheDelete).not.toHaveBeenCalledWith("tiles-osm");

    // El 401 no es reintenta (retry: false) i ningú més demana `/api/config`.
    expect(fetchCalls("/api/auth/me")).toBe(1);
    expect(fetchCalls("/api/config")).toBe(1);
  });

  it("el 401 inicial conserva les dades públiques i purga les privades", async () => {
    queryClient.setQueryData(queryKeys.adfs, [{ id: 278 }]);
    queryClient.setQueryData(queryKeys.hidrants(278, "anon"), [{ id: "h1" }]);
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    // La llista d'ADFs pot estar en vol: esborrar-la la tornaria a demanar.
    expect(queryClient.getQueryData(queryKeys.adfs)).toEqual([{ id: 278 }]);
    // Qualsevol resposta de dades pot contenir informació d'una sessió anterior.
    expect(queryClient.getQueryData(queryKeys.hidrants(278, "anon"))).toBeUndefined();
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
    queryClient.setQueryData(queryKeys.hidrants(278, "u1:admin"), [{ id: "h1" }]);
    cacheDelete.mockClear();
    fireEvent.click(screen.getByText("surt"));

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("cap"));
    expect(queryClient.getQueryData(queryKeys.session)).toBeNull();
    expect(queryClient.getQueryData(queryKeys.hidrants(278, "u1:admin"))).toBeUndefined();
    // Les dades públiques es queden a la caché i no es tornen a demanar.
    expect(queryClient.getQueryData(queryKeys.adfs)).toEqual([{ id: 278 }]);
    expect(queryClient.getQueryData(queryKeys.config)).toEqual(CONFIG);
    await waitFor(() => expect(cacheDelete).toHaveBeenCalledWith("api-data"));
    expect(fetchCalls("/api/auth/logout")).toBe(1);
    expect(fetchCalls("/api/config")).toBe(1);
  });
});
