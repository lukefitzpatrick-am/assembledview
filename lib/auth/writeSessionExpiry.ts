/**
 * Client-side write-auth expiry (ON-3 / SE-1).
 *
 * Middleware 401s `/api/plans/save` (and other writes) when the session is gone.
 * Reads can still look logged-in (cache / fail-soft), so this store is driven
 * only by write responses — never by GET /api/me.
 */

export const WRITE_SESSION_EXPIRED_STORAGE_KEY = "av:write-session-expired"

export const SESSION_EXPIRED_TITLE = "Session expired"

export const SESSION_EXPIRED_SAVE_MESSAGE =
  "Your session expired, so this save did not go through. Nothing was written. That is not something you did in the form. Sign in again, then retry Save. Stay on this page until you do — leaving it can drop unsaved edits."

export const SESSION_EXPIRED_SKIPPED_STEP =
  "Not reached — session expired, so this step did not run."

export const SESSION_EXPIRED_BANNER_BODY =
  "Your session expired. Unsaved work on this page was not written. Sign in again, then retry Save."

export const SESSION_EXPIRED_PUBLISH_MESSAGE =
  "Your session expired, so publish did not finish. That is not something you did in the form. Sign in again, then retry publish. Channel data may already be staged; the live version was not advanced."

export class WriteSessionExpiredError extends Error {
  readonly code = "WRITE_SESSION_EXPIRED" as const
  constructor(message: string = SESSION_EXPIRED_SAVE_MESSAGE) {
    super(message)
    this.name = "WriteSessionExpiredError"
  }
}

export function isWriteSessionExpiredError(err: unknown): err is WriteSessionExpiredError {
  return (
    err instanceof WriteSessionExpiredError ||
    (typeof err === "object" &&
      err != null &&
      (err as { name?: string; code?: string }).name === "WriteSessionExpiredError")
  )
}

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const memoryStorage = new Map<string, string>()
const listeners = new Set<() => void>()

let memoryFlag = false
let hydrated = false

function getStorage(): StorageLike {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage
  } catch {
    /* private mode / SSR */
  }
  return {
    getItem: (key) => memoryStorage.get(key) ?? null,
    setItem: (key, value) => {
      memoryStorage.set(key, value)
    },
    removeItem: (key) => {
      memoryStorage.delete(key)
    },
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function persistFlag(next: boolean): void {
  memoryFlag = next
  hydrated = true
  try {
    if (next) getStorage().setItem(WRITE_SESSION_EXPIRED_STORAGE_KEY, "1")
    else getStorage().removeItem(WRITE_SESSION_EXPIRED_STORAGE_KEY)
  } catch {
    /* ignore quota / private mode */
  }
  emit()
}

function hydrateFromStorage(): void {
  if (hydrated) return
  hydrated = true
  try {
    memoryFlag = getStorage().getItem(WRITE_SESSION_EXPIRED_STORAGE_KEY) === "1"
  } catch {
    memoryFlag = false
  }
}

export function noteWriteUnauthorized(): void {
  persistFlag(true)
}

export function noteAuthenticatedWriteOk(): void {
  persistFlag(false)
}

export function isWriteSessionExpired(): boolean {
  hydrateFromStorage()
  return memoryFlag
}

export function subscribeWriteSessionExpiry(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function getWriteSessionExpiredSnapshot(): boolean {
  return isWriteSessionExpired()
}

export function resetWriteSessionExpiryForTests(opts?: {
  hydrateFromStorage?: boolean
}): void {
  if (opts?.hydrateFromStorage) {
    hydrated = false
    hydrateFromStorage()
  } else {
    memoryFlag = false
    hydrated = true
    try {
      getStorage().removeItem(WRITE_SESSION_EXPIRED_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    memoryStorage.delete(WRITE_SESSION_EXPIRED_STORAGE_KEY)
  }
  emit()
}

export function throwIfWriteUnauthorized(status: number): false {
  if (!isUnauthorizedStatus(status)) return false
  noteWriteUnauthorized()
  throw new WriteSessionExpiredError()
}

export type SaveStatusLike = {
  name: string
  status: "pending" | "success" | "error" | "skipped"
  error?: string
}

export function applySessionExpiredToSaveItems<T extends SaveStatusLike>(
  items: readonly T[],
  failedStepName: string
): T[] {
  return items.map((item) => {
    if (item.name === failedStepName) {
      return {
        ...item,
        status: "error" as const,
        error: SESSION_EXPIRED_SAVE_MESSAGE,
      }
    }
    if (item.status === "pending") {
      return {
        ...item,
        status: "skipped" as const,
        error: SESSION_EXPIRED_SKIPPED_STEP,
      }
    }
    return item
  })
}

export function savingModalChromeForItems(
  items: ReadonlyArray<{ status: string; error?: string; name?: string }>
): { titleWithErrors?: string; descriptionError?: string } {
  const expired = items.some(
    (item) => item.status === "error" && item.error === SESSION_EXPIRED_SAVE_MESSAGE
  )
  if (!expired) return {}
  return {
    titleWithErrors: SESSION_EXPIRED_TITLE,
    descriptionError: SESSION_EXPIRED_SAVE_MESSAGE,
  }
}

export function loginReturnHref(pathname: string): string {
  const returnTo = pathname && pathname.startsWith("/") ? pathname : "/"
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
}
