/**
 * Stable business error codes. The frontend translates them (i18n) and MCP agents read the
 * accompanying `message`, so the code is the contract and the message is only a fallback.
 * Never rename a value once shipped — add a new one instead.
 */
export enum ErrorCode {
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  AREA_NOT_FOUND = 'AREA_NOT_FOUND',
  AREA_KEY_TAKEN = 'AREA_KEY_TAKEN',
}

/** Body for a Nest HttpException that carries a business code alongside the human message. */
export function errorBody(code: ErrorCode, message: string, details?: unknown) {
  return { code, message, ...(details === undefined ? {} : { details }) }
}

/** Mongo duplicate-key error (E11000), raised when a unique index rejects a write. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
}
