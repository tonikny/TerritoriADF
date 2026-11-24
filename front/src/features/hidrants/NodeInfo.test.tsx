// @vitest-environment jsdom
//
// Regressió: cancel·lar l'edició d'un hidrant ha de descartar l'esborrany. El
// panell no es desmunta en sortir del mode edició, així que l'estat del
// formulari s'ha de ressembrar des del backend; si no, en tornar a entrar-hi es
// veuen els valors descartats i l'avís de canvis sense desar surt de seguida.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";

import { NodeInfo } from "./NodeInfo";

const preventLeave = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/usePreventLeave", () => ({ usePreventLeave: preventLeave }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

vi.mock("@/contexts/AdfContext", () => ({ useAdf: () => ({ activeAdf: null }) }));

vi.mock("./useHidrantActions", () => ({
  useHidrantActions: () => ({
    busy: false,
    save: vi.fn(),
    quickStatus: vi.fn(),
    remove: vi.fn(),
  }),
}));

// La vista de només lectura no forma part d'aquest test: només cal poder tornar
// al mode edició des del harness.
vi.mock("./HidrantInfoView", () => ({
  HidrantInfoView: () => <div>vista</div>,
}));

const FEATURE: HidrantFeature = {
  type: "Feature",
  id: "h1",
  geometry: { type: "Point", coordinates: [1.8, 42.1] },
  properties: {
    id: "h1",
    osm_id: null,
    osm_tags: {},
    ui_fields: {
      type: "pillar",
      position: "lane",
      couplings: "2",
      diameters: "45;70",
      pressure: "5",
      street: "Carrer Major",
      num: "3",
      barri: "Centre",
      estat: "Operatiu",
      surveyDate: "2026-01-01",
    },
    service_tags: { observacions: "Clau al veí" },
    sync_status: "SYNCED",
    sync_error: null,
    synced_at: null,
    remote_osm_tags: null,
    remote_lat: null,
    remote_lon: null,
    updated_at: null,
  },
};

/** Reproducció del pare real (`MapPanel`): `editing` viu fora del formulari. */
function Harness() {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setEditing(true)}>
        obrir-edicio
      </button>
      <NodeInfo feature={FEATURE} canEdit editing={editing} setEditing={setEditing} />
    </>
  );
}

function streetInput(): HTMLInputElement {
  return screen.getByLabelText(/Carrer/) as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NodeInfo", () => {
  it("cancel·lar l'edició descarta l'esborrany i no queda cap canvi pendent", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness />);

    fireEvent.click(screen.getByText("obrir-edicio"));
    fireEvent.change(streetInput(), { target: { value: "Carrer Descartat" } });
    expect(streetInput().value).toBe("Carrer Descartat");

    fireEvent.click(screen.getByText("Cancel·lar"));
    expect(window.confirm).toHaveBeenCalledTimes(1);

    // En tornar a entrar, el formulari parteix de les dades del backend.
    fireEvent.click(screen.getByText("obrir-edicio"));
    expect(streetInput().value).toBe("Carrer Major");

    // I com que no hi ha esborrany, sortir no ha de demanar confirmació.
    fireEvent.click(screen.getByText("Cancel·lar"));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(preventLeave).toHaveBeenLastCalledWith(false);
  });
});
