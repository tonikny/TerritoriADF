/**
 * Què s'està creant al mapa. És estat de la vista del mapa (bottomsheet), no cap
 * tipus de domini: per això viu a la feature i no a `@territoriadf/contracts`.
 */
export type CreateType = "selection" | "hydrant" | "incidencia" | null;
