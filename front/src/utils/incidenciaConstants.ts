import type { IncidenciaEstat, IncidenciaPrecisio, IncidenciaPrioritat } from "@/types";

export interface IncidenciaOption<T extends string = string> {
  value: T;
  label: string;
  icon?: string;
}

export const TIPUS_INCIDENCIA: IncidenciaOption[] = [
  { value: "GENERICA", icon: "⚠️", label: "Incidència genérica" },
  { value: "FOC", icon: "🔥", label: "Foc de vegetació / forestal" },
  { value: "FUM", icon: "💨", label: "Columna de fum" },
  { value: "ACCIDENT", icon: "🚗", label: "Accident de trànsit" },
];

export const PRIORITATS_INCIDENCIA: IncidenciaOption<IncidenciaPrioritat>[] = [
  { value: "BAIXA", icon: "🟢", label: "Baixa (No urgent)" },
  { value: "MITJANA", icon: "🟠", label: "Mitjana (Cal atenció)" },
  { value: "ALTA", icon: "🔴", label: "Alta (Urgent! Perillós)" },
];

export const PRECISIONS_INCIDENCIA: IncidenciaOption<IncidenciaPrecisio>[] = [
  { value: "EXACTA", icon: "📍", label: "Exacta (punt precís)" },
  { value: "AREA", icon: "🗺️", label: "Àrea (zona àmplia)" },
  { value: "MUNICIPI", icon: "🏘️", label: "Nivell municipi" },
  { value: "DESCONEGUDA", icon: "❓", label: "Desconeguda" },
];

export const ESTATS_INCIDENCIA: IncidenciaOption<IncidenciaEstat>[] = [
  { value: "OBERT", label: "Obert" },
  { value: "EN_PROGRES", label: "En progrés" },
  { value: "RESOLT", label: "Resolt" },
  { value: "TANCAT", label: "Tancat" },
];

export const VISIBILITATS_INCIDENCIA: IncidenciaOption[] = [
  { value: "ADF_PRIVADA", icon: "🔒", label: "Només la pròpia ADF" },
  { value: "TOTES_ADFS", icon: "👥", label: "Totes les ADFs" },
  { value: "PUBLICA", icon: "🌍", label: "Pública" },
];

export function emojiTipusIncidencia(tipus?: string): string {
  return TIPUS_INCIDENCIA.find((t) => t.value === tipus?.toUpperCase())?.icon ?? "⚠️";
}

export function emojiPrioritatIncidencia(prioritat?: string | null): string {
  return PRIORITATS_INCIDENCIA.find((p) => p.value === prioritat?.toUpperCase())?.icon ?? "🟡";
}

export function labelDeCategoria(
  categoria: { value: string; label: string }[],
  valor?: string | null,
): string {
  return categoria.find((c) => c.value === valor?.toUpperCase())?.label ?? valor ?? "";
}

export function displayCategoria(
  categoria: { value: string; label: string; icon?: string }[],
  valor?: string | null,
): string {
  const opcio = categoria.find((c) => c.value === valor?.toUpperCase());
  if (!opcio) {
    return valor ?? "";
  }
  return opcio.icon ? `${opcio.icon} ${opcio.label}` : opcio.label;
}
