import type { CreateType } from "@/features/map-view/createType";

export function createTitle(form: CreateType): string {
  if (form === "hydrant") {
    return "📍 Nou hidrant";
  }
  if (form === "incidencia") {
    return "⚠️ Nova incidència";
  }
  return "📍 Selecciona una acció";
}
