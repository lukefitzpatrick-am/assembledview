"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import { getPacingWindow } from "@/lib/pacing/pacingWindow"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"
import type { SocialLineItem } from "@/lib/delivery/social/socialChannelCompute"
import { Skeleton } from "@/components/ui/skeleton"
import DeliveryDataProvider from "./DeliveryDataProvider"
import { DeliveryContainer } from "./DeliveryContainer"
import { buildProgrammaticDisplaySection } from "./channels/programmaticDisplayAdapter"
import { buildProgrammaticVideoSection } from "./channels/programmaticVideoAdapter"
import { buildSearchSection } from "./channels/searchAdapter"
import { buildSocialMetaSection } from "./channels/socialMetaAdapter"
import { buildSocialTiktokSection } from "./channels/socialTiktokAdapter"
import type { ChannelSectionData } from "./channels/types"

function cleanPacingLineItemId(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase()
  if (!s || s === "undefined" || s === "null") return null
  return s
}

function extractPacingLineItemIdFromItem(item: unknown): string | null {
  const row = item as Record<string, unknown>
  const id = row?.line_item_id ?? row?.lineItemId ?? row?.LINE_ITEM_ID
  return cleanPacingLineItemId(id)
}

function isMetaPlatformString(value: unknown) {
  return /\b(meta|facebook|instagram|ig)\b/i.test(String(value ?? ""))
}

function isTikTokPlatformString(value: unknown) {
  return /\btik\s*tok\b/i.test(String(value ?? ""))
}

function classifySocialPacingPlatform(item: unknown): "meta" | "tiktok" | null {
  const row = item as Record<string, unknown>
  const platform = String(row?.platform ?? "").trim()
  if (platform) {
    if (isMetaPlatformString(platform)) return "meta"
    if (isTikTokPlatformString(platform)) return "tiktok"
  }
  const fallbackName = String(
    row?.line_item_name ?? row?.lineItemName ?? row?.creative_targeting ?? row?.creative ?? "",
  )
    .trim()
    .toUpperCase()
  if (/(^|[^A-Z])(FB|IG|META)([^A-Z]|$)/.test(fallbackName)) return "meta"
  if (/(^|[^A-Z])(TT|TIKTOK)([^A-Z]|$)/.test(fallbackName)) return "tiktok"
  return null
}

export type CampaignDeliverySectionProps = {
  mbaNumber: string
  deliveryLineItemIds: string[]
  filterRange: DateRange
  brandColour?: string
  kpiTargets: KPITargetsMap
  campaignStart: string
  campaignEnd: string
  socialLineItems: SocialLineItem[]
  searchLineItemIds: string[]
  searchLineItems: unknown[]
  mpSearchEnabled: boolean
  progDisplayLineItems: unknown[]
  progVideoLineItems: unknown[]
}

type DeliveryBodyProps = {
  rows: CombinedPacingRow[]
  search: SearchPacingResponse | null
  loading: boolean
  error: string | null
  mbaNumber: string
  campaignStart: string
  campaignEnd: string
  filterRange: DateRange
  brandColour?: string
  kpiTargets: KPITargetsMap
  pacingWindow: ReturnType<typeof getPacingWindow>
  metaItems: SocialLineItem[]
  tiktokItems: SocialLineItem[]
  searchLineItems: unknown[]
  includeSearch: boolean
  progDisplayLineItems: unknown[]
  progVideoLineItems: unknown[]
}

