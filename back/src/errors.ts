// Classes d'errors personalitzades i codi estable per a la resposta HTTP.
//
// `code` és l'identificador que el client pot distingir sense llegir prosa; el
// `message` és el text per a la persona. La convenció és la del projecte:
// identificadors en anglès, però els noms del domini de l'aplicació es queden en
// català (`HIDRANT`, `INCIDENCIA`, `ADF`), perquè són els mateixos mots que fan
// servir la BD, el codi i la UI.

/** Codis d'error estables que poden sortir a l'API. */
export type ErrorCode =
  // Genèrics (qualsevol ruta)
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "CONFLICT"
  | "GONE"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "TOO_MANY_REQUESTS"
  | "BAD_GATEWAY"
  | "SERVICE_UNAVAILABLE"
  | "GATEWAY_TIMEOUT"
  | "INTERNAL_ERROR"
  // Domini de l'aplicació
  | "INVALID_CREDENTIALS"
  | "ACCESS_LINK_INVALID"
  | "ACCESS_LINK_USED"
  | "ACCESS_LINK_EXPIRED"
  | "ADF_NOT_FOUND"
  | "ADF_NOT_IDENTIFIED"
  | "ADF_FORBIDDEN"
  | "ADF_OUT_OF_BOUNDS"
  | "ADF_NO_OSM_RELATIONS"
  | "ADF_BOUNDARY_UPDATE_FAILED"
  | "HIDRANT_NOT_FOUND"
  | "HIDRANT_ID_MISSING"
  | "HIDRANT_COORDS_MISSING"
  | "INCIDENCIA_NOT_FOUND"
  | "INCIDENCIA_FORBIDDEN";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;

  constructor(message: string, statusCode: number, code: ErrorCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurs no trobat", code: ErrorCode = "NOT_FOUND") {
    super(message, 404, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "No autoritzat", code: ErrorCode = "UNAUTHORIZED") {
    super(message, 401, code);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Petició incorrecta", code: ErrorCode = "BAD_REQUEST") {
    super(message, 400, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "No tens permisos", code: ErrorCode = "FORBIDDEN") {
    super(message, 403, code);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Error intern del servidor", code: ErrorCode = "INTERNAL_ERROR") {
    super(message, 500, code);
  }
}
