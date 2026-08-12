/**
 * Request-token helpers for create-page MBA number generation.
 * Stale in-flight responses must not write form state (F-30 / client↔MBA race).
 */

export type MbaNumberRequestTokenRef = { current: number }

/** Bump and return the token for a new MBA-number fetch. */
export function beginMbaNumberRequest(ref: MbaNumberRequestTokenRef): number {
  ref.current += 1
  return ref.current
}

/** True only when this response still belongs to the latest request. */
export function shouldApplyMbaNumberResponse(
  requestToken: number,
  currentToken: number
): boolean {
  return requestToken === currentToken
}

/** Re-opening the client selector on the same id is not a client change. */
export function shouldSkipClientChange(
  currentClientId: string,
  nextClientId: string
): boolean {
  return nextClientId !== "" && nextClientId === currentClientId
}
