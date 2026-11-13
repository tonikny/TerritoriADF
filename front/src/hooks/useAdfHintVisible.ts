import { useAdf } from "../contexts/AdfContext";

/** L'avís només té sentit si hi ha ADFs per triar i encara no se n'ha triat cap. */
export function useAdfHintVisible(): boolean {
  const { activeAdf, adfs } = useAdf();
  return !activeAdf && adfs.length > 0;
}
