/**
 * Explicit list/view status contract. The four non-ready statuses are mutually
 * exclusive by construction — a fetch failure cannot render as "empty", and a
 * filter that excluded everything cannot render as "nothing here".
 */
export type ViewState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry?: () => void }
  | { status: "empty" }
  | { status: "filtered-empty"; clear: () => void }
  | { status: "ready"; data: T }

export type ViewStateStatus = ViewState<unknown>["status"]

/**
 * Thin adapter from common list-fetch + client-filter flags into a ViewState.
 * Does not fetch — map whatever the current surface already loaded.
 */
export function resolveListViewState<T>(args: {
  loading: boolean
  error: string | null | undefined
  /** Unfiltered source set (server page / full payload). */
  items: readonly T[]
  /** Visible set after filters. */
  visible: readonly T[]
  filtersActive: boolean
  clear: () => void
  retry?: () => void
}): ViewState<T[]> {
  if (args.loading) return { status: "loading" }
  if (args.error) {
    return { status: "error", message: args.error, retry: args.retry }
  }
  if (args.items.length === 0) {
    if (args.filtersActive) {
      return { status: "filtered-empty", clear: args.clear }
    }
    return { status: "empty" }
  }
  if (args.visible.length === 0) {
    return { status: "filtered-empty", clear: args.clear }
  }
  return { status: "ready", data: [...args.visible] }
}
