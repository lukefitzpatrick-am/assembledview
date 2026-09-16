import { useCallback, useSyncExternalStore } from "react"

export const PORTFOLIO_LAYOUT_STORAGE_KEY = "pacing.portfolioLayout"

export type PortfolioLayout = "cards" | "table"

const listeners = new Set<() => void>()
let cached: PortfolioLayout | null = null

export function parsePortfolioLayout(raw: string | null | undefined): PortfolioLayout {
  return raw === "table" ? "table" : "cards"
}

export function readPortfolioLayout(): PortfolioLayout {
  try {
    if (typeof localStorage === "undefined") return "cards"
    return parsePortfolioLayout(localStorage.getItem(PORTFOLIO_LAYOUT_STORAGE_KEY))
  } catch {
    return "cards"
  }
}

export function writePortfolioLayout(next: PortfolioLayout): void {
  cached = next
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PORTFOLIO_LAYOUT_STORAGE_KEY, next)
    }
  } catch {
    // Preference is a convenience — quota / private mode must not throw.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PortfolioLayout {
  if (cached == null) cached = readPortfolioLayout()
  return cached
}

function getServerSnapshot(): PortfolioLayout {
  return "cards"
}

/** Test-only: drop the in-memory cache so the next read hits storage. */
export function resetPortfolioLayoutCacheForTests(): void {
  cached = null
}

export function usePortfolioLayout(): {
  layout: PortfolioLayout
  setLayout: (next: PortfolioLayout) => void
} {
  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setLayout = useCallback((next: PortfolioLayout) => {
    writePortfolioLayout(next)
  }, [])
  return { layout, setLayout }
}
