import { lazy, Suspense, type ReactNode } from "react";

/**
 * Pestanyes carregades sota demanda. Només `MapaTab` (la pestanya per defecte)
 * viatja al bundle inicial; `InformesTab` arrossega les llistes, `ConfigTab` el
 * panell de Telegram i `OsmSyncPanel` tot el flux d'OSM, que qui obre el mapa al
 * camp potser no farà servir mai.
 *
 * Els mòduls exporten noms, no `default`; per això el `.then()` en comptes de
 * canviar l'export de cada feature (trencaria la frontera d'importació).
 * Viuen en aquest fitxer, i no a `PanelTabs.tsx`, perquè `react-refresh` només
 * admet fitxers que exportin components.
 */
export const OsmSyncPanel = lazy(() =>
  import("@/features/osm/OsmSyncPanel").then((m) => ({ default: m.OsmSyncPanel })),
);
export const SeguimentTab = lazy(() =>
  import("@/features/tracking/SeguimentTab").then((m) => ({ default: m.SeguimentTab })),
);
export const InformesTab = lazy(() =>
  import("./tabs/InformesTab").then((m) => ({ default: m.InformesTab })),
);
export const UsuarisTab = lazy(() =>
  import("@/features/users/UsuarisTab").then((m) => ({ default: m.UsuarisTab })),
);
export const ConfigTab = lazy(() =>
  import("./tabs/ConfigTab").then((m) => ({ default: m.ConfigTab })),
);

/**
 * Frontera per pestanya: una pestanya lenta no buida les altres. El fallback
 * ocupa el mateix espai que el contingut (el contenidor del panell i del
 * bottomsheet tenen alçada fixa), així que no hi ha salt de disposició.
 */
export function TabBoundary({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-4 text-center text-muted text-sm">Carregant...</div>}>
      {children}
    </Suspense>
  );
}
