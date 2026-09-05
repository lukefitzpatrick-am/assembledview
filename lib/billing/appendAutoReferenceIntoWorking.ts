/**
 * MB-30 — append-only merge of burst-derived auto template into workingBillingMonths.
 *
 * Extracted from the MBA edit page so the add-channel / override path can be tested
 * without mounting the editor. Call sites on the edit page:
 * - calculateBillingSchedule (follow-auto resync)
 * - billing append useEffect (new months / media keys / line ids)
 *
 * Matching MUST use billingOverrideLineIdsMatch (bare ↔ billing-{media}::). Strict
 * === or Set.has on raw ids reintroduces the PENFOLD016 double-count class.
 */

import { shouldResyncBillingLineFromAuto } from "@/lib/billing/applyBillingLineMode"
import {
  computeAppendNewMediaTypeBucket,
} from "@/lib/billing/appendNewMediaTypeBucket"
import {
  dedupeBillingLineItemsByCanonicalId,
  type CanonicalBillingLineCollapse,
} from "@/lib/billing/dedupeWorkingBillingCanonicalLines"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { billingOverrideLineIdsMatch } from "@/lib/finance/manualBillingOverridesUi"

export type AppendIntoWorkingOpts = {
  isManualBilling?: boolean
  resyncExistingFromTemplate?: boolean
  /** MB-30 loud guard — fired when merge collapses same-canonical duplicates. */
  onCanonicalDedupe?: (
    collapses: Array<CanonicalBillingLineCollapse & { mediaKey: string; monthYear: string }>
  ) => void
}

function cloneBillingMonthGraph<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

function billingLineItemIdKey(id: unknown): string {
  return String(id ?? "").trim()
}

function parseBucketMoney(val: unknown): number {
  return parseFloat(String(val ?? "$0").replace(/[^0-9.-]/g, "")) || 0
}

/** Ensure every campaign month key exists on a new template line item. */
export function seedLineItemMonthKeysFromTemplate(
  templateLi: BillingLineItem,
  allCampaignMonthKeys: string[]
): BillingLineItem {
  const li = cloneBillingMonthGraph(templateLi)
  const monthlyAmounts: Record<string, number> = { ...li.monthlyAmounts }
  for (const k of allCampaignMonthKeys) {
    if (!(k in monthlyAmounts)) monthlyAmounts[k] = 0
  }
  li.monthlyAmounts = monthlyAmounts
  li.totalAmount = Object.values(monthlyAmounts).reduce((s, v) => s + (v || 0), 0)
  return li
}

function resyncExistingLineItemFromTemplate(
  existing: BillingLineItem,
  tLi: BillingLineItem,
  allCampaignMonthKeys: string[]
) {
  const seeded = seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys)
  const preserveId = existing.id
  const preserveLegacy = existing.legacySaved
  const preserveBillingMode = existing.billingMode
  Object.assign(existing, seeded)
  existing.id = preserveId
  if (preserveLegacy) existing.legacySaved = true
  if (preserveBillingMode) existing.billingMode = preserveBillingMode
  existing.preBill = false
  existing.preBillSnapshot = undefined
}

/**
 * Append line items that appear in the auto template but not in working for this media type.
 * Identity: billingOverrideLineIdsMatch only (MB-4 / MB-11 / MB-30).
 */
