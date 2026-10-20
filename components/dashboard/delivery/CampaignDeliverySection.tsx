"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import type { CampaignKPI } from "@/lib/kpi/types"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import { getMelbourneTodayISO, getPacingWindow } from "@/lib/pacing/pacingWindow"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"
import { classifySocialPacingPlatform } from "@/lib/pacing/social/classifySocialPacingPlatform"
import type { SocialLineItem } from "@/lib/delivery/social/socialChannelCompute"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { RelabelUnmappedHint } from "@/components/pacing/relabel/RelabelUnmappedHint"
import {
  channelCoverageBundle,
  type ChannelCoverageEntry,
} from "@/lib/delivery/channelCoverage"
import { channelExpectedForWindow } from "@/lib/spend/channelExpectedToDate"
import { assumedExpectedLinesForDelivery } from "@/lib/spend/assumedExpectedLines"
import { addLoadedDeliveryLineIds } from "@/lib/spend/deliveryLineIds"
import { deliveredByLineIdFromChannelSections } from "@/lib/delivery/ganttDeliveredByLineId"
import {
  buildKpiReviewGroups,
  indexLineDeliveryActuals,
  type KpiReviewGroup,
} from "@/lib/kpi/kpiReview"
import DeliveryDataProvider from "./DeliveryDataProvider"
import { DeliveryContainer } from "./DeliveryContainer"
import { buildProgrammaticDisplaySection } from "./channels/programmaticDisplayAdapter"
import { buildProgrammaticVideoSection } from "./channels/programmaticVideoAdapter"
import { buildProgrammaticOohSection } from "./channels/programmaticOohAdapter"
import { buildDigitalDisplaySection } from "./channels/digitalDisplayAdapter"
import { buildDigitalVideoSection } from "./channels/digitalVideoAdapter"
import { buildDigitalAudioSection } from "./channels/digitalAudioAdapter"
import { buildBvodSection } from "./channels/bvodAdapter"
import { buildSearchSection } from "./channels/searchAdapter"
import { buildSocialMetaSection } from "./channels/socialMetaAdapter"
import { buildSocialTiktokSection } from "./channels/socialTiktokAdapter"
import { buildSocialRedditSection } from "./channels/socialRedditAdapter"
import { buildAssumedSpendSection } from "./channels/assumedSpendAdapter"
import { buildPlanOnlyRemainderSection } from "./channels/planOnlyAdapter"
import type { ChannelSectionData } from "./channels/types"
import { fitSectionCharts } from "./channels/fitChartWindows"
import {
  applyConversionsToSection,
  campaignConversionSummary,
  campaignConversionSummaryKey,
  spendByLineFromDelivery,
  type CampaignConversionSummary,
  type DeliveryConversions,
} from "./channels/conversionTiles"
import {
  cleanPacingLineItemId,
  extractPacingLineItemIdFromItem,
} from "@/lib/pacing/delivery/lineItemIds"
import { partitionRedditDeliveryLines } from "@/lib/delivery/social/partitionRedditDeliveryLines"
import { partitionProgOohDeliveryLines } from "@/lib/delivery/programmatic/partitionProgOohDeliveryLines"
import {
  deliverySourceLookupKey,
  lookupActiveDeliverySource,
} from "@/lib/delivery/deliverySourceMap"
import type { FeePctsByVersionId } from "@/lib/delivery/directDigitalFeeLookup"
import { resolvePacingWindow } from "@/lib/pacing/expectedForWindow"

