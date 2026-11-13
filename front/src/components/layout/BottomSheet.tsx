import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent } from "react";
import { HANDLE_H, ICONS_H, BAR_HEIGHT } from "./metrics";
import { TabBar } from "./TabBar";
import { NodeHeader } from "./NodeHeader";
import type { PanelTab, PanelNode, BottomSheetHandle } from "./types";

function BottomSheetView(
  {
    tabs,
    node,
    activeTab,
    onSelectTab,
  }: {
    tabs: PanelTab[];
    node: PanelNode | null;
    activeTab: string;
    onSelectTab: (id: string) => void;
  },
  ref: React.ForwardedRef<BottomSheetHandle>,
) {
  const nodeMode = !!node;
  const [open, setOpen] = useState(nodeMode);
  const [height, setHeight] = useState(node ? Math.round(window.innerHeight * 0.6) : BAR_HEIGHT);
  const [snapping, setSnapping] = useState(false);
  const dragRef = useRef<{
    startY: number;
    startH: number;
    h: number;
    moved: boolean;
    handleHit: boolean;
    tabId: string | null;
  } | null>(null);
  const dragMovedRef = useRef(false);

  const positions = () => [
    BAR_HEIGHT,
    Math.round(window.innerHeight * 0.6),
    Math.round(window.innerHeight * 0.95),
  ];

  const setSnap = (h: number) => {
    setOpen(h > positions()[0]);
    setHeight(h);
    setSnapping(true);
  };

  useImperativeHandle(
    ref,
    () => ({
      close() {
        if (node) {
          node.onClose();
        } else {
          setSnap(positions()[0]);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    dragRef.current = {
      startY: e.clientY,
      startH: height,
      h: height,
      moved: false,
      handleHit: !!target.closest("[data-handle]"),
      tabId: target.closest("[data-tab]")?.getAttribute("data-tab") ?? null,
    };
    dragMovedRef.current = false;
    setSnapping(false);
    if (e.pointerType !== "mouse") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) {
      return;
    }
    const delta = d.startY - e.clientY;
    if (!d.moved) {
      if (Math.abs(delta) < 6) {
        return;
      }
      d.moved = true;
      dragMovedRef.current = true;
    }
    const next = Math.max(
      BAR_HEIGHT,
      Math.min(d.startH + delta, positions()[positions().length - 1]),
    );
    d.h = next;
    setHeight(next);
  };

  const endDrag = () => {
    const d = dragRef.current;
    if (!d) {
      return;
    }
    dragRef.current = null;
    if (!d.moved) {
      if (d.tabId) {
        onSelectTab(d.tabId);
        if (!open) {
          setSnap(positions()[1]);
        }
      } else if (d.handleHit) {
        if (nodeMode) {
          node.onClose();
        } else {
          setSnap(open ? positions()[0] : positions()[1]);
        }
      }
      return;
    }
    const pos = positions();
    const target = pos.reduce(
      (acc, p) => (Math.abs(p - d.h) < Math.abs(acc - d.h) ? p : acc),
      pos[0],
    );
    if (nodeMode && target === pos[0]) {
      node.onClose();
      return;
    }
    setSnap(target);
  };

  const handleTabSelect = (id: string) => {
    if (dragMovedRef.current) {
      return;
    }
    onSelectTab(id);
    if (!open) {
      setSnap(positions()[1]);
    }
  };

  const activeContent = tabs.find((t) => t.id === activeTab)?.content;

  return (
    <div
      data-bottom-sheet={height > BAR_HEIGHT ? "open" : "closed"}
      className="fixed inset-x-0 bottom-0 z-1000 tb:hidden bg-white border-t border-border rounded-t-xl shadow-[0_-2px_10px_rgba(0,0,0,0.2)]"
      style={{
        height,
        transition: snapping ? "height 0.25s ease" : "none",
      }}
    >
      <div
        className="touch-none bg-neutral-100"
        style={{ height: nodeMode ? HANDLE_H + ICONS_H : BAR_HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          data-handle
          className="flex justify-center items-start pt-0.75 select-none cursor-grab"
          style={{ height: HANDLE_H }}
        >
          <span className="h-0.75 w-9 rounded-full bg-faint" aria-hidden />
        </div>
        {nodeMode && node ? (
          <NodeHeader
            title={node.title}
            onEdit={node.onEdit}
            onClose={node.onClose}
            editing={node.editing}
          />
        ) : (
          <TabBar tabs={tabs} activeId={activeTab} onSelect={handleTabSelect} showLabels={open} />
        )}
      </div>
      <div
        className="overflow-y-auto"
        style={{ height: height - (nodeMode ? HANDLE_H + ICONS_H : BAR_HEIGHT) }}
      >
        {nodeMode && node ? node.content : activeContent}
      </div>
    </div>
  );
}

export const BottomSheet = forwardRef<
  BottomSheetHandle,
  {
    tabs: PanelTab[];
    node: PanelNode | null;
    activeTab: string;
    onSelectTab: (id: string) => void;
  }
>(BottomSheetView);
