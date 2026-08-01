/**
 * Explicit list/view status contract. The four non-ready statuses are mutually
 * exclusive by construction — a fetch failure cannot render as "empty", and a
 * filter that excluded everything cannot render as "nothing here".
 */

import type { ReadFreshness, ReadResult } from "@/lib/data/readResult"

export type ViewStateFreshness = ReadFreshness

export type ViewState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry?: () => void }
  | { status: "empty" }
  | { status: "filtered-empty"; clear: () => void }
  | { status: "ready"; data: T; freshness?: ViewStateFreshness }

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
  /** Optional cache freshness (derived from headers / cache metadata). */
  freshness?: ViewStateFreshness
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
  return {
    status: "ready",
    data: [...args.visible],
    ...(args.freshness ? { freshness: args.freshness } : {}),
  }
}

/**
 * Map a lib/data ReadResult (+ client filter flags) into ViewState.
 * Forced DB / upstream failures → error (never empty).
 */
export function viewStateFromReadResult<T>(args: {
  loading: boolean
  result: ReadResult<readonly T[]> | null | undefined
  visible: readonly T[]
  filtersActive: boolean
  clear: () => void
  retry?: () => void
}): ViewState<T[]> {
  if (args.loading || args.result == null) return { status: "loading" }
  if (!args.result.ok) {
    return {
      status: "error",
      message: args.result.error,
      retry: args.retry,
    }
  }
  return resolveListViewState({
    loading: false,
    error: null,
    items: args.result.data,
    visible: args.visible,
    filtersActive: args.filtersActive,
    clear: args.clear,
    retry: args.retry,
    freshness: args.result.freshness,
  })
}
