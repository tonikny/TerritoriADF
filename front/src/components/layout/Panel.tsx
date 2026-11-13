import type { ReactNode, Ref } from "react";
import { TabBar } from "./TabBar";
import { NodeHeader } from "./NodeHeader";
import { BottomSheet } from "./BottomSheet";
import { AdfHint } from "../shared/AdfHint";
import { useLocalStorage } from "../../utils/useLocalStorage";
import { storageKey } from "../../utils/storageKeys";
import type { PanelTab, PanelNode, BottomSheetHandle } from "./types";

export type { PanelTab, BottomSheetHandle };

const ACTIVE_TAB_KEY = storageKey("active_tab");

interface PanelProps {
  map: ReactNode;
  tabs: PanelTab[];
  node: PanelNode | null;
  sheetRef?: Ref<BottomSheetHandle>;
}

export function Panel({ map, tabs, node, sheetRef }: PanelProps) {
  const [storedTab, setStoredTab] = useLocalStorage<string | null>(ACTIVE_TAB_KEY, null);
  const activeTab = tabs.some((t) => t.id === storedTab) ? storedTab! : (tabs[0]?.id ?? "");
  const setActiveTab = (id: string) => setStoredTab(id);
  const activeContent = tabs.find((t) => t.id === activeTab)?.content;

  return (
    <div id="app-shell" className="h-full w-full">
      <div className="flex h-screen max-h-svh w-full overflow-hidden">
        <div id="map-container" className="flex-1 relative h-full min-w-0">
          {map}
        </div>
        <aside className="hidden tb:block w-95 shrink-0 bg-white border-l border-border">
          {node ? (
            <NodeHeader
              title={node.title}
              onEdit={node.onEdit}
              onClose={node.onClose}
              editing={node.editing}
            />
          ) : (
            <TabBar tabs={tabs} activeId={activeTab} onSelect={setActiveTab} showLabels />
          )}
          <div
            className={`h-[calc(100%-44px)] overflow-y-auto ${node ? "" : "border-t border-soft"}`}
          >
            {node ? node.content : activeContent}
          </div>
        </aside>
      </div>
      <AdfHint />
      <BottomSheet
        ref={sheetRef}
        key={node?.id ?? "none"}
        tabs={tabs}
        node={node}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    </div>
  );
}
