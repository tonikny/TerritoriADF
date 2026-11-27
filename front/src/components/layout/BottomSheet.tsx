import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent } from "react";
import { HANDLE_H, ICONS_H, BAR_HEIGHT, tabBarHeight } from "./metrics";
import { TabBar } from "./TabBar";
import { NodeHeader } from "./NodeHeader";
import type { PanelTab, PanelNode, BottomSheetHandle } from "./types";

/**
 * Punts d'ancoratge del full: tancat, mig i gairebé sencer. Es calculen una
 * sola vegada per arrossegament (a `pointerdown`); així `pointermove` només
 * compara dos números i no rellegeix l'alçada real del DOM a cada moviment.
 */
type SnapPoints = { closed: number; mid: number; max: number };

function closedHeight(nodeMode: boolean): number {
  // Amb pestanyes la barra creix amb la lletra; amb un node l'alçada és fixa.
  return nodeMode ? BAR_HEIGHT : tabBarHeight();
}

function snapPoints(nodeMode: boolean): SnapPoints {
  return {
    closed: closedHeight(nodeMode),
    mid: Math.round(window.innerHeight * 0.6),
    max: Math.round(window.innerHeight * 0.95),
  };
}

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
    /** Ancoratges congelats en començar el gest: `innerHeight` no canvia a mig drag. */
    points: SnapPoints;
    moved: boolean;
    handleHit: boolean;
    tabId: string | null;
  } | null>(null);
  const dragMovedRef = useRef(false);

  const setSnap = (h: number) => {
    setOpen(h > closedHeight(nodeMode));
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
          setSnap(snapPoints(nodeMode).closed);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const points = snapPoints(nodeMode);
    dragRef.current = {
      startY: e.clientY,
      startH: open ? height : points.closed,
      h: height,
      points,
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
    const { closed, max } = d.points;
    const next = Math.max(closed, Math.min(d.startH + delta, max));
    d.h = next;
    // En obrir-se, el panell ha de créixer amb el dit: si encara consta com a
    // tancat, l'alçada no s'aplicava i només canviava en deixar anar el dit.
    if (!open && next > closed) {
      setOpen(true);
    }
    setHeight(next);
  };

  const endDrag = () => {
    const d = dragRef.current;
    if (!d) {
      return;
    }
    dragRef.current = null;
    const { closed, mid, max } = d.points;
    if (!d.moved) {
      if (d.tabId) {
        onSelectTab(d.tabId);
        if (!open) {
          setSnap(mid);
        }
      } else if (d.handleHit) {
        if (nodeMode) {
          node.onClose();
        } else {
          setSnap(open ? closed : mid);
        }
      }
      return;
    }
    const target = [closed, mid, max].reduce(
      (acc, p) => (Math.abs(p - d.h) < Math.abs(acc - d.h) ? p : acc),
      closed,
    );
    if (nodeMode && target === closed) {
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
      setSnap(snapPoints(nodeMode).mid);
    }
  };

  const activeContent = tabs.find((t) => t.id === activeTab)?.content;

  return (
    <div
      data-bottom-sheet={open ? "open" : "closed"}
      className={`fixed inset-x-0 bottom-0 z-1000 tb:hidden flex flex-col bg-white rounded-t-xl shadow-sheet ${
        open ? "" : "h-[var(--sheet-bar-h)]"
      } ${snapping ? "transition-[height] duration-250 ease" : "transition-none"}`}
      style={open ? { height } : undefined}
    >
      {/* La capçalera creix amb la lletra (Mida de text) i el contingut ocupa
          la resta: així les etiquetes no es queden mai fora de la barra. */}
      <div
        className="touch-none shrink-0 bg-accent rounded-t-xl"
        style={{ minHeight: nodeMode ? HANDLE_H + ICONS_H : "var(--sheet-bar-h)" }}
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
          <span className="h-0.75 w-9 rounded-full bg-primary/35" aria-hidden />
        </div>
        {nodeMode && node ? (
          <NodeHeader
            title={node.title}
            onEdit={node.onEdit}
            onClose={node.onClose}
            editing={node.editing}
          />
        ) : (
          <TabBar
            tabs={tabs}
            activeId={activeTab}
            onSelect={handleTabSelect}
            showLabels={open}
            flat
          />
        )}
      </div>
      <div className={`flex-1 min-h-0 ${open ? "overflow-y-auto" : "hidden"}`}>
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