export function appendMissingLineItemsOnly(
  existingItems: BillingLineItem[],
  templateItems: BillingLineItem[],
  allCampaignMonthKeys: string[],
  opts?: AppendIntoWorkingOpts
): { list: BillingLineItem[]; didAppend: boolean; collapses: CanonicalBillingLineCollapse[] } {
  const resync = Boolean(opts?.resyncExistingFromTemplate)
  const isManualBilling = Boolean(opts?.isManualBilling)
  const list = existingItems.map((li) => cloneBillingMonthGraph(li))
  const findExisting = (candidateId: string) =>
    list.find((li) => billingOverrideLineIdsMatch(String(li.id ?? ""), candidateId))
  let didAppend = false
  // Single-line scheme-drift reconcile (not bare↔decorated — that is already unified).
  const singleLineSchemeDrift =
    existingItems.length === 1 &&
    templateItems.length === 1 &&
    !billingOverrideLineIdsMatch(
      String(existingItems[0]?.id ?? ""),
      String(templateItems[0]?.id ?? "")
    )
  for (const tLi of templateItems) {
    const tid = billingLineItemIdKey(tLi.id)
    if (!tid) continue
    const existing = findExisting(tid)
    if (existing) {
      const shouldResync = shouldResyncBillingLineFromAuto(existing, isManualBilling)
      if (resync && shouldResync) {
        resyncExistingLineItemFromTemplate(existing, tLi, allCampaignMonthKeys)
        didAppend = true
      } else if (shouldResync && existing.totalAmount === 0 && tLi.totalAmount > 0) {
        const seeded = seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys)
        existing.monthlyAmounts = seeded.monthlyAmounts
        existing.totalAmount = seeded.totalAmount
        if (seeded.feeMonthlyAmounts) existing.feeMonthlyAmounts = seeded.feeMonthlyAmounts
        if (seeded.totalFeeAmount != null) existing.totalFeeAmount = seeded.totalFeeAmount
        if (seeded.adServingMonthlyAmounts) {
          existing.adServingMonthlyAmounts = seeded.adServingMonthlyAmounts
        }
        if (seeded.totalAdServingAmount != null) {
          existing.totalAdServingAmount = seeded.totalAdServingAmount
        }
        didAppend = true
      }
      continue
    }
    if (singleLineSchemeDrift) {
      const only = list[0]
      if (only) {
        const shouldResync = shouldResyncBillingLineFromAuto(only, isManualBilling)
        if (resync && shouldResync) {
          resyncExistingLineItemFromTemplate(only, tLi, allCampaignMonthKeys)
        } else if (shouldResync && only.totalAmount === 0 && tLi.totalAmount > 0) {
          const seeded = seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys)
          only.monthlyAmounts = seeded.monthlyAmounts
          only.totalAmount = seeded.totalAmount
          if (seeded.feeMonthlyAmounts) only.feeMonthlyAmounts = seeded.feeMonthlyAmounts
          if (seeded.totalFeeAmount != null) only.totalFeeAmount = seeded.totalFeeAmount
          if (seeded.adServingMonthlyAmounts) {
            only.adServingMonthlyAmounts = seeded.adServingMonthlyAmounts
          }
          if (seeded.totalAdServingAmount != null) {
            only.totalAdServingAmount = seeded.totalAdServingAmount
          }
        }
        only.id = tLi.id
        didAppend = true
        continue
      }
    }
    list.push(seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys))
    didAppend = true
  }
  // MB-30 loud guard: collapse same-canonical duplicates (does not fix distinct canons).
  const { list: deduped, collapses } = dedupeBillingLineItemsByCanonicalId(list)
  if (collapses.length > 0) didAppend = true
  return { list: deduped, didAppend, collapses }
}

function appendMissingMediaTypesOnly(
  templateItems: BillingLineItem[],
  allCampaignMonthKeys: string[]
): BillingLineItem[] {
  return templateItems.map((tLi) => seedLineItemMonthKeysFromTemplate(tLi, allCampaignMonthKeys))
}

