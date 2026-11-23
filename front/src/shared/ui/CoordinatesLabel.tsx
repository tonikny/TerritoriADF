export function CoordinatesLabel({ lat, lon }: { lat: number; lon: number }) {
  return (
    <div className="text-[0.8rem] text-[#555] text-center mb-4">
      <strong>
        [ {lat.toFixed(5)}, {lon.toFixed(5)} ]
      </strong>
    </div>
  );
}
