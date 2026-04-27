"use client"

import { useCallback, useMemo } from "react"
import DeliveryDataProvider from "./DeliveryDataProvider"
import SocialDeliveryContainer from "./social/SocialDeliveryContainer"
import SearchDeliveryContainer from "./search/SearchDeliveryContainer"
import ProgrammaticDeliveryContainer from "./programmatic/ProgrammaticDeliveryContainer"
import { Skeleton } from "@/components/ui/skeleton"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"

function cleanPacingLineItemId(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase()
  if (!s || s === "undefined" || s === "null") return null
  return s
}

function extractPacingLineItemIdFromItem(item: any): string | null {
  const id = item?.line_item_id ?? item?.lineItemId ?? item?.LINE_ITEM_ID
  return cleanPacingLineItemId(id)
}

function isMetaPlatformString(value: unknown) {
  return /\b(meta|facebook|instagram|ig)\b/i.test(String(value ?? ""))
}

function isTikTokPlatformString(value: unknown) {
  return /\btik\s*tok\b/i.test(String(value ?? ""))
}

function classifySocialPacingPlatform(item: any): "meta" | "tiktok" | null {
  const platform = String(item?.platform ?? "").trim()
  if (platform) {
    if (isMetaPlatformString(platform)) return "meta"
    if (isTikTokPlatformString(platform)) return "tiktok"
  }
  const fallbackName = String(
    item?.line_item_name ?? item?.lineItemName ?? item?.creative_targeting ?? item?.creative ?? "",
  )
    .trim()
    .toUpperCase()
  if (/(^|[^A-Z])(FB|IG|META)([^A-Z]|$)/.test(fallbackName)) return "meta"
  if (/(^|[^A-Z])(TT|TIKTOK)([^A-Z]|$)/.test(fallbackName)) return "tiktok"
  return null
}

type DeliveryDataProviderWrapperProps = {
  mbaNumber: string
  deliveryLineItemIds: string[]
  campaignStart?: string
  campaignEnd?: string
  fromDate?: string
  toDate?: string
  clientSlug: string
  socialItemsActive: any[]
  progDisplayItemsActive: any[]
  progVideoItemsActive: any[]
  mpSearchEnabled?: boolean
  searchLineItemIds?: string[]
  searchItemsActive?: any[]
}

export default function DeliveryDataProviderWrapper({
  mbaNumber,
  deliveryLineItemIds,
  campaignStart,
  campaignEnd,
  fromDate,
  toDate,
  clientSlug,
  socialItemsActive,
  progDisplayItemsActive,
  progVideoItemsActive,
  mpSearchEnabled,
  searchLineItemIds,
  searchItemsActive,
}: DeliveryDataProviderWrapperProps) {
  const pacingIdSet = useMemo(() => {
    const ids = (deliveryLineItemIds ?? []).map((id) => cleanPacingLineItemId(id)).filter(Boolean) as string[]
    return new Set(ids)
  }, [deliveryLineItemIds])

  const filterByPacingSet = useCallback(
    (id: string | null) => {
      if (!id) return false
      if (pacingIdSet.size === 0) return true
      return pacingIdSet.has(id)
    },
    [pacingIdSet],
  )

  const metaLineItemIds = useMemo(() => {
    const ids = (socialItemsActive ?? [])
      .filter((item) => classifySocialPacingPlatform(item) === "meta")
      .map(extractPacingLineItemIdFromItem)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [socialItemsActive, filterByPacingSet])

  const tiktokLineItemIds = useMemo(() => {
    const ids = (socialItemsActive ?? [])
      .filter((item) => classifySocialPacingPlatform(item) === "tiktok")
      .map(extractPacingLineItemIdFromItem)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [socialItemsActive, filterByPacingSet])

  const progDisplayLineItemIds = useMemo(() => {
    const ids = (progDisplayItemsActive ?? [])
      .map(extractPacingLineItemIdFromItem)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [progDisplayItemsActive, filterByPacingSet])

  const progVideoLineItemIds = useMemo(() => {
    const ids = (progVideoItemsActive ?? [])
      .map(extractPacingLineItemIdFromItem)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [progVideoItemsActive, filterByPacingSet])

  const effectiveStart = fromDate ?? campaignStart
  const effectiveEnd = toDate ?? campaignEnd

  const includeSearch = Boolean(
    mpSearchEnabled && (searchLineItemIds?.length ?? 0) > 0 && effectiveStart && effectiveEnd
  )

  return (
    <DeliveryDataProvider
      mbaNumber={mbaNumber}
      metaLineItemIds={metaLineItemIds}
      tiktokLineItemIds={tiktokLineItemIds}
      progDisplayLineItemIds={progDisplayLineItemIds}
      progVideoLineItemIds={progVideoLineItemIds}
      campaignStart={campaignStart}
      campaignEnd={campaignEnd}
      fromDate={effectiveStart}
      toDate={effectiveEnd}
      searchEnabled={includeSearch}
      searchLineItemIds={searchLineItemIds ?? []}
    >
      {({
        rows,
        search,
        loading,
        error,
      }: {
        rows: CombinedPacingRow[]
        search: SearchPacingResponse | null
        loading: boolean
        error: string | null
      }) => (
        <>
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <Skeleton className="h-[480px] w-full rounded-3xl" />
          ) : (
            <div className="space-y-4">
              {socialItemsActive.length > 0 && effectiveStart && effectiveEnd ? (
                <SocialDeliveryContainer
                  clientSlug={clientSlug}
                  mbaNumber={mbaNumber}
                  socialLineItems={socialItemsActive}
                  campaignStart={effectiveStart}
                  campaignEnd={effectiveEnd}
                  initialPacingRows={rows}
                  deliveryLineItemIds={deliveryLineItemIds}
                />
              ) : null}

              {mpSearchEnabled &&
              (searchLineItemIds?.length ?? 0) > 0 &&
              effectiveStart &&
              effectiveEnd ? (
                <SearchDeliveryContainer
                  clientSlug={clientSlug}
                  mbaNumber={mbaNumber}
                  lineItemIds={searchLineItemIds ?? []}
                  searchLineItems={searchItemsActive ?? []}
                  campaignStart={effectiveStart}
                  campaignEnd={effectiveEnd}
                  initialSearchData={search}
                />
              ) : null}

              {(progDisplayItemsActive.length > 0 || progVideoItemsActive.length > 0) &&
              effectiveStart &&
              effectiveEnd ? (
                <ProgrammaticDeliveryContainer
                  clientSlug={clientSlug}
                  mbaNumber={mbaNumber}
                  progDisplayLineItems={progDisplayItemsActive}
                  progVideoLineItems={progVideoItemsActive}
                  campaignStart={effectiveStart}
                  campaignEnd={effectiveEnd}
                  initialPacingRows={rows}
                  deliveryLineItemIds={deliveryLineItemIds}
                />
              ) : null}
            </div>
          )}
        </>
      )}
    </DeliveryDataProvider>
  )
}
