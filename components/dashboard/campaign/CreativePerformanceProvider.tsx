"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import type { CreativePerformanceRow } from "@/lib/creative/performance/metrics"
import { creativesForLine } from "@/lib/creative/performance/present"

export type CreativeLoadStatus = "off" | "loading" | "ready" | "unavailable" | "error"

type CreativePerformanceValue = {
  status: CreativeLoadStatus
  creatives: CreativePerformanceRow[]
  reload: () => void
}

const CreativePerformanceContext = createContext<CreativePerformanceValue>({
  status: "off",
  creatives: [],
  reload: () => {},
})

export function useCreativePerformance(): CreativePerformanceValue {
  return useContext(CreativePerformanceContext)
}

export function useLineCreatives(lineItemId: string | undefined): CreativePerformanceRow[] {
  const { status, creatives } = useCreativePerformance()
  return useMemo(() => {
    if (status !== "ready" || !lineItemId) return []
    return creativesForLine(creatives, lineItemId)
  }, [creatives, lineItemId, status])
}

export function CreativePerformanceProvider({
  enabled,
  slug,
  mbaNumber,
  from,
  to,
  children,
}: {
  enabled: boolean
  slug: string
  mbaNumber: string
  from: string
  to: string
  children: ReactNode
}) {
  const [status, setStatus] = useState<CreativeLoadStatus>(enabled ? "loading" : "off")
  const [creatives, setCreatives] = useState<CreativePerformanceRow[]>([])
  const [reloadToken, setReloadToken] = useState(0)
  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  useEffect(() => {
    if (!enabled || !slug || !mbaNumber || !from || !to) {
      setStatus("off")
      setCreatives([])
      return
    }
    const controller = new AbortController()
    setStatus("loading")
    const url =
      `/api/dashboard/${encodeURIComponent(slug)}/${encodeURIComponent(mbaNumber)}/creative` +
      `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&sort=ctr`
    fetch(url, { signal: controller.signal, credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (res.status === 503) {
          setCreatives([])
          setStatus("unavailable")
          return
        }
        if (!res.ok) throw new Error(`creative performance ${res.status}`)
        const body = (await res.json()) as { creatives?: CreativePerformanceRow[] }
        setCreatives(Array.isArray(body.creatives) ? body.creatives : [])
        setStatus("ready")
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        if (!controller.signal.aborted) {
          setCreatives([])
          setStatus("error")
        }
      })
    return () => controller.abort()
  }, [enabled, slug, mbaNumber, from, to, reloadToken])

  const value = useMemo(
    () => ({ status, creatives, reload }),
    [status, creatives, reload],
  )

  return (
    <CreativePerformanceContext.Provider value={value}>
      {children}
    </CreativePerformanceContext.Provider>
  )
}