function recomputeFullMonthFromLineItems(row: BillingMonth, formatter: Intl.NumberFormat) {
  if (!row.mediaCosts) row.mediaCosts = {} as BillingMonth["mediaCosts"]
  const mc = row.mediaCosts as Record<string, string>
  let mediaSumExcludingProduction = 0
  if (row.lineItems) {
    for (const mk of Object.keys(row.lineItems)) {
      const lis = row.lineItems[mk as keyof typeof row.lineItems] as BillingLineItem[]
      if (!lis?.length) continue
      const sum = lis.reduce((s, li) => s + (li.monthlyAmounts[row.monthYear] || 0), 0)
      const formatted = formatter.format(sum)
      mc[mk] = formatted
      if (mk === "production") {
        row.production = formatted
      }
      if (mk !== "production") mediaSumExcludingProduction += sum
    }
  }
  const feeTotal = parseBucketMoney(row.feeTotal)
  const adServingTotal = parseBucketMoney(row.adservingTechFees)
  const productionTotal = parseBucketMoney(row.production)
  row.mediaTotal = formatter.format(mediaSumExcludingProduction)
  row.totalAmount = formatter.format(
    mediaSumExcludingProduction + feeTotal + adServingTotal + productionTotal
  )
}

function incrementMonthTotalsForNewEntries(
  row: BillingMonth,
  opts: { deltaNonProductionMedia: number; deltaAppliedToTotal: number },
  formatter: Intl.NumberFormat
) {
  const { deltaNonProductionMedia, deltaAppliedToTotal } = opts
  if (deltaNonProductionMedia === 0 && deltaAppliedToTotal === 0) return

  if (deltaNonProductionMedia !== 0) {
    const prevMedia = parseBucketMoney(row.mediaTotal)
    row.mediaTotal = formatter.format(prevMedia + deltaNonProductionMedia)
  }
  if (deltaAppliedToTotal !== 0) {
    const prevTotal = parseBucketMoney(row.totalAmount)
    row.totalAmount = formatter.format(prevTotal + deltaAppliedToTotal)
  }
}

/**
 * Working month has no line items for this media key: insert template lines and set the bucket.
 */
export function appendNewMediaTypeIntoWorkingMonth(
  base: BillingMonth,
  mediaKey: string,
  templateItems: BillingLineItem[],
  allCampaignMonthKeys: string[],
  formatter: Intl.NumberFormat
): { bucketDelta: number; mediaKey: string } | null {
  if (!templateItems.length) return null

  if (!base.lineItems) base.lineItems = {}
  if (!base.mediaCosts) base.mediaCosts = {} as BillingMonth["mediaCosts"]

  const priorBucket = parseBucketMoney((base.mediaCosts as Record<string, string>)[mediaKey])
  const seeded = appendMissingMediaTypesOnly(templateItems, allCampaignMonthKeys)
  ;(base.lineItems as Record<string, BillingLineItem[]>)[mediaKey] = seeded

  const sumNewLines = templateItems.reduce(
    (s, t) => s + (t.monthlyAmounts[base.monthYear] || 0),
    0
  )
  const { nextBucket, bucketDelta } = computeAppendNewMediaTypeBucket(priorBucket, sumNewLines)
  ;(base.mediaCosts as Record<string, string>)[mediaKey] = formatter.format(nextBucket)

  return { bucketDelta, mediaKey }
}

function appendMissingMonthsOnly(
  oldMonths: BillingMonth[],
  templateMonths: BillingMonth[]
): BillingMonth[] {
  const oldByKey = new Map(oldMonths.map((m) => [m.monthYear, m]))
  return templateMonths.map((t) => {
    const prev = oldByKey.get(t.monthYear)
    if (prev) return cloneBillingMonthGraph(prev)
    return cloneBillingMonthGraph(t)
  })
}

/**
 * Merge auto template into an existing saved month (append-only unless resync).
 */
