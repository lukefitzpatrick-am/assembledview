/**
 * Typed outcome for lib/data reads. Callers at the UI boundary map failures
 * into ViewState error via `viewStateFromReadResult` — never treat a dead
 * backend as an empty list.
 */

export type ReadFreshness = {
  /** Epoch ms from `x-cache-fetched-at` (or equivalent). Derived, never asserted. */
  fetchedAt?: number | null
  /** True when served after upstream failure (`x-warning: served-stale-…`). */
  stale?: boolean
}

export type ReadResult<T> =
  | { ok: true; data: T; freshness?: ReadFreshness }
  | { ok: false; error: string; cause?: unknown }

export function readOk<T>(data: T, freshness?: ReadFreshness): ReadResult<T> {
  return freshness ? { ok: true, data, freshness } : { ok: true, data }
}

export function readFail(error: string, cause?: unknown): ReadResult<never> {
  return { ok: false, error, cause }
}

export function readErrorMessage(err: unknown, fallback = "Read failed"): string {
  if (err instanceof Error && err.message.trim()) return err.message
  const s = String(err ?? "").trim()
  return s || fallback
}

/** Re-throw ReadResult failures; pass through ok data. */
export function unwrapReadOrThrow<T>(result: ReadResult<T>): T {
  if (!result.ok) {
    const e = new Error(result.error)
    if (result.cause !== undefined) {
      ;(e as Error & { cause?: unknown }).cause = result.cause
    }
    throw e
  }
  return result.data
}

/** Wrap a promise: success → ok, throw → fail (never empty-on-error). */
export async function toReadResult<T>(
  work: () => Promise<T>,
  fallbackMessage = "Read failed"
): Promise<ReadResult<T>> {
  try {
    return readOk(await work())
  } catch (cause) {
    return readFail(readErrorMessage(cause, fallbackMessage), cause)
  }
}
