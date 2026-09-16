"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import type { CampaignKPI } from "@/lib/kpi/types"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import { getMelbourneTodayISO, getPacingWindow } from "@/lib/pacing/pacingWindow"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"
import { classifySocialPacingPlatform } from "@/lib/pacing/social/classifySocialPacingPlatform"
import type { SocialLineItem } from "@/lib/delivery/social/socialChannelCompute"
import { ErrorState, LoadingState } from "@/components/ui/states"
import {
  channelCoverageBundle,
  type ChannelCoverageEntry,
} from "@/lib/delivery/channelCoverage"
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
import { buildPlanOnlyRemainderSection } from "./channels/planOnlyAdapter"
import type { ChannelSectionData } from "./channels/types"
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
  onCoverage?: (entries: ChannelCoverageEntry[]) => void
  onKpiReviewGroups?: (groups: KpiReviewGroup[]) => void
  onDeliveredByLineId?: (map: Map<string, number>) => void
  showAccordion?: boolean
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
  remainderItems: unknown[]
  reportedSpendByLineDate?: Map<string, Map<string, number>>
  socialLineItems: SocialLineItem[]
  onCoverage?: (entries: ChannelCoverageEntry[]) => void
  onKpiReviewGroups?: (groups: KpiReviewGroup[]) => void
  onDeliveredByLineId?: (map: Map<string, number>) => void
  showAccordion?: boolean
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
  remainderItems,
  reportedSpendByLineDate,
  socialLineItems,
  onCoverage,
  onKpiReviewGroups,
  onDeliveredByLineId,
  showAccordion = true,
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
          kpiVersionNumber,
          kpiTargets,
          lineItemTargets,
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
          kpiVersionNumber,
          kpiTargets,
          lineItemTargets,
          filterRange,
          brandColour,
          lastSyncedAt,
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
      })
      if (s) out.push(s)
    }

    const remainder = buildPlanOnlyRemainderSection({
      lineItems: [...remainderItems, ...redditAwaiting, ...oohAwaiting],
      campaignStart,
      campaignEnd,
      lastSyncedAt,
    })
    if (remainder) out.push(remainder)

    return out
  }, [
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
  ])

  const { entries: coverage, kpiDrafts } = useMemo(
    () =>
      channelCoverageBundle({
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
        },
        sections: channels,
        todayISO: getMelbourneTodayISO(),
      }),
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
      channels,
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

  if (!showAccordion) return null

  if (loading) {
    return <LoadingState rows={6} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-3">
      {error ? (
        <ErrorState title="Could not load delivery data" message={error} />
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
  onCoverage,
  onKpiReviewGroups,
  onDeliveredByLineId,
  showAccordion = true,
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
      {({ rows, search, loading, error, reportedSpendByLineDate }) => (
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
          remainderItems={remainderItems}
          reportedSpendByLineDate={reportedSpendByLineDate}
          socialLineItems={socialLineItems}
          onCoverage={onCoverage}
          onKpiReviewGroups={onKpiReviewGroups}
          onDeliveredByLineId={onDeliveredByLineId}
          showAccordion={showAccordion}
        />
      )}
    </DeliveryDataProvider>
  )
}
