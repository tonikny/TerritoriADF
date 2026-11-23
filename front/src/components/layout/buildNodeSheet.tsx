import { NodeInfo } from "@/components/hidrants/NodeInfo";
import { IncidenciaInfo } from "@/components/incidencies/IncidenciaInfo";
import { CreateNodePanel } from "@/components/panel/CreateNodePanel";
import { createTitle } from "@/components/panel/createTitle";
import type { useMapCreation } from "@/hooks/map/useMapCreation";
import type { useMapSelection } from "@/hooks/map/useMapSelection";
import { emojiPrioritatIncidencia } from "@/utils/incidenciaConstants";

import type { PanelNode } from "./types";

/**
 * Contingut del bottomsheet segons què estigui obert: hidrant, incidència o
 * creació. És una funció i no un component perquè `Panel` espera una
 * descripció (`PanelNode`) i no un element.
 */
export function buildNodeSheet({
  selection,
  creation,
  canEdit,
  hasUser,
  hasLocation,
  nodeInfoKey,
  showRoute,
  setShowRoute,
  refreshHidrants,
  refreshIncidencies,
}: {
  selection: ReturnType<typeof useMapSelection>;
  creation: ReturnType<typeof useMapCreation>;
  canEdit: boolean;
  hasUser: boolean;
  hasLocation: boolean;
  nodeInfoKey: number;
  showRoute: boolean;
  setShowRoute: (value: boolean) => void;
  refreshHidrants: () => Promise<void>;
  refreshIncidencies: () => void | Promise<void>;
}): PanelNode | null {
  const { selectedNode, selectedIncidencia, editing, setEditing } = selection;

  if (selectedNode) {
    return {
      id: selectedNode.id,
      content: (
        <NodeInfo
          key={nodeInfoKey}
          feature={selectedNode}
          canEdit={canEdit}
          editing={editing}
          setEditing={setEditing}
          draftPosition={selection.draftPosition}
          setDraftPosition={selection.setDraftPosition}
          refreshHidrants={refreshHidrants}
          showRoute={showRoute}
          setShowRoute={setShowRoute}
          hasLocation={hasLocation}
        />
      ),
      onClose: selection.deselectNode,
      onEdit: canEdit ? selection.toggleEditing : undefined,
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
          setEditing={setEditing}
          showRoute={showRoute}
          setShowRoute={setShowRoute}
          refreshIncidencies={() => {
            void refreshIncidencies();
          }}
          hasLocation={hasLocation}
        />
      ),
      onClose: selection.deselectIncidencia,
      onEdit: canEdit ? () => setEditing((prev) => !prev) : undefined,
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
          onClose={creation.close}
          setNewNodePosition={creation.setPosition}
          refreshHidrants={() => {
            void refreshHidrants();
          }}
          refreshIncidencies={() => {
            void refreshIncidencies();
          }}
        />
      ),
      onClose: creation.close,
    };
  }

  return null;
}