export function mergeAppendIntoExistingMonth(
  base: BillingMonth,
  templateRow: BillingMonth,
  allCampaignMonthKeys: string[],
  formatter: Intl.NumberFormat,
  opts?: AppendIntoWorkingOpts
): BillingMonth {
  const resync = Boolean(opts?.resyncExistingFromTemplate)
  const templateMediaKeys = templateRow.lineItems
    ? Object.keys(templateRow.lineItems).filter((mk) => {
        const arr = templateRow.lineItems![mk as keyof typeof templateRow.lineItems] as
          | BillingLineItem[]
          | undefined
        return Array.isArray(arr) && arr.length > 0
      })
    : []

  if (templateMediaKeys.length === 0) {
    return base
  }

  if (resync) {
    if (!base.lineItems) base.lineItems = {}
    if (!base.mediaCosts) base.mediaCosts = {} as BillingMonth["mediaCosts"]

    const collapseBatch: Array<
      CanonicalBillingLineCollapse & { mediaKey: string; monthYear: string }
    > = []

    for (const mk of templateMediaKeys) {
      const templateItems =
        (templateRow.lineItems![mk as keyof typeof templateRow.lineItems] as BillingLineItem[]) ??
        []
      const existingItems =
        (base.lineItems![mk as keyof typeof base.lineItems] as BillingLineItem[] | undefined) ??
        []

      if (existingItems.length === 0) {
        appendNewMediaTypeIntoWorkingMonth(base, mk, templateItems, allCampaignMonthKeys, formatter)
      } else {
        const { list, collapses } = appendMissingLineItemsOnly(
          existingItems,
          templateItems,
          allCampaignMonthKeys,
          {
            isManualBilling: opts?.isManualBilling,
            resyncExistingFromTemplate: true,
          }
        )
        ;(base.lineItems as Record<string, BillingLineItem[]>)[mk] = list
        for (const c of collapses) {
          collapseBatch.push({ ...c, mediaKey: mk, monthYear: base.monthYear })
        }
      }
    }

    base.feeTotal = templateRow.feeTotal
    base.adservingTechFees = templateRow.adservingTechFees
    base.production = templateRow.production ?? base.production
    if (base.mediaCosts && templateRow.mediaCosts?.production !== undefined) {
      base.mediaCosts.production = templateRow.mediaCosts.production
    }
    recomputeFullMonthFromLineItems(base, formatter)
    if (collapseBatch.length > 0) opts?.onCanonicalDedupe?.(collapseBatch)
    return base
  }

  if (!base.lineItems) base.lineItems = {}
  if (!base.mediaCosts) base.mediaCosts = {} as BillingMonth["mediaCosts"]

  let deltaNonProductionMedia = 0
  let deltaAppliedToTotal = 0
  const collapseBatch: Array<
    CanonicalBillingLineCollapse & { mediaKey: string; monthYear: string }
  > = []

  for (const mk of templateMediaKeys) {
    const templateItems =
      (templateRow.lineItems![mk as keyof typeof templateRow.lineItems] as BillingLineItem[]) ?? []
    const existingItems =
      (base.lineItems![mk as keyof typeof base.lineItems] as BillingLineItem[] | undefined) ?? []

    if (existingItems.length === 0) {
      const added = appendNewMediaTypeIntoWorkingMonth(
        base,
        mk,
        templateItems,
        allCampaignMonthKeys,
        formatter
      )
      if (added && added.bucketDelta !== 0) {
        deltaAppliedToTotal += added.bucketDelta
        if (added.mediaKey !== "production") deltaNonProductionMedia += added.bucketDelta
      }
    } else {
      const priorBucket = parseBucketMoney((base.mediaCosts as Record<string, string>)[mk])
      const { list, didAppend, collapses } = appendMissingLineItemsOnly(
        existingItems,
        templateItems,
        allCampaignMonthKeys,
        { isManualBilling: opts?.isManualBilling }
      )
      for (const c of collapses) {
        collapseBatch.push({ ...c, mediaKey: mk, monthYear: base.monthYear })
      }
      if (didAppend) {
        ;(base.lineItems as Record<string, BillingLineItem[]>)[mk] = list
        const newBucket = list.reduce((s, li) => s + (li.monthlyAmounts[base.monthYear] || 0), 0)
        const delta = newBucket - priorBucket
        if (delta !== 0) {
          ;(base.mediaCosts as Record<string, string>)[mk] = formatter.format(newBucket)
          deltaAppliedToTotal += delta
          if (mk !== "production") deltaNonProductionMedia += delta
        }
      }
    }
  }

  const isZeroOrEmpty = (s: unknown) => parseBucketMoney(s) === 0

  if (isZeroOrEmpty(base.feeTotal) && !isZeroOrEmpty(templateRow.feeTotal)) {
    const add = parseBucketMoney(templateRow.feeTotal)
    base.feeTotal = templateRow.feeTotal
    deltaAppliedToTotal += add
  }

  if (isZeroOrEmpty(base.adservingTechFees) && !isZeroOrEmpty(templateRow.adservingTechFees)) {
    const add = parseBucketMoney(templateRow.adservingTechFees)
    base.adservingTechFees = templateRow.adservingTechFees
    deltaAppliedToTotal += add
  }

  if (isZeroOrEmpty(base.production) && !isZeroOrEmpty(templateRow.production)) {
    const add = parseBucketMoney(templateRow.production)
    base.production = templateRow.production
    if (base.mediaCosts && templateRow.mediaCosts?.production !== undefined) {
      base.mediaCosts.production = templateRow.mediaCosts.production
    }
    deltaAppliedToTotal += add
  }

  if (deltaNonProductionMedia !== 0 || deltaAppliedToTotal !== 0) {
    incrementMonthTotalsForNewEntries(
      base,
      { deltaNonProductionMedia, deltaAppliedToTotal },
      formatter
    )
  }
  if (collapseBatch.length > 0) opts?.onCanonicalDedupe?.(collapseBatch)
  return base
}

