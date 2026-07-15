import type { BillingMonth } from "@/lib/billing/types"

export type PartialMbaValues = {
  mediaTotals: Record<string, number>
  grossMedia: number
  assembledFee: number
  adServing: number
  production: number
}

export type PartialApprovalLineItem = {
  lineItemId: string
  /** 1-based display index when derived from billing line item id suffix (…-0, …-1). */
  lineNumber?: number
  header1: string
  header2: string
  amount: number
}

export type PartialApprovalChannel = {
  mediaKey: string
  mediaType: string
  selectedLineItemIds: string[]
  selectedTotal: string
  fullChannelTotal: string
  selectedCount: number
  totalCount: number
}

export type PartialApprovalMetadata = {
  isPartial: boolean
  selectedMonthYears: string[]
  channels: PartialApprovalChannel[]
  totals: {
    grossMedia: string
    assembledFee: string
    adServing: string
    production: string
    totalInvestment: string
  }
  note: string
  updatedAt: string
}

export function parseCurrency(value: string | number | undefined | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const numeric = parseFloat(String(value).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(numeric) ? numeric : 0
}

/** Gross media only; excludes `production` — production is tracked separately on each month and in totals. */
function sumMediaTotalsExcludingProduction(mediaTotals: Record<string, number>): number {
  return Object.entries(mediaTotals).reduce(
    (acc, [k, v]) => (k === "production" ? acc : acc + v),
    0,
  )
}

/** True when at least one month has non-empty line item arrays (real breakdown, not empty object). */
export function billingMonthsHaveDetailedLineItems(months: BillingMonth[] | undefined): boolean {
  if (!months?.length) return false
  return months.some(
    (m) =>
      m.lineItems &&
      Object.values(m.lineItems).some((arr) => Array.isArray(arr) && arr.length > 0),
  )
}

function inferLineNumberFromBillingLineItemId(id: string): number | undefined {
  const m = String(id).match(/-(\d+)$/)
  if (!m) return undefined
  return Number(m[1]) + 1
}

export function computePartialMbaOverridesFromDeliveryMonths(params: {
  deliveryMonths: BillingMonth[]
  selectedMonthYears: readonly string[]
  mediaKeys: readonly string[]
  enabledMedia?: Record<string, boolean>
}): PartialMbaValues {
  const { deliveryMonths, selectedMonthYears, mediaKeys, enabledMedia } = params

  const selectedSet = new Set(selectedMonthYears)
  const selected = selectedMonthYears.length
    ? deliveryMonths.filter((m) => selectedSet.has(m.monthYear))
    : deliveryMonths

  const mediaTotals: Record<string, number> = {}
  for (const key of mediaKeys) {
    let sum = 0
    for (const month of selected) {
      sum += parseCurrency(month.mediaCosts?.[key as keyof typeof month.mediaCosts] as any)
    }
    if (enabledMedia && enabledMedia[key] === false) sum = 0
    mediaTotals[key] = sum
  }

  const grossMedia = sumMediaTotalsExcludingProduction(mediaTotals)
  const assembledFee = selected.reduce((acc, m) => acc + parseCurrency(m.feeTotal), 0)
  const adServing = selected.reduce((acc, m) => acc + parseCurrency(m.adservingTechFees), 0)
  const production = selected.reduce((acc, m) => acc + parseCurrency(m.production), 0)

  return { mediaTotals, grossMedia, assembledFee, adServing, production }
}

function money(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function computeLineItemTotalsFromDeliveryMonths(params: {
  deliveryMonths: BillingMonth[]
  selectedMonthYears: readonly string[]
}): Record<string, Record<string, PartialApprovalLineItem>> {
  const { deliveryMonths, selectedMonthYears } = params
  const selectedSet = new Set(selectedMonthYears)
  const selected = selectedMonthYears.length
    ? deliveryMonths.filter((m) => selectedSet.has(m.monthYear))
    : deliveryMonths

  const result: Record<string, Record<string, PartialApprovalLineItem>> = {}
  for (const month of selected) {
    const lineItems = month.lineItems ?? {}
    for (const [mediaKey, items] of Object.entries(lineItems)) {
      if (!result[mediaKey]) result[mediaKey] = {}
      for (const item of items ?? []) {
        const id = String(item.id ?? "").trim()
        if (!id) continue
        const amount = parseCurrency(item.monthlyAmounts?.[month.monthYear] ?? 0)
        if (!result[mediaKey][id]) {
          result[mediaKey][id] = {
            lineItemId: id,
            lineNumber: inferLineNumberFromBillingLineItemId(id),
            header1: String(item.header1 ?? ""),
            header2: String(item.header2 ?? ""),
            amount: 0,
          }
        }
        result[mediaKey][id].amount += amount
      }
    }
  }
  return result
}

/**
 * Builds partial-MBA UI values + metadata from **precomputed** campaign financials
 * (approved subset already applied via LineItemInput.approval).
 * Does not scale fee/ad-serving by media ratio — money comes from core only.
 */
export function recomputePartialMbaFromSelections(params: {
  /** Core result for the current approval selection. */
  financials: {
    mbaScopeTotals: {
      grossMedia: number
      fee: number
      adServing: number
      production: number
      nettExGst: number
    }
    perLine: Array<{
      mediaType: string
      media: number
      flags: { excluded: boolean }
    }>
  }
  deliveryMonthsForLineItems: BillingMonth[]
  selectedMonthYears: readonly string[]
  selectedLineItemIdsByMedia: Record<string, string[]>
  mediaLabelByKey: Record<string, string>
  formatCurrency: (n: number) => string
}): {
  values: PartialMbaValues
  lineItemsByMedia: Record<string, PartialApprovalLineItem[]>
  metadata: PartialApprovalMetadata
} {
  const {
    financials,
    deliveryMonthsForLineItems,
    selectedMonthYears,
    selectedLineItemIdsByMedia,
    mediaLabelByKey,
    formatCurrency,
  } = params

  const lineItemsMap = computeLineItemTotalsFromDeliveryMonths({
    deliveryMonths: deliveryMonthsForLineItems,
    selectedMonthYears,
  })

  const channels = computePartialApprovalChannels({
    mediaLabelByKey,
    lineItemsByMedia: lineItemsMap,
    selectedLineItemIdsByMedia,
  })

  const mediaTotals: Record<string, number> = {}
  for (const line of financials.perLine) {
    if (line.flags.excluded) continue
    mediaTotals[line.mediaType] = (mediaTotals[line.mediaType] ?? 0) + line.media
  }
  // Prefer channel selected totals when line-item breakdown exists (matches UI checkboxes).
  for (const channel of channels) {
    if (Object.keys(lineItemsMap[channel.mediaKey] ?? {}).length > 0) {
      mediaTotals[channel.mediaKey] = parseCurrency(channel.selectedTotal)
    }
  }

  const t = financials.mbaScopeTotals
  const values: PartialMbaValues = {
    mediaTotals,
    grossMedia: t.grossMedia,
    assembledFee: t.fee,
    adServing: t.adServing,
    production: t.production,
  }

  const lineItemsByMedia = Object.fromEntries(
    Object.entries(lineItemsMap).map(([k, v]) => [k, Object.values(v)]),
  )

  const metadata: PartialApprovalMetadata = {
    isPartial: true,
    selectedMonthYears: [...selectedMonthYears],
    channels,
    totals: {
      grossMedia: formatCurrency(values.grossMedia),
      assembledFee: formatCurrency(values.assembledFee),
      adServing: formatCurrency(values.adServing),
      production: formatCurrency(values.production),
      totalInvestment: formatCurrency(t.nettExGst),
    },
    note: buildPartialApprovalNote(channels, [...selectedMonthYears]),
    updatedAt: new Date().toISOString(),
  }

  return { values, lineItemsByMedia, metadata }
}

/** Restore partial MBA UI state from metadata stored on the billing schedule. */
export function hydratePartialMbaFromSavedMetadata(meta: PartialApprovalMetadata): {
  partialMBAValues: PartialMbaValues
  partialMBAMonthYears: string[]
  partialMBASelectedLineItemIds: Record<string, string[]>
  partialMBAMediaEnabled: Record<string, boolean>
} {
  const partialMBAValues: PartialMbaValues = {
    mediaTotals: {},
    grossMedia: parseCurrency(meta.totals?.grossMedia),
    assembledFee: parseCurrency(meta.totals?.assembledFee),
    adServing: parseCurrency(meta.totals?.adServing),
    production: parseCurrency(meta.totals?.production),
  }
  ;(meta.channels ?? []).forEach((c) => {
    partialMBAValues.mediaTotals[c.mediaKey] = parseCurrency(c.selectedTotal)
  })

  const partialMBASelectedLineItemIds: Record<string, string[]> = {}
  const partialMBAMediaEnabled: Record<string, boolean> = {}
  ;(meta.channels ?? []).forEach((c) => {
    partialMBASelectedLineItemIds[c.mediaKey] = [...(c.selectedLineItemIds ?? [])]
    partialMBAMediaEnabled[c.mediaKey] = (c.selectedLineItemIds?.length ?? 0) > 0
  })

  return {
    partialMBAValues,
    partialMBAMonthYears: [...(meta.selectedMonthYears ?? [])],
    partialMBASelectedLineItemIds,
    partialMBAMediaEnabled,
  }
}

export function computePartialApprovalChannels(params: {
  mediaLabelByKey: Record<string, string>
  lineItemsByMedia: Record<string, Record<string, PartialApprovalLineItem>>
  selectedLineItemIdsByMedia: Record<string, string[]>
}): PartialApprovalChannel[] {
  const { mediaLabelByKey, lineItemsByMedia, selectedLineItemIdsByMedia } = params
  return Object.entries(lineItemsByMedia).map(([mediaKey, itemsById]) => {
    const allItems = Object.values(itemsById)
    const allIds = allItems.map((item) => item.lineItemId)
    const selectedSet = new Set(selectedLineItemIdsByMedia[mediaKey] ?? allIds)
    const selectedItems = allItems.filter((item) => selectedSet.has(item.lineItemId))
    const selectedTotal = selectedItems.reduce((sum, item) => sum + item.amount, 0)
    const fullTotal = allItems.reduce((sum, item) => sum + item.amount, 0)
    return {
      mediaKey,
      mediaType: mediaLabelByKey[mediaKey] ?? mediaKey,
      selectedLineItemIds: selectedItems.map((item) => item.lineItemId),
      selectedTotal: money(selectedTotal),
      fullChannelTotal: money(fullTotal),
      selectedCount: selectedItems.length,
      totalCount: allItems.length,
    }
  })
}

export function buildPartialApprovalNote(channels: PartialApprovalChannel[], selectedMonthYears: string[]): string {
  const changed = channels.filter((c) => c.selectedCount !== c.totalCount)
  if (changed.length === 0) {
    return `Partial approval set for ${selectedMonthYears.length} month(s). No line-item exclusions applied.`
  }
  const channelSummary = changed
    .map((c) => `${c.mediaType}: ${c.selectedCount}/${c.totalCount}`)
    .join(", ")
  return `Partial approval updated (${selectedMonthYears.length} month(s)). Changed channels: ${channelSummary}.`
}

export function appendPartialApprovalToBillingSchedule<T extends Record<string, any>>(params: {
  billingSchedule: T[]
  metadata: PartialApprovalMetadata | null
}): T[] {
  const { billingSchedule, metadata } = params
  if (!Array.isArray(billingSchedule) || billingSchedule.length === 0) return billingSchedule
  if (!metadata?.isPartial) {
    return billingSchedule.map((entry) => {
      if (!entry || typeof entry !== "object") return entry
      const { partialApproval, ...rest } = entry as any
      return rest as T
    })
  }
  return billingSchedule.map((entry) => ({
    ...entry,
    partialApproval: metadata,
  }))
}

