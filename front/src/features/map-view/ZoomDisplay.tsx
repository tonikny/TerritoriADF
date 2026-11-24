export const ZoomDisplay = ({ zoom }: { zoom: number }) => (
  <div className="bg-white px-2 py-0.5 border border-border rounded text-xs text-ink shadow-[0_1px_5px_rgba(0,0,0,0.4)] font-bold">
    Zoom: {Math.round(zoom)}
  </div>
);

export default ZoomDisplay;