/**
 * Append-only: working is authoritative. Template supplies new months / media keys / line ids.
 */
export function appendAutoLineItemTemplateIntoWorking(
  workingMonths: BillingMonth[],
  templateWithLineItems: BillingMonth[],
  formatter: Intl.NumberFormat,
  opts?: AppendIntoWorkingOpts
): BillingMonth[] {
  if (!templateWithLineItems.length) return workingMonths

  const oldByKey = new Map(workingMonths.map((m) => [m.monthYear, m]))
  const allCampaignMonthKeys = templateWithLineItems.map((m) => m.monthYear)
  const combinedRows = appendMissingMonthsOnly(workingMonths, templateWithLineItems)
  const allCollapses: Array<
    CanonicalBillingLineCollapse & { mediaKey: string; monthYear: string }
  > = []
  const mergeOpts: AppendIntoWorkingOpts = {
    ...opts,
    onCanonicalDedupe: (batch) => {
      allCollapses.push(...batch)
      opts?.onCanonicalDedupe?.(batch)
    },
  }

  const result = combinedRows.map((row, i) => {
    const tRow = templateWithLineItems[i]!
    if (!oldByKey.has(tRow.monthYear)) {
      const fresh = cloneBillingMonthGraph(row)
      recomputeFullMonthFromLineItems(fresh, formatter)
      return fresh
    }
    return mergeAppendIntoExistingMonth(row, tRow, allCampaignMonthKeys, formatter, mergeOpts)
  })

  if (allCollapses.length > 0) {
    const templateProgBvodIds = (
      (templateWithLineItems[0]?.lineItems?.progBvod as BillingLineItem[] | undefined) ?? []
    ).map((li) => String(li.id ?? ""))
    console.warn("[MB-30] canonical dedupe collapsed working billing lines", {
      collapses: allCollapses,
      templateProgBvodIds,
    })
  }

  return result
}

/** Collect canonical line ids present on month[0] (or first month with lineItems). */
export function collectWorkingLineIdsByMediaKey(
  months: BillingMonth[]
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const month of months) {
    if (!month.lineItems) continue
    for (const [mk, items] of Object.entries(month.lineItems)) {
      if (!Array.isArray(items) || !items.length) continue
      if (out.has(mk)) continue
      out.set(
        mk,
        items.map((li) => String(li.id ?? "")).filter(Boolean)
      )
    }
  }
  return out
}
