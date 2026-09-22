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
import type { CampaignDetailPayload } from "@/lib/pacing/detail/types"
import {
  campaignDetailPath,
  readCampaignMbaFromSearch,
} from "@/lib/pacing/detail/campaignDetailUrl"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import { CampaignDetailModal } from "./CampaignDetailModal"

type CampaignDetailContextValue = {
  open: (mba: string) => void
  close: () => void
  mba: string | null
}

const CampaignDetailContext = createContext<CampaignDetailContextValue | null>(null)

export function useCampaignDetail(): CampaignDetailContextValue | null {
  return useContext(CampaignDetailContext)
}

export function CampaignDetailTrigger({
  mba,
  href,
  className,
  children,
}: {
  mba: string
  href: string
  className?: string
  children: ReactNode
}) {
  const detail = useCampaignDetail()
  if (detail) {
    return (
      <button type="button" className={className} onClick={() => detail.open(mba)}>
        {children}
      </button>
    )
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  )
}

function pushCampaignUrl(mba: string | null) {
  if (typeof window === "undefined") return
  const next = campaignDetailPath(window.location.pathname, window.location.search, mba)
  const current = `${window.location.pathname}${window.location.search}`
  if (next === current) return
  window.history.pushState({ campaign: mba }, "", next)
}

export function CampaignDetailProvider({
  children,
  canRelabel = false,
}: {
  children: ReactNode
  canRelabel?: boolean
}) {
  const asOf = usePacingFilterStore((s) => s.filters.as_of_date)
  const [mba, setMba] = useState<string | null>(null)
  const [payload, setPayload] = useState<CampaignDetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  const close = useCallback(() => {
    setMba(null)
    setPayload(null)
    setError(null)
    pushCampaignUrl(null)
  }, [])

  const open = useCallback((nextMba: string) => {
    const mbaNumber = nextMba.trim()
    if (!mbaNumber) return
    setMba(mbaNumber)
    pushCampaignUrl(mbaNumber)
  }, [])

  useEffect(() => {
    const fromUrl = readCampaignMbaFromSearch(
      typeof window === "undefined" ? "" : window.location.search,
    )
    if (fromUrl) setMba(fromUrl)
    const onPop = () => {
      setMba(readCampaignMbaFromSearch(window.location.search))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (!mba) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ asOfDate: asOf })
    fetch(`/api/pacing/campaign/${encodeURIComponent(mba)}?${qs}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as CampaignDetailPayload
      })
      .then((json) => {
        if (!cancelled) setPayload(json)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message || err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mba, asOf, refresh])

  useEffect(() => {
    if (!mba) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mba, close])

  const value = useMemo(() => ({ open, close, mba }), [open, close, mba])

  return (
    <CampaignDetailContext.Provider value={value}>
      {children}
      {mba ? (
        <CampaignDetailModal
          mba={mba}
          asOf={asOf}
          payload={payload}
          loading={loading}
          error={error}
          onClose={close}
          onReload={() => setRefresh((n) => n + 1)}
          canRelabel={canRelabel}
        />
      ) : null}
    </CampaignDetailContext.Provider>
  )
}