export type CampaignDeliverySectionProps = {
  mbaNumber: string
  deliveryLineItemIds: string[]
  filterRange: DateRange
  brandColour?: string
  kpiTargets: KPITargetsMap
  kpiVersionNumber: number
  lineItemTargets: Map<string, CampaignKPI>
  campaignStart: string
  campaignEnd: string
  socialLineItems: SocialLineItem[]
  searchLineItemIds: string[]
  searchLineItems: unknown[]
  mpSearchEnabled: boolean
  progDisplayLineItems: unknown[]
  progVideoLineItems: unknown[]
  progOohLineItems: unknown[]
  digitalDisplayLineItems: unknown[]
  digitalVideoLineItems: unknown[]
  digitalAudioLineItems: unknown[]
  bvodLineItems: unknown[]
  atlLineItems?: unknown[]
  deliverySchedule?: unknown
  campaignStartISO?: string | null
  campaignEndISO?: string | null
  asOfISO?: string | null
  onCoverage?: (entries: ChannelCoverageEntry[]) => void
  onKpiReviewGroups?: (groups: KpiReviewGroup[]) => void
  onDeliveredByLineId?: (map: Map<string, number>) => void
  /** Campaign conversions for the status strip; null when the client's switch is off. */
  onConversionSummary?: (summary: CampaignConversionSummary | null) => void
  showAccordion?: boolean
  isAdmin?: boolean
  feePctsByVersionId?: FeePctsByVersionId
  estimateVersionId?: number | null
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
  kpiVersionNumber: number
  lineItemTargets: Map<string, CampaignKPI>
  pacingWindow: ReturnType<typeof getPacingWindow>
  metaItems: SocialLineItem[]
  tiktokItems: SocialLineItem[]
  redditItems: SocialLineItem[]
  searchLineItems: unknown[]
  includeSearch: boolean
  progDisplayLineItems: unknown[]
  progVideoLineItems: unknown[]
  progOohLineItems: unknown[]
  digitalDisplayLineItems: unknown[]
  digitalVideoLineItems: unknown[]
  digitalAudioLineItems: unknown[]
  bvodLineItems: unknown[]
  atlLineItems: unknown[]
  deliverySchedule?: unknown
  campaignStartISO?: string | null
  campaignEndISO?: string | null
  asOfISO?: string | null
  remainderItems: unknown[]
  reportedSpendByLineDate?: Map<string, Map<string, number>>
  deliveryLineIds?: ReadonlySet<string>
  socialLineItems: SocialLineItem[]
  onCoverage?: (entries: ChannelCoverageEntry[]) => void
  onKpiReviewGroups?: (groups: KpiReviewGroup[]) => void
  onDeliveredByLineId?: (map: Map<string, number>) => void
  /** Campaign conversions for the status strip; null when the client's switch is off. */
  onConversionSummary?: (summary: CampaignConversionSummary | null) => void
  showAccordion?: boolean
  isAdmin?: boolean
  feePctsByVersionId?: FeePctsByVersionId
  estimateVersionId?: number | null
  /** Chosen conversions when the client's switch is on. */
  conversions?: DeliveryConversions | null
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
  kpiVersionNumber,
  lineItemTargets,
  pacingWindow,
  metaItems,
  tiktokItems,
  redditItems,
  searchLineItems,
  includeSearch,
  progDisplayLineItems,
  progVideoLineItems,
  progOohLineItems,
  digitalDisplayLineItems,
  digitalVideoLineItems,
  digitalAudioLineItems,
  bvodLineItems,
  atlLineItems,
  deliverySchedule,
  campaignStartISO,
  campaignEndISO,
  asOfISO,
  remainderItems,
  reportedSpendByLineDate,
  deliveryLineIds: loadedDeliveryLineIds,
  socialLineItems,
  onCoverage,
  onKpiReviewGroups,
  onDeliveredByLineId,
  onConversionSummary,
  showAccordion = true,
  isAdmin = false,
  feePctsByVersionId,
  estimateVersionId,
  conversions = null,
}: DeliveryBodyProps) {
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const deliveryLineIds = useMemo(() => {
    const ids = new Set(loadedDeliveryLineIds ?? [])
    addLoadedDeliveryLineIds(
      ids,
      rows.map((row) => ({
        lineItemId: row.lineItemId,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.amountSpent,
      })),
    )
    for (const line of search?.lineItems ?? []) {
      addLoadedDeliveryLineIds(ids, [
        {
          lineItemId: line.lineItemId,
          impressions: line.totals.impressions,
          clicks: line.totals.clicks,
          spend: line.totals.cost,
        },
      ])
    }
    return ids
  }, [loadedDeliveryLineIds, rows, search])

  useEffect(() => {
    if (!loading) setLastSyncedAt(new Date())
  }, [loading])

  // Conversion tiles and the strip count the pacing window (to Melbourne yesterday, filter aware).
  const conversionWindow = useMemo(
    () =>
      resolvePacingWindow({
        filterRange,
        campaignStartISO: campaignStart,
        campaignEndISO: campaignEnd,
      }),
    [filterRange, campaignStart, campaignEnd],
  )
  const conversionSpendByLine = useMemo(
    () =>
      conversions
        ? spendByLineFromDelivery({ rows, searchLines: search?.lineItems ?? [] })
        : new Map<string, never[]>(),
    [conversions, rows, search],
  )

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
          kpiVersionNumber,
          kpiTargets,
          lineItemTargets,
          filterRange,
          brandColour,
          lastSyncedAt,
          isAdmin,
          feePctsByVersionId,
          estimateVersionId,
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
          kpiVersionNumber,
          kpiTargets,
          lineItemTargets,
          filterRange,
          brandColour,
          lastSyncedAt,
          isAdmin,
          feePctsByVersionId,
          estimateVersionId,
        }),
      )
    }

    const { live: redditLive, awaiting: redditAwaiting } = partitionRedditDeliveryLines(
      redditItems,
      rows,
    )
    if (redditLive.length > 0) {
      out.push(
        buildSocialRedditSection({
          lineItems: redditLive,
          snowflakeRows: rows,
          campaignStart,
          campaignEnd,
          mbaNumber,
          kpiVersionNumber,
          kpiTargets,
          lineItemTargets,
          filterRange,
          brandColour,
          lastSyncedAt,
          isAdmin,
          feePctsByVersionId,
          estimateVersionId,
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
        mbaNumber,
        kpiVersionNumber,
        lineItemTargets,
        pacingWindow,
        brandColour,
        lastSyncedAt,
        isAdmin,
        feePctsByVersionId,
        estimateVersionId,
      })
      if (s) out.push(s)
    }

    if (progDisplayLineItems.length > 0) {
      const s = buildProgrammaticDisplaySection({
        progDisplayLineItems,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        mbaNumber,
        filterRange,
        kpiVersionNumber,
        kpiTargets,
        lineItemTargets,
        pacingWindow,
        brandColour,
        lastSyncedAt,
        reportedSpendByLineDate,
        isAdmin,
        feePctsByVersionId,
        estimateVersionId,
      })
      if (s) out.push(s)
    }

    if (progVideoLineItems.length > 0) {
      const s = buildProgrammaticVideoSection({
        progVideoLineItems,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        mbaNumber,
        filterRange,
        kpiVersionNumber,
        kpiTargets,
        lineItemTargets,
        pacingWindow,
        brandColour,
        lastSyncedAt,
        reportedSpendByLineDate,
        isAdmin,
        feePctsByVersionId,
        estimateVersionId,
      })
      if (s) out.push(s)
    }

    const { live: oohLive, awaiting: oohAwaiting } = partitionProgOohDeliveryLines(
      (progOohLineItems ?? []).filter((item) => {
        const rec = item as Record<string, unknown>
        return Boolean(lookupActiveDeliverySource(deliverySourceLookupKey(rec.publisher, rec.platform)))
      }),
      rows,
    )
    if (oohLive.length > 0) {
      const s = buildProgrammaticOohSection({
        progOohLineItems: oohLive,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        mbaNumber,
        filterRange,
        kpiVersionNumber,
        kpiTargets,
        lineItemTargets,
        pacingWindow,
        brandColour,
        lastSyncedAt,
        reportedSpendByLineDate,
        isAdmin,
        feePctsByVersionId,
        estimateVersionId,
      })
      if (s) out.push(s)
    }

    if (digitalDisplayLineItems.length > 0) {
      const s = buildDigitalDisplaySection({
        lineItems: digitalDisplayLineItems,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        mbaNumber,
        filterRange,
        kpiVersionNumber,
        lineItemTargets,
        brandColour,
        lastSyncedAt,
        reportedSpendByLineDate,
        isAdmin,
        feePctsByVersionId,
        estimateVersionId,
      })
      if (s) out.push(s)
    }

    if (digitalVideoLineItems.length > 0) {
      const s = buildDigitalVideoSection({
        lineItems: digitalVideoLineItems,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        mbaNumber,
        filterRange,
        kpiVersionNumber,
        lineItemTargets,
        brandColour,
        lastSyncedAt,
        reportedSpendByLineDate,
        isAdmin,
        feePctsByVersionId,
        estimateVersionId,
      })
      if (s) out.push(s)
    }

    if (digitalAudioLineItems.length > 0) {
      const s = buildDigitalAudioSection({
        lineItems: digitalAudioLineItems,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        mbaNumber,
        filterRange,
        kpiVersionNumber,
        lineItemTargets,
        brandColour,
        lastSyncedAt,
        reportedSpendByLineDate,
        isAdmin,
        feePctsByVersionId,
        estimateVersionId,
      })
      if (s) out.push(s)
    }

    if (bvodLineItems.length > 0) {
      const s = buildBvodSection({
        lineItems: bvodLineItems,
        combinedRows: rows,
        campaignStart,
        campaignEnd,
        mbaNumber,
        filterRange,
        kpiVersionNumber,
        lineItemTargets,
        brandColour,
        lastSyncedAt,
        reportedSpendByLineDate,
        isAdmin,
        feePctsByVersionId,
        estimateVersionId,
      })
      if (s) out.push(s)
    }

    const assumed = buildAssumedSpendSection({
      key: "assumed-spend",
      lineItems: atlLineItems,
      campaignStart,
      campaignEnd,
      lastSyncedAt,
      asOfDate: getMelbourneTodayISO(),
      window: resolvePacingWindow({
        filterRange,
        campaignStartISO: campaignStart,
        campaignEndISO: campaignEnd,
      }),
      feePctsByVersionId,
      estimateVersionId,
      deliveryLineIds,
    })
    if (assumed) out.push(assumed)

    const remainder = buildPlanOnlyRemainderSection({
      lineItems: [...remainderItems, ...redditAwaiting, ...oohAwaiting],
      campaignStart,
      campaignEnd,
      lastSyncedAt,
    })
    if (remainder) out.push(remainder)

    const todayISO = getMelbourneTodayISO()
    const fitted = out.map((section) => fitSectionCharts(section, { todayISO, filter: filterRange }))
    if (!conversions) return fitted
    return fitted.map((section) =>
      applyConversionsToSection(section, conversions, {
        window: conversionWindow,
        spendByLine: conversionSpendByLine,
      }),
    )
  }, [
    conversions,
    conversionWindow,
    conversionSpendByLine,
    rows,
    search,
    metaItems,
    tiktokItems,
    redditItems,
    includeSearch,
    progDisplayLineItems,
    progVideoLineItems,
    progOohLineItems,
    digitalDisplayLineItems,
    digitalVideoLineItems,
    digitalAudioLineItems,
    bvodLineItems,
    atlLineItems,
    remainderItems,
    campaignStart,
    campaignEnd,
    filterRange,
    brandColour,
    kpiTargets,
    kpiVersionNumber,
    lineItemTargets,
    pacingWindow,
    mbaNumber,
    searchLineItems,
    lastSyncedAt,
    reportedSpendByLineDate,
    deliveryLineIds,
    isAdmin,
    feePctsByVersionId,
    estimateVersionId,
  ])

  const { entries: coverage, kpiDrafts } = useMemo(
    () => {
      const asOf = asOfISO || getMelbourneTodayISO()
      const startISO = campaignStartISO || campaignStart
      const endISO = campaignEndISO || campaignEnd
      const pacing = resolvePacingWindow({
        filterRange,
        campaignStartISO: startISO,
        campaignEndISO: endISO,
      })
      const assumedLines = assumedExpectedLinesForDelivery({
        atlLineItems,
        digitalDisplayLineItems,
        digitalVideoLineItems,
        digitalAudioLineItems,
        bvodLineItems,
        progDisplayLineItems,
        progVideoLineItems,
        progOohLineItems,
        feePctsByVersionId,
        estimateVersionId,
        deliveryLineIds,
      })
      return channelCoverageBundle({
        buckets: {
          socialLineItems,
          searchLineItems,
          progDisplayLineItems,
          progVideoLineItems,
          progOohLineItems,
          digitalDisplayLineItems,
          digitalVideoLineItems,
          digitalAudioLineItems,
          bvodLineItems,
          offlineLineItems: atlLineItems,
        },
        sections: channels,
        todayISO: asOf,
        assumedLines,
        window: pacing,
        // Glance spend expected follows the same window as the cards:
        // to Melbourne yesterday, narrowed by the date filter.
        channelExpected: pacing.empty
          ? []
          : channelExpectedForWindow({
              deliverySchedule,
              campaignStartISO: startISO,
              campaignEndISO: endISO,
              assumedLines,
              windowStartISO: pacing.startISO,
              windowEndISO: pacing.endISO,
              periodSlice: pacing.startISO > startISO,
            }),
      })
    },
    [
      socialLineItems,
      searchLineItems,
      progDisplayLineItems,
      progVideoLineItems,
      progOohLineItems,
      digitalDisplayLineItems,
      digitalVideoLineItems,
      digitalAudioLineItems,
      bvodLineItems,
      atlLineItems,
      channels,
      deliverySchedule,
      campaignStartISO,
      campaignEndISO,
      campaignStart,
      campaignEnd,
      asOfISO,
      feePctsByVersionId,
      estimateVersionId,
      deliveryLineIds,
      filterRange,
    ],
  )

  const kpiReviewGroups = useMemo(
    () =>
      buildKpiReviewGroups({
        drafts: kpiDrafts,
        coverage,
        actualsByLineId: indexLineDeliveryActuals({
          pacingRows: rows,
          searchLineItems: search?.lineItems ?? [],
        }),
      }),
    [coverage, kpiDrafts, rows, search],
  )

  useEffect(() => {
    if (loading) return
    onCoverage?.(coverage)
  }, [coverage, loading, onCoverage])

  useEffect(() => {
    if (loading) return
    onKpiReviewGroups?.(kpiReviewGroups)
  }, [kpiReviewGroups, loading, onKpiReviewGroups])

  const deliveredByLineId = useMemo(
    () => deliveredByLineIdFromChannelSections(channels),
    [channels],
  )

  useEffect(() => {
    if (loading) return
    onDeliveredByLineId?.(deliveredByLineId)
  }, [deliveredByLineId, loading, onDeliveredByLineId])

  const conversionSummary = useMemo(
    () =>
      campaignConversionSummary(channels, conversions, {
        window: conversionWindow,
        spendByLine: conversionSpendByLine,
      }),
    [channels, conversions, conversionWindow, conversionSpendByLine],
  )
  const conversionSummaryKey = campaignConversionSummaryKey(conversionSummary)
  const conversionSummaryRef = useRef(conversionSummary)
  conversionSummaryRef.current = conversionSummary
  useEffect(() => {
    if (loading) return
    onConversionSummary?.(conversionSummaryRef.current)
  }, [conversionSummaryKey, loading, onConversionSummary])

  if (!showAccordion) return null

  if (loading) {
    return <LoadingState rows={6} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-3">
      {isAdmin ? <RelabelUnmappedHint mba={mbaNumber} /> : null}
      {error ? (
        <ErrorState title="Could not load delivery data" message={error} />
      ) : null}
      <DeliveryContainer
        channels={channels}
        mbaNumber={mbaNumber}
        onRefresh={() => window.location.reload()}
      />
    </div>
  )
}

