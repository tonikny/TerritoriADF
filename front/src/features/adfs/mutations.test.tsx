// @vitest-environment jsdom
//
// Les mutacions d'ADF han de mantenir la llista de la caché amb la resposta del
// servidor. El punt clau: crear o editar una ADF no pot tornar a demanar
// `GET /api/adfs` (abans es feia un GET a la mutació i un altre al recalcul).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Adf } from "@territoriadf/contracts/adfs";
import { queryKeys } from "@/shared/query/keys";
import { useAdfMutations } from "./mutations";

const api = vi.hoisted(() => ({
  createAdf: vi.fn(),
  updateAdf: vi.fn(),
  deleteAdf: vi.fn(),
  recalculateAdfBoundaries: vi.fn(),
  getAdfs: vi.fn(),
}));

// Les escriptures són de la feature i la llista, de la closca: es mocken totes
// dues perquè les assercions de «no tornar a demanar la llista» segueixin
// vigilant el codi real.
vi.mock("./api", () => ({
  createAdf: api.createAdf,
  updateAdf: api.updateAdf,
  deleteAdf: api.deleteAdf,
  recalculateAdfBoundaries: api.recalculateAdfBoundaries,
}));
vi.mock("@/shared/api/adfs", () => ({ getAdfs: api.getAdfs }));

function adf(id: number, nom = `ADF ${id}`): Adf {
  return {
    id,
    nom,
    osm_relations: [`R${id}`],
    bbox: null,
    center: null,
    tracking_shared: false,
    created_at: null,
  };
}

function setup(initial: Adf[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(queryKeys.adfs, initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useAdfMutations(), { wrapper });
  return { client, result };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useAdfMutations", () => {
  it("afegeix l'ADF creada a la caché sense tornar a demanar la llista", async () => {
    const created = adf(901, "Nova ADF");
    api.createAdf.mockResolvedValue(created);
    const { client, result } = setup([adf(1)]);

    await act(async () => {
      await result.current.create.mutateAsync({
        id: 901,
        nom: "Nova ADF",
        osm_relations: ["R901"],
      });
    });

    expect(client.getQueryData<Adf[]>(queryKeys.adfs)).toEqual([adf(1), created]);
    expect(api.getAdfs).not.toHaveBeenCalled();
  });

  it("substitueix l'ADF editada a la caché sense tornar a demanar la llista", async () => {
    const updated = adf(1, "Canviada");
    api.updateAdf.mockResolvedValue(updated);
    const { client, result } = setup([adf(1), adf(2)]);

    await act(async () => {
      await result.current.update.mutateAsync({
        adfId: 1,
        input: { nom: "Canviada", osm_relations: ["R1"] },
      });
    });

    expect(client.getQueryData<Adf[]>(queryKeys.adfs)).toEqual([updated, adf(2)]);
    expect(api.getAdfs).not.toHaveBeenCalled();
  });

  it("en recalcular només actualitza bbox/center i retorna l'ADF de la caché", async () => {
    api.recalculateAdfBoundaries.mockResolvedValue({
      success: true,
      adf_id: 1,
      bbox: [41, 1, 42, 2],
      center: [41.5, 1.5],
    });
    const { client, result } = setup([adf(1)]);
    let returned: Adf | null = null;

    await act(async () => {
      returned = await result.current.recalculate.mutateAsync(1);
    });

    expect(returned).toMatchObject({ bbox: [41, 1, 42, 2], center: [41.5, 1.5] });
    expect(client.getQueryData<Adf[]>(queryKeys.adfs)?.[0]).toMatchObject({
      bbox: [41, 1, 42, 2],
      center: [41.5, 1.5],
    });
    expect(api.getAdfs).not.toHaveBeenCalled();
  });

  it("treu l'ADF eliminada de la caché", async () => {
    api.deleteAdf.mockResolvedValue(undefined);
    const { client, result } = setup([adf(1), adf(2)]);

    await act(async () => {
      await result.current.remove.mutateAsync(1);
    });

    expect(client.getQueryData<Adf[]>(queryKeys.adfs)).toEqual([adf(2)]);
  });
});
