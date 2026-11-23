import { NodeInfo } from "@/components/hidrants/NodeInfo";
import { IncidenciaInfo } from "@/components/incidencies/IncidenciaInfo";
import { CreateNodePanel } from "@/components/panel/CreateNodePanel";
import { createTitle } from "@/components/panel/createTitle";
import type { useMapSheet } from "@/hooks/map/useMapSheet";
import { emojiPrioritatIncidencia } from "@/utils/incidenciaConstants";

import type { PanelNode } from "./types";

/**
 * Contingut del bottomsheet segons què estigui obert: hidrant, incidència o
 * creació. És una funció i no un component perquè `Panel` espera una
 * descripció (`PanelNode`) i no un element.
 */
export function buildNodeSheet({
  sheet,
  canEdit,
  hasUser,
  hasLocation,
  nodeInfoKey,
  showRoute,
  setShowRoute,
  refreshHidrants,
  refreshIncidencies,
}: {
  sheet: ReturnType<typeof useMapSheet>;
  canEdit: boolean;
  hasUser: boolean;
  hasLocation: boolean;
  nodeInfoKey: number;
  showRoute: boolean;
  setShowRoute: (value: boolean) => void;
  refreshHidrants: () => Promise<void>;
  refreshIncidencies: () => void | Promise<void>;
}): PanelNode | null {
  const { selectedNode, selectedIncidencia, editing, creation, close } = sheet;

  if (selectedNode) {
    return {
      id: selectedNode.id,
      content: (
        <NodeInfo
          key={nodeInfoKey}
          feature={selectedNode}
          canEdit={canEdit}
          editing={editing}
          setEditing={sheet.setEditing}
          draftPosition={sheet.draftPosition}
          setDraftPosition={sheet.setDraftPosition}
          refreshHidrants={refreshHidrants}
          showRoute={showRoute}
          setShowRoute={setShowRoute}
          hasLocation={hasLocation}
        />
      ),
      onClose: close,
      onEdit: canEdit ? sheet.toggleEditing : undefined,
      editing,
    };
  }

  if (selectedIncidencia) {
    return {
      id: selectedIncidencia.id,
      title: `${emojiPrioritatIncidencia(selectedIncidencia.properties.prioritat)} ${selectedIncidencia.properties.titol}`,
      content: (
        <IncidenciaInfo
          key={selectedIncidencia.id}
          incidencia={selectedIncidencia}
          canEdit={canEdit}
          editing={editing}
          setEditing={sheet.setEditing}
          showRoute={showRoute}
          setShowRoute={setShowRoute}
          refreshIncidencies={() => {
            void refreshIncidencies();
          }}
          hasLocation={hasLocation}
        />
      ),
      onClose: close,
      onEdit: canEdit ? sheet.toggleEditing : undefined,
      editing,
    };
  }

  if (creation.position && creation.form && hasUser) {
    return {
      id: "create",
      title: createTitle(creation.form),
      content: (
        <CreateNodePanel
          form={creation.form}
          position={creation.position}
          setForm={creation.setForm}
          onClose={close}
          setNewNodePosition={creation.setPosition}
          refreshHidrants={() => {
            void refreshHidrants();
          }}
          refreshIncidencies={() => {
            void refreshIncidencies();
          }}
        />
      ),
      onClose: close,
    };
  }

  return null;
}
