export const ZoomDisplay = ({ zoom }: { zoom: number }) => (
  <div className="bg-white px-2 py-0.5 border border-border rounded-lg text-xs text-ink shadow-control font-semibold">
    Zoom: {Math.round(zoom)}
  </div>
);

export default ZoomDisplay;
