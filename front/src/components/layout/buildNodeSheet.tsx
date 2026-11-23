import { NodeInfo } from "@/features/hidrants/NodeInfo";
import { IncidenciaInfo } from "@/features/incidencies/IncidenciaInfo";
import { HidrantSyncActions } from "@/features/osm/HidrantSyncActions";
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
  isAdmin,
  hasUser,
  hasLocation,
  showRoute,
  setShowRoute,
}: {
  sheet: ReturnType<typeof useMapSheet>;
  canEdit: boolean;
  isAdmin: boolean;
  hasUser: boolean;
  hasLocation: boolean;
  showRoute: boolean;
  setShowRoute: (value: boolean) => void;
}): PanelNode | null {
  const { selectedNode, selectedIncidencia, editing, creation, close } = sheet;

  if (selectedNode) {
    return {
      id: selectedNode.id,
      content: (
        <NodeInfo
          feature={selectedNode}
          canEdit={canEdit}
          syncActions={isAdmin ? <HidrantSyncActions feature={selectedNode} /> : undefined}
          editing={editing}
          setEditing={sheet.setEditing}
          draftPosition={sheet.draftPosition}
          setDraftPosition={sheet.setDraftPosition}
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
        />
      ),
      onClose: close,
    };
  }

  return null;
}