function CampaignDeliveryBody({
  rows,
  search,
  loading,
  error,
  mbaNumber,
  campaignStart,
  campaignEnd,
  filterRange,
  brandColour,
  kpiTargets,
  pacingWindow,
  metaItems,
  tiktokItems,
  searchLineItems,
  includeSearch,
  progDisplayLineItems,
  progVideoLineItems,
}: DeliveryBodyProps) {
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!loading) setLastSyncedAt(new Date())
  }, [loading])

  const channels = useMemo((): ChannelSectionData[] => {
    const out: ChannelSectionData[] = []

    if (metaItems.length > 0) {
      out.push(
        buildSocialMetaSection({
          lineItems: metaItems,
          snowflakeRows: rows,
          campaignStart,
          campaignEnd,
          mbaNumber,
          kpiTargets,
          filterRange,
          brandColour,
          lastSyncedAt,
        }),
      )
    }

    if (tiktokItems.length > 0) {
      out.push(
        buildSocialTiktokSection({
          lineItems: tiktokItems,
          snowflakeRows: rows,
          campaignStart,
          campaignEnd,
          mbaNumber,
          kpiTargets,
          filterRange,
          brandColour,
          lastSyncedAt,
        }),
      )
    }

    if (includeSearch) {
      const s = buildSearchSection({
        searchLineItems,
        searchData: search,
        campaignStart,
        campaignEnd,
        filterRange,
        kpiTargets,
        pacingWindow,
        brandColour,
        lastSyncedAt,
      })
      if (s) out.push(s)
    }

    if (progDisplayLineItems.length > 0) {
      const s = buildProgrammaticDisplaySection({
        progDisplayLineItems,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        filterRange,
        kpiTargets,
        pacingWindow,
        brandColour,
        lastSyncedAt,
      })
      if (s) out.push(s)
    }

    if (progVideoLineItems.length > 0) {
      const s = buildProgrammaticVideoSection({
        progVideoLineItems,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        filterRange,
        kpiTargets,
        pacingWindow,
        brandColour,
        lastSyncedAt,
      })
      if (s) out.push(s)
    }

    return out
  }, [
    rows,
    search,
    metaItems,
    tiktokItems,
    includeSearch,
    progDisplayLineItems,
    progVideoLineItems,
    campaignStart,
    campaignEnd,
    filterRange,
    brandColour,
    kpiTargets,
    pacingWindow,
    mbaNumber,
    searchLineItems,
    lastSyncedAt,
  ])

  if (loading) {
    return <Skeleton className="h-[480px] w-full rounded-3xl" />
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <DeliveryContainer channels={channels} onRefresh={() => window.location.reload()} />
    </div>
  )
}

export function CampaignDeliverySection({
  mbaNumber,
  deliveryLineItemIds,
  filterRange,
  brandColour,
  kpiTargets,
  campaignStart,
  campaignEnd,
  socialLineItems,
  searchLineItemIds,
  searchLineItems,
  mpSearchEnabled,
  progDisplayLineItems,
  progVideoLineItems,
}: CampaignDeliverySectionProps) {
  const pacingWindow = useMemo(() => getPacingWindow(campaignStart, campaignEnd), [campaignStart, campaignEnd])

  const { metaItems, tiktokItems } = useMemo(() => {
    const meta: SocialLineItem[] = []
    const tiktok: SocialLineItem[] = []
    for (const item of socialLineItems) {
      const p = classifySocialPacingPlatform(item)
      if (p === "meta") meta.push(item)
      else if (p === "tiktok") tiktok.push(item)
    }
    return { metaItems: meta, tiktokItems: tiktok }
  }, [socialLineItems])

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
    const ids = metaItems.map(extractPacingLineItemIdFromItem).filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [metaItems, filterByPacingSet])

  const tiktokLineItemIds = useMemo(() => {
    const ids = tiktokItems.map(extractPacingLineItemIdFromItem).filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [tiktokItems, filterByPacingSet])

  const progDisplayLineItemIds = useMemo(() => {
    const ids = (progDisplayLineItems ?? [])
      .map(extractPacingLineItemIdFromItem)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [progDisplayLineItems, filterByPacingSet])

  const progVideoLineItemIds = useMemo(() => {
    const ids = (progVideoLineItems ?? [])
      .map(extractPacingLineItemIdFromItem)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [progVideoLineItems, filterByPacingSet])

  const normalizedSearchLineItemIds = useMemo(() => {
    const ids = (searchLineItemIds ?? [])
      .map((id) => cleanPacingLineItemId(id))
      .filter(Boolean) as string[]
    return Array.from(new Set(ids)).sort()
  }, [searchLineItemIds])

  const includeSearch = Boolean(
    mpSearchEnabled && normalizedSearchLineItemIds.length > 0 && campaignStart && campaignEnd,
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
      searchEnabled={includeSearch}
      searchLineItemIds={normalizedSearchLineItemIds}
    >
      {({ rows, search, loading, error }) => (
        <CampaignDeliveryBody
          rows={rows}
          search={search}
          loading={loading}
          error={error}
          mbaNumber={mbaNumber}
          campaignStart={campaignStart}
          campaignEnd={campaignEnd}
          filterRange={filterRange}
          brandColour={brandColour}
          kpiTargets={kpiTargets}
          pacingWindow={pacingWindow}
          metaItems={metaItems}
          tiktokItems={tiktokItems}
          searchLineItems={searchLineItems}
          includeSearch={includeSearch}
          progDisplayLineItems={progDisplayLineItems}
          progVideoLineItems={progVideoLineItems}
        />
      )}
    </DeliveryDataProvider>
  )
}
