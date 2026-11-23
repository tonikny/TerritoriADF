// @vitest-environment jsdom
//
// Regressió: React StrictMode desmunta i remunta els efectes en desenvolupament.
// Si la queryFn de la llista consumeix l'AbortSignal, TanStack cancel·la la
// petició en quedar-se sense observers i en llança una altra en remuntar. La
// llista d'ADFs té una clau única i no depèn de l'ADF, així que ha de fer-ne una.
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Adf } from "@territoriadf/contracts/adfs";
import { AdfProvider, useAdf } from "./AdfContext";

const api = vi.hoisted(() => ({
  getAdfs: vi.fn(),
  getAdfBoundary: vi.fn(),
}));

const auth = vi.hoisted(() => ({ setActiveAdfId: vi.fn() }));

vi.mock("@/shared/api/adfs", () => api);
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: null, setActiveAdfId: auth.setActiveAdfId }),
}));

function adf(id: number, nom = `ADF ${id}`): Adf {
  return {
    id,
    nom,
    osm_relations: [],
    bbox: null,
    center: null,
    tracking_shared: false,
    created_at: null,
  };
}

function Probe() {
  const { adfs, activeAdf, refreshAdfs } = useAdf();
  return (
    <div>
      <span data-testid="active">{activeAdf?.id ?? "cap"}</span>
      <span data-testid="count">{adfs.length}</span>
      <button
        onClick={() => {
          void refreshAdfs();
        }}
      >
        refresh
      </button>
    </div>
  );
}

function renderProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdfProvider>
        <Probe />
      </AdfProvider>
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState({}, "", "/");
  vi.clearAllMocks();
});

describe("AdfProvider", () => {
  it("selecciona l'ADF de la URL i en carrega la frontera", async () => {
    history.replaceState({}, "", "/?adf=278");
    api.getAdfs.mockResolvedValue([adf(278, "Hostalets"), adf(279, "Vallbona")]);
    api.getAdfBoundary.mockResolvedValue(null);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("active").textContent).toBe("278"));
    expect(api.getAdfBoundary).toHaveBeenCalledWith(278, expect.anything());
    expect(document.title).toContain("ADF 278 Hostalets");
    expect(auth.setActiveAdfId).toHaveBeenCalledWith(278);
  });

  it("recupera l'ADF desada si la URL no en porta cap", async () => {
    localStorage.setItem("active_adf_id", "279");
    api.getAdfs.mockResolvedValue([adf(278), adf(279)]);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("active").textContent).toBe("279"));
  });

  it("refresca la llista amb refreshAdfs", async () => {
    api.getAdfs.mockResolvedValue([adf(278)]);

    renderProvider();
    await waitFor(() => expect(api.getAdfs).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() => expect(api.getAdfs).toHaveBeenCalledTimes(2));
  });
});

describe("AdfProvider sota StrictMode", () => {
  it("demana la llista una sola vegada encara que l'observer es remunti", async () => {
    let resolveAdfs!: (value: Adf[]) => void;
    api.getAdfs.mockReturnValue(
      new Promise<Adf[]>((resolve) => {
        resolveAdfs = resolve;
      }),
    );
    api.getAdfBoundary.mockResolvedValue(null);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });

    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <AdfProvider>
            <Probe />
          </AdfProvider>
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(api.getAdfs).toHaveBeenCalledTimes(1));
    resolveAdfs([]);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));
    expect(api.getAdfs).toHaveBeenCalledTimes(1);
  });
});
