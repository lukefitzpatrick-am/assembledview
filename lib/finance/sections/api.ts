/**
 * Typed fetch helper for `/api/finance/sections/*`.
 * Panels consume ViewState — no bare fetches in components.
 */

import type { ViewState } from "@/lib/ui/viewState"

export type FinanceSectionsFetchOptions = {
  signal?: AbortSignal
  /** Called on HTTP/network failure for ViewState retry. */
  retry?: () => void
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string }
    return body.message || body.error || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

/**
 * GET JSON from a finance sections endpoint and map to ViewState.
 * Empty arrays / nullish payloads → empty; HTTP errors → error.
 */
export async function fetchFinanceSectionsJson<T>(
  path: string,
  searchParams?: URLSearchParams | Record<string, string | number | undefined | null>,
  options: FinanceSectionsFetchOptions = {}
): Promise<ViewState<T>> {
  const url = new URL(path, typeof window !== "undefined" ? window.location.origin : "http://local")
  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((v, k) => url.searchParams.set(k, v))
  } else if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v == null || v === "") continue
      url.searchParams.set(k, String(v))
    }
  }

  try {
    const res = await fetch(`${url.pathname}${url.search}`, {
      cache: "no-store",
      signal: options.signal,
    })
    if (!res.ok) {
      const message = await readErrorMessage(res)
      return { status: "error", message, retry: options.retry }
    }
    const data = (await res.json()) as T
    if (data == null) return { status: "empty" }
    if (Array.isArray(data) && data.length === 0) return { status: "empty" }
    return { status: "ready", data }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "loading" }
    }
    const message = err instanceof Error ? err.message : "Network error"
    return { status: "error", message, retry: options.retry }
  }
}
