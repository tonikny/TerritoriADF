import type { PanelTab } from "@/components/layout/Panel";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { IncidenciaFeature } from "@territoriadf/contracts/incidencies";
import type { Position } from "@territoriadf/contracts/tracking";
import type { EngineId } from "@/map/core/types";
import type { EnginePreference } from "@/map/core/engineSelection";
import { MapaTab } from "@/features/adfs/MapaTab";
import { AjudaTab } from "./tabs/AjudaTab";
import {
  ConfigTab,
  InformesTab,
  OsmSyncPanel,
  SeguimentTab,
  TabBoundary,
  UsuarisTab,
} from "./LazyTabs";

export function buildTabs({
  features,
  incidenciaFeatures,
  positions,
  onSelectNode,
  onSelectIncidencia,
  onSelectHidrantById,
  onCenterCoordinates,
  engine,
  enginePreference,
  onEngineChange,
}: {
  features: HidrantFeature[];
  incidenciaFeatures: IncidenciaFeature[];
  positions: Record<string, Position>;
  onSelectNode?: (feature: HidrantFeature) => void;
  onSelectIncidencia?: (feature: IncidenciaFeature) => void;
  onSelectHidrantById?: (id: string) => void;
  onCenterCoordinates?: (coords: [number, number]) => void;
  engine?: EngineId;
  enginePreference?: EnginePreference;
  onEngineChange?: (preference: EnginePreference) => void;
}): PanelTab[] {
  return [
    {
      id: "mapa",
      icon: "🗺️",
      label: "ADF",
      // El panell d'OSM té frontera pròpia: la resta de la pestanya (selecció
      // d'ADF, resum, mapa offline) es pinta sense esperar el seu chunk.
      content: (
        <MapaTab
          osmSyncPanel={
            <TabBoundary>
              <OsmSyncPanel onSelectHidrant={onSelectHidrantById} />
            </TabBoundary>
          }
        />
      ),
    },
    {
      id: "seguiment",
      icon: "👣",
      label: "Seguiment",
      content: (
        <TabBoundary>
          <SeguimentTab positions={positions} onCenterCoordinates={onCenterCoordinates} />
        </TabBoundary>
      ),
    },
    {
      id: "informes",
      icon: "📃",
      label: "Informes",
      content: (
        <TabBoundary>
          <InformesTab
            features={features}
            incidenciaFeatures={incidenciaFeatures}
            onSelectNode={onSelectNode}
            onSelectIncidencia={onSelectIncidencia}
          />
        </TabBoundary>
      ),
    },
    {
      id: "usuaris",
      icon: "👤",
      label: "Usuaris",
      content: (
        <TabBoundary>
          <UsuarisTab />
        </TabBoundary>
      ),
    },
    {
      id: "config",
      icon: "⚙️",
      label: "Ajustos",
      content: (
        <TabBoundary>
          <ConfigTab
            engine={engine}
            enginePreference={enginePreference}
            onEngineChange={onEngineChange}
          />
        </TabBoundary>
      ),
    },
    { id: "ajuda", icon: "📖", label: "Ajuda", content: <AjudaTab /> },
  ];
}
