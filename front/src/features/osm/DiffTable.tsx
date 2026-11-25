import { diffRows, type DiffData } from "./osmDiff";

/** Taula de tags que difereixen entre la versió local i la d'OSM. */
export function DiffTable({ diff }: { diff: DiffData }) {
  const rows = diffRows(diff);
  if (rows.length === 0) {
    return <div className="text-[0.7rem] text-muted">Sense diferències de tags</div>;
  }
  return (
    <table className="w-full text-[0.7rem] border-collapse">
      <thead>
        <tr className="text-orange-700">
          <th className="text-left py-0.5 pr-2">Camp</th>
          <th className="text-left py-0.5 pr-2">Local</th>
          <th className="text-left py-0.5">OSM</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, local, osm }) => (
          <tr key={key} className="border-t border-orange-200">
            <td className="py-0.5 pr-2 font-mono text-orange-800">{key}</td>
            <td className="py-0.5 pr-2 font-mono text-red-700">{local}</td>
            <td className="py-0.5 font-mono text-green-700">{osm}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