export function CampaignDeliverySection({
  mbaNumber,
  deliveryLineItemIds,
  filterRange,
  brandColour,
  kpiTargets,
  kpiVersionNumber,
  lineItemTargets,
  campaignStart,
  campaignEnd,
  socialLineItems,
  searchLineItemIds,
  searchLineItems,
  mpSearchEnabled,
  progDisplayLineItems,
  progVideoLineItems,
  progOohLineItems,
  digitalDisplayLineItems,
  digitalVideoLineItems,
  digitalAudioLineItems,
  bvodLineItems,
  atlLineItems = [],
  deliverySchedule,
  campaignStartISO,
  campaignEndISO,
  asOfISO,
  onCoverage,
  onKpiReviewGroups,
  onDeliveredByLineId,
  onConversionSummary,
  showAccordion = true,
  isAdmin = false,
  feePctsByVersionId,
  estimateVersionId,
}: CampaignDeliverySectionProps) {
  const pacingWindow = useMemo(() => getPacingWindow(campaignStart, campaignEnd), [campaignStart, campaignEnd])

  const { metaItems, tiktokItems, redditItems, remainderSocialItems } = useMemo(() => {
    const meta: SocialLineItem[] = []
    const tiktok: SocialLineItem[] = []
    const reddit: SocialLineItem[] = []
    const remainder: SocialLineItem[] = []
    for (const item of socialLineItems) {
      const p = classifySocialPacingPlatform(item as Record<string, unknown>)
      if (p === "meta") meta.push(item)
      else if (p === "tiktok") tiktok.push(item)
      else if (p === "reddit") reddit.push(item)
      else remainder.push(item)
    }
    return {
      metaItems: meta,
      tiktokItems: tiktok,
      redditItems: reddit,
      remainderSocialItems: remainder,
    }
  }, [socialLineItems])

  const remainderProgItems = useMemo(() => {
    const out: unknown[] = []
    for (const item of [
      ...(progDisplayLineItems ?? []),
      ...(progVideoLineItems ?? []),
      ...(progOohLineItems ?? []),
    ]) {
      const rec = item as Record<string, unknown>
      const key = deliverySourceLookupKey(rec.publisher, rec.platform)
      if (!lookupActiveDeliverySource(key)) out.push(item)
    }
    return out
  }, [progDisplayLineItems, progVideoLineItems, progOohLineItems])

  const remainderItems = useMemo(
    () => [...remainderSocialItems, ...remainderProgItems],
    [remainderSocialItems, remainderProgItems],
  )

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

  const redditLineItemIds = useMemo(() => {
    const ids = redditItems.map(extractPacingLineItemIdFromItem).filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [redditItems, filterByPacingSet])

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

  const progOohLineItemIds = useMemo(() => {
    const ids = (progOohLineItems ?? [])
      .map(extractPacingLineItemIdFromItem)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [progOohLineItems, filterByPacingSet])

  const directDigitalLineItemIds = useMemo(() => {
    const ids = [
      ...(digitalDisplayLineItems ?? []),
      ...(digitalVideoLineItems ?? []),
      ...(digitalAudioLineItems ?? []),
      ...(bvodLineItems ?? []),
    ]
      .map(extractPacingLineItemIdFromItem)
      .filter(filterByPacingSet) as string[]
    return Array.from(new Set(ids)).sort()
  }, [
    digitalDisplayLineItems,
    digitalVideoLineItems,
    digitalAudioLineItems,
    bvodLineItems,
    filterByPacingSet,
  ])

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
      redditLineItemIds={redditLineItemIds}
      progDisplayLineItemIds={progDisplayLineItemIds}
      progVideoLineItemIds={progVideoLineItemIds}
      progOohLineItemIds={progOohLineItemIds}
      directDigitalLineItemIds={directDigitalLineItemIds}
      campaignStart={campaignStart}
      campaignEnd={campaignEnd}
      searchEnabled={includeSearch}
      searchLineItemIds={normalizedSearchLineItemIds}
    >
      {({ rows, search, loading, error, reportedSpendByLineDate, deliveryLineIds, conversions }) => (
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
          kpiVersionNumber={kpiVersionNumber}
          lineItemTargets={lineItemTargets}
          pacingWindow={pacingWindow}
          metaItems={metaItems}
          tiktokItems={tiktokItems}
          redditItems={redditItems}
          searchLineItems={searchLineItems}
          includeSearch={includeSearch}
          progDisplayLineItems={progDisplayLineItems}
          progVideoLineItems={progVideoLineItems}
          progOohLineItems={progOohLineItems}
          digitalDisplayLineItems={digitalDisplayLineItems}
          digitalVideoLineItems={digitalVideoLineItems}
          digitalAudioLineItems={digitalAudioLineItems}
          bvodLineItems={bvodLineItems}
          atlLineItems={atlLineItems}
          deliverySchedule={deliverySchedule}
          campaignStartISO={campaignStartISO}
          campaignEndISO={campaignEndISO}
          asOfISO={asOfISO}
          remainderItems={remainderItems}
          reportedSpendByLineDate={reportedSpendByLineDate}
          deliveryLineIds={deliveryLineIds}
          socialLineItems={socialLineItems}
          onCoverage={onCoverage}
          onKpiReviewGroups={onKpiReviewGroups}
          onDeliveredByLineId={onDeliveredByLineId}
          onConversionSummary={onConversionSummary}
          showAccordion={showAccordion}
          isAdmin={isAdmin}
          feePctsByVersionId={feePctsByVersionId}
          estimateVersionId={estimateVersionId}
          conversions={conversions}
        />
      )}
    </DeliveryDataProvider>
  )
}
