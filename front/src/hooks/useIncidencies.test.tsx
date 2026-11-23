// @vitest-environment jsdom
//
// Test de la cursa de N-08: canviar d'ADF mentre vola una petició d'incidències
// no ha de deixar a la pantalla les de l'ADF anterior. Es controla la resposta
// de `fetch` a mà per poder fer arribar la de l'ADF vella DESPRÉS de la nova,
// que és el pitjor cas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { IncidenciaFeature } from "../types";
import { useIncidencies } from "./useIncidencies";

const adfState = vi.hoisted(() => ({
  activeAdf: { id: 278, nom: "ADF 278" } as { id: number; nom: string } | null,
}));

vi.mock("../contexts/AdfContext", () => ({
  useAdf: () => ({ activeAdf: adfState.activeAdf }),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", role: "coordinador" } }),
}));

interface Deferred {
  promise: Promise<Response>;
  respond: (body: unknown) => void;
}

function deferred(): Deferred {
  let respond!: (body: unknown) => void;
  const promise = new Promise<Response>((resolve) => {
    respond = (body) =>
      resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
  });
  return { promise, respond };
}

let pending: Map<number, Deferred[]>;

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function feature(id: string): IncidenciaFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [2.3, 41.5] },
    properties: { id },
  } as unknown as IncidenciaFeature;
}

function waitForRequest(adfId: number) {
  return waitFor(() => expect(pending.get(adfId)).toHaveLength(1));
}

beforeEach(() => {
  pending = new Map();
  adfState.activeAdf = { id: 278, nom: "ADF 278" };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const adfId = Number(url.searchParams.get("adf"));
      const request = deferred();
      pending.set(adfId, [...(pending.get(adfId) ?? []), request]);
      return request.promise;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useIncidencies en canviar d'ADF", () => {
  it("no deixa que la resposta de l'ADF anterior trepitgi la de l'actual", async () => {
    const { result, rerender } = renderHook(() => useIncidencies(), {
      wrapper: createWrapper(),
    });

    await waitForRequest(278);

    // Canvi d'ADF amb la primera petició encara en vol.
    adfState.activeAdf = { id: 279, nom: "ADF 279" };
    rerender();
    await waitForRequest(279);

    // Arriba primer la resposta de l'ADF nova…
    pending.get(279)![0].respond({ features: [feature("279-a")] });
    await waitFor(() => {
      expect(result.current.features.map((f) => f.id)).toEqual(["279-a"]);
    });

    // …i després la de l'ADF anterior, que s'havia quedat penjada.
    pending.get(278)![0].respond({ features: [feature("278-a")] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // La resposta de l'ADF anterior no arriba a la vista: la clau de l'ADF
    // activa és una altra entrada de caché i només se'n llegeix aquesta.
    expect(result.current.features.map((f) => f.id)).toEqual(["279-a"]);
    expect(result.current.error).toBeNull();
  });
});
