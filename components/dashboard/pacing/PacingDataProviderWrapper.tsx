"use client"

import { useMemo } from "react"
import PacingDataProvider from "./PacingDataProvider"
import SocialPacingContainer from "./social/SocialPacingContainer"
import ProgrammaticPacingContainer from "./programmatic/ProgrammaticPacingContainer"
import { Skeleton } from "@/components/ui/skeleton"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"

type PacingDataProviderWrapperProps = {
  mbaNumber: string
  pacingLineItemIds: string[]
  campaignStart?: string
  campaignEnd?: string
  fromDate?: string
  toDate?: string
  clientSlug: string
  socialItemsActive: any[]
  progDisplayItemsActive: any[]
  progVideoItemsActive: any[]
}

export default function PacingDataProviderWrapper({
  mbaNumber,
  pacingLineItemIds,
  campaignStart,
  campaignEnd,
  fromDate,
  toDate,
  clientSlug,
  socialItemsActive,
  progDisplayItemsActive,
  progVideoItemsActive,
}: PacingDataProviderWrapperProps) {
  const cleanId = (v: unknown): string | null => {
    const s = String(v ?? "").trim().toLowerCase()
    if (!s || s === "undefined" || s === "null") return null
    return s
  }

  const extractLineItemId = (item: any): string | null => {
    const id = item?.line_item_id ?? item?.lineItemId ?? item?.LINE_ITEM_ID
    return cleanId(id)
  }

  const pacingIdSet = useMemo(() => {
    const ids = (pacingLineItemIds ?? []).map((id) => cleanId(id)).filter(Boolean) as string[]
    return new Set(ids)
  }, [pacingLineItemIds])

  const filterByPacingSet = (id: string | null) => {
    if (!id) return false
    if (pacingIdSet.size === 0) return true
    return pacingIdSet.has(id)
  }

  const isMetaPlatform = (value: unknown) => /\b(meta|facebook|instagram|ig)\b/i.test(String(value ?? ""))
  const isTikTokPlatform = (value: unknown) => /\btik\s*tok\b/i.test(String(value ?? ""))

  const classifySocialPlatform = (item: any): "meta" | "tiktok" | null => {
    const platform = String(item?.platform ?? "").trim()
    if (platform) {
      if (isMetaPlatform(platform)) return "meta"
      if (isTikTokPlatform(platform)) return "tiktok"
    }
    const fallbackName = String(
      item?.line_item_name ?? item?.lineItemName ?? item?.creative_targeting ?? item?.creative ?? ""
    )
      .trim()
      .toUpperCase()
    if (/(^|[^A-Z])(FB|IG|META)([^A-Z]|$)/.test(fallbackName)) return "meta"
    if (/(^|[^A-Z])(TT|TIKTOK)([^A-Z]|$)/.test(fallbackName)) return "tiktok"
    return null
  }

  const metaLineItemIds = useMemo(() => {
    const ids = (socialItemsActive ?? [])
      .filter((item) => classifySocialPlatform(item) === "meta")
      .map(extractLineItemId)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [socialItemsActive, pacingIdSet])

  const tiktokLineItemIds = useMemo(() => {
    const ids = (socialItemsActive ?? [])
      .filter((item) => classifySocialPlatform(item) === "tiktok")
      .map(extractLineItemId)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [socialItemsActive, pacingIdSet])

  const progDisplayLineItemIds = useMemo(() => {
    const ids = (progDisplayItemsActive ?? [])
      .map(extractLineItemId)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [progDisplayItemsActive, pacingIdSet])

  const progVideoLineItemIds = useMemo(() => {
    const ids = (progVideoItemsActive ?? [])
      .map(extractLineItemId)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [progVideoItemsActive, pacingIdSet])

  const effectiveStart = fromDate ?? campaignStart
  const effectiveEnd = toDate ?? campaignEnd

  return (
    <PacingDataProvider
      mbaNumber={mbaNumber}
      metaLineItemIds={metaLineItemIds}
      tiktokLineItemIds={tiktokLineItemIds}
      progDisplayLineItemIds={progDisplayLineItemIds}
      progVideoLineItemIds={progVideoLineItemIds}
      campaignStart={campaignStart}
      campaignEnd={campaignEnd}
      fromDate={effectiveStart}
      toDate={effectiveEnd}
    >
      {({ rows, loading, error }: { rows: CombinedPacingRow[]; loading: boolean; error: string | null }) => (
        <>
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <Skeleton className="h-[480px] w-full rounded-3xl" />
          ) : (
            <>
              {socialItemsActive.length > 0 ? (
                <SocialPacingContainer
                  clientSlug={clientSlug}
                  mbaNumber={mbaNumber}
                  socialLineItems={socialItemsActive}
                  campaignStart={effectiveStart}
                  campaignEnd={effectiveEnd}
                  initialPacingRows={rows}
                  pacingLineItemIds={pacingLineItemIds}
                />
              ) : null}

              {(progDisplayItemsActive.length > 0 || progVideoItemsActive.length > 0) ? (
                <ProgrammaticPacingContainer
                  clientSlug={clientSlug}
                  mbaNumber={mbaNumber}
                  progDisplayLineItems={progDisplayItemsActive}
                  progVideoLineItems={progVideoItemsActive}
                  campaignStart={effectiveStart}
                  campaignEnd={effectiveEnd}
                  initialPacingRows={rows}
                  pacingLineItemIds={pacingLineItemIds}
                />
              ) : null}
            </>
          )}
        </>
      )}
    </PacingDataProvider>
  )
}
