/**
 * Plan C S2-P4 — compare materialised plan rows to persisted schedule blobs.
 *
 * Pure helpers used by `scripts/backfill-plan-rows.ts` (and vitest).
 * Does not touch the network.
 */

import type { BillingMonth, BillingLineItem } from "@/lib/billing/types"
import type { AuthoritativeFinancials } from "@/lib/finance/authority/computeAndPersist"
import type {
  CampaignFinancials,
  LineItemInput,
  MonthAmount,
  PerLineResult,
} from "@/lib/finance/campaignFinancials.types"
import {
  normaliseScheduleMediaType,
  scheduleMonthYearToIso,
} from "@/lib/finance/computeCampaignFinancials"
import { buildRows, type BuildRowsResult } from "@/lib/finance/rows/buildRows"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"
import { roundMoney2 } from "@/lib/format/money"
import { MEDIA_CONTAINER_ENDPOINTS } from "@/lib/api/media-containers"
import { backfillLineUid } from "@/lib/mediaplan/lineUid"

export const BACKFILL_TOLERANCE = 0.01

export type BackfillAnomalyClass =
  | "parse-failure"
  | "cent-drift"
  | "structural"
  | "known-dup"

export type BackfillVersionStatus = "clean" | "anomaly" | "known-dup" | "skipped-migrated"

export type BlobLineMonthTotals = {
  lineItemId: string
  month: string // YYYY-MM
  /** Billing media (0 when client-pays). */
  billingMedia: number
  billingFee: number
  billingAdserving: number
  /** Delivery full media (includes client-pays). */
  deliveryMedia: number
  deliveryFee: number
  deliveryAdserving: number
}

export type LineMonthDelta = {
  lineItemId: string
  month: string
  field: string
  blob: number
  rows: number
  delta: number
}

export type BackfillCompareResult = {
  status: "clean" | "anomaly"
  anomalyClass: BackfillAnomalyClass | null
  deltas: LineMonthDelta[]
  billingRowCount: number
  deliveryRowCount: number
  blobLineCount: number
  distinctBlobLines: number
  built: BuildRowsResult
  lineItems: LineItemInput[]
}

function parseMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney2(value)
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""))
  return roundMoney2(Number.isFinite(n) ? n : 0)
}

function tableForMediaType(mediaType: string): string {
  const key = normaliseScheduleMediaType(mediaType) as keyof typeof MEDIA_CONTAINER_ENDPOINTS
  return MEDIA_CONTAINER_ENDPOINTS[key] ?? `media_plan_${key}`
}

/**
 * Collect per-(line, month) totals from billing + delivery schedule months.
 */
export function collectBlobLineMonthTotals(
  billing: BillingMonth[],
  delivery: BillingMonth[]
): Map<string, BlobLineMonthTotals> {
  const map = new Map<string, BlobLineMonthTotals>()

  const touch = (lineItemId: string, monthIso: string): BlobLineMonthTotals => {
    const key = `${lineItemId}::${monthIso}`
    let row = map.get(key)
    if (!row) {
      row = {
        lineItemId,
        month: monthIso,
        billingMedia: 0,
        billingFee: 0,
        billingAdserving: 0,
        deliveryMedia: 0,
        deliveryFee: 0,
        deliveryAdserving: 0,
      }
      map.set(key, row)
    }
    return row
  }

  const walk = (
    months: BillingMonth[],
    side: "billing" | "delivery"
  ): void => {
    for (const month of months) {
      const iso = scheduleMonthYearToIso(String(month.monthYear ?? "").trim())
      if (!iso) continue
      const lineItems = month.lineItems
      if (!lineItems) continue
      for (const items of Object.values(lineItems)) {
        if (!Array.isArray(items)) continue
        for (const item of items as BillingLineItem[]) {
          const id = String(item.id ?? "").trim()
          if (!id) continue
          const row = touch(id, iso)
          const media = Number(item.monthlyAmounts?.[month.monthYear] ?? 0) || 0
          const fee = Number(item.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
          const ad =
            Number(item.adServingMonthlyAmounts?.[month.monthYear] ?? 0) || 0
          if (side === "billing") {
            // Client-pays: billing media already 0 on persisted schedule (or fee-only).
            row.billingMedia = roundMoney2(
              row.billingMedia +
                (item.clientPaysForMedia === true ? 0 : media)
            )
            row.billingFee = roundMoney2(row.billingFee + fee)
            row.billingAdserving = roundMoney2(row.billingAdserving + ad)
          } else {
            row.deliveryMedia = roundMoney2(row.deliveryMedia + media)
            row.deliveryFee = roundMoney2(row.deliveryFee + fee)
            row.deliveryAdserving = roundMoney2(row.deliveryAdserving + ad)
          }
        }
      }
    }
  }

  walk(billing, "billing")
  walk(delivery, "delivery")
  return map
}

function feeMonthsFromPerLine(
  perLine: PerLineResult,
  side: "billing" | "delivery"
): MonthAmount[] {
  const source = side === "billing" ? perLine.billingMonths : perLine.deliveryMonths
  // Fee timing isn't on MonthAmount of media; reconstruct proportionally from fee total.
  const mediaWeights = new Map<string, number>()
  for (const m of source) {
    const iso = scheduleMonthYearToIso(String(m.month ?? "").trim())
    if (!iso) continue
    mediaWeights.set(iso, roundMoney2((mediaWeights.get(iso) ?? 0) + (Number(m.amount) || 0)))
  }
  const totalMedia = roundMoney2([...mediaWeights.values()].reduce((s, v) => s + v, 0))
  const feeTotal = roundMoney2(perLine.fee)
  if (Math.abs(feeTotal) < 1e-9) return []
  if (Math.abs(totalMedia) < 1e-9) {
    // Dump fee into first month if any.
    const first = [...mediaWeights.keys()][0]
    return first ? [{ month: first, amount: feeTotal }] : []
  }
  const out: MonthAmount[] = []
  let allocated = 0
  const entries = [...mediaWeights.entries()]
  entries.forEach(([month, w], idx) => {
    if (idx === entries.length - 1) {
      out.push({ month, amount: roundMoney2(feeTotal - allocated) })
    } else {
      const share = roundMoney2(feeTotal * (w / totalMedia))
      out.push({ month, amount: share })
      allocated = roundMoney2(allocated + share)
    }
  })
  return out
}

/**
 * Extract exact fee months from schedule line items when present.
 */
export function feeMonthsFromSchedule(
  months: BillingMonth[],
  lineItemId: string
): MonthAmount[] {
  const out: MonthAmount[] = []
  for (const month of months) {
    const iso = scheduleMonthYearToIso(String(month.monthYear ?? "").trim())
    if (!iso) continue
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const item of items as BillingLineItem[]) {
        if (String(item.id ?? "").trim() !== lineItemId) continue
        const fee = Number(item.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
        if (Math.abs(fee) > 1e-9) out.push({ month: iso, amount: roundMoney2(fee) })
      }
    }
  }
  return out
}

export function adservingMonthsFromSchedule(
  months: BillingMonth[],
  lineItemId: string
): Map<string, number> {
  const map = new Map<string, number>()
  for (const month of months) {
    const iso = scheduleMonthYearToIso(String(month.monthYear ?? "").trim())
    if (!iso) continue
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const item of items as BillingLineItem[]) {
        if (String(item.id ?? "").trim() !== lineItemId) continue
        const ad = Number(item.adServingMonthlyAmounts?.[month.monthYear] ?? 0) || 0
        if (Math.abs(ad) > 1e-9) {
          map.set(iso, roundMoney2((map.get(iso) ?? 0) + ad))
        }
      }
    }
  }
  return map
}

/**
 * Build LineItemInput stubs for buildRows from persisted financials.
 * Stamps deterministic backfill line_uids (S2-P1 hash rule).
 * Pins feeOverride from schedule so fee columns match the blob (no burst recompute).
 */
export function lineItemsFromPersistedFinancials(args: {
  financials: CampaignFinancials
  mba_number: string
  media_plan_version: number | string
}): LineItemInput[] {
  const { financials, mba_number, media_plan_version } = args
  return financials.perLine
    .filter((p) => !p.flags.excluded)
    .map((perLine) => {
      const table = tableForMediaType(perLine.mediaType)
      const line_uid = backfillLineUid({
        mba_number,
        media_plan_version,
        line_item_id: perLine.lineItemId,
        table,
      })
      const feeMonths =
        feeMonthsFromSchedule(financials.billingSchedule, perLine.lineItemId).length > 0
          ? feeMonthsFromSchedule(financials.billingSchedule, perLine.lineItemId)
          : feeMonthsFromPerLine(perLine, "billing")

      const line: LineItemInput = {
        lineItemId: perLine.lineItemId,
        mediaType: perLine.mediaType,
        buyType: "fixed cost",
        rate: 0,
        enteredAmount: perLine.media,
        budgetIncludesFees: false,
        clientPaysForMedia: perLine.flags.clientPaysForMedia,
        feePct: 0,
        bursts: [],
        approval: "approved",
        line_uid,
        noAdserving: true, // adserving overlaid from schedule after buildRows
        ...(feeMonths.length > 0
          ? {
              feeOverride: {
                mode: "manual" as const,
                months: feeMonths,
                dateBasis: "backfill",
              },
            }
          : {}),
      }
      return line
    })
}

export function authoritativeFromPersistedFinancials(
  financials: CampaignFinancials,
  lineItems: LineItemInput[]
): AuthoritativeFinancials {
  return {
    billingSchedule: financials.billingSchedule,
    deliverySchedule: financials.deliverySchedule,
    totals: financials.mbaScopeTotals,
    perLine: financials.perLine,
    validation: financials.validation,
    lineItems,
  }
}

/**
 * Overlay schedule adserving amounts onto built rows (buildRows skips without bursts).
 * Recomputes billable/delivery totals so columns stay consistent.
 */
export function mergeScheduleAdservingIntoRows(
  built: BuildRowsResult,
  financials: CampaignFinancials,
  lineItems: LineItemInput[],
  meta: { media_plan_version: number; mba_number: string }
): BuildRowsResult {
  const uidByLineId = new Map(
    lineItems.map((l) => [String(l.lineItemId), String(l.line_uid ?? "")])
  )
  const billingByKey = new Map(
    built.billingRows.map((r) => [`${r.line_uid}::${r.month}`, { ...r }])
  )
  const deliveryByKey = new Map(
    built.deliveryRows.map((r) => [`${r.line_uid}::${r.month}`, { ...r }])
  )

  const deliverySource =
    financials.deliverySchedule.length > 0
      ? financials.deliverySchedule
      : financials.billingSchedule

  for (const perLine of financials.perLine) {
    if (perLine.flags.excluded) continue
    const uid = uidByLineId.get(perLine.lineItemId)
    if (!uid) continue

    const line_source: PlanBillingRow["line_source"] =
      normaliseScheduleMediaType(perLine.mediaType) === "production"
        ? "production"
        : "channel"

    const adBilling = adservingMonthsFromSchedule(
      financials.billingSchedule,
      perLine.lineItemId
    )
    const adDelivery = adservingMonthsFromSchedule(
      deliverySource,
      perLine.lineItemId
    )
    const feeDelivery = new Map<string, number>()
    for (const m of feeMonthsFromSchedule(deliverySource, perLine.lineItemId)) {
      feeDelivery.set(m.month, roundMoney2((feeDelivery.get(m.month) ?? 0) + m.amount))
    }

    for (const [month, ad] of adBilling) {
      if (Math.abs(ad) < 1e-9) continue
      const key = `${uid}::${month}`
      const existing = billingByKey.get(key)
      if (existing) {
        existing.adserving_amount = roundMoney2(ad)
        existing.billable_amount = roundMoney2(
          existing.media_amount + existing.fee_amount + existing.adserving_amount
        )
      } else {
        billingByKey.set(key, {
          media_plan_version: meta.media_plan_version,
          mba_number: meta.mba_number,
          line_uid: uid,
          line_source,
          media_type: perLine.mediaType,
          month,
          media_amount: 0,
          fee_amount: 0,
          adserving_amount: roundMoney2(ad),
          billable_amount: roundMoney2(ad),
          client_pays_for_media: perLine.flags.clientPaysForMedia,
          is_manual_override: false,
          source: "auto",
          override_id: null,
        })
      }
    }

    const deliveryMonths = new Set([
      ...deliveryByKey.keys(),
      ...[...adDelivery.keys()].map((m) => `${uid}::${m}`),
      ...[...feeDelivery.keys()].map((m) => `${uid}::${m}`),
    ])
    for (const key of deliveryMonths) {
      if (!key.startsWith(`${uid}::`)) continue
      const month = key.slice(uid.length + 2)
      const existing = deliveryByKey.get(key)
      const ad = adDelivery.get(month) ?? 0
      const fee = feeDelivery.get(month) ?? 0
      if (existing) {
        // Preserve media_full from buildRows; refresh total with schedule fee+ad when present.
        const mediaFull = existing.media_amount_full
        if (Math.abs(ad) > 1e-9 || feeDelivery.has(month)) {
          existing.delivery_amount = roundMoney2(
            mediaFull + (feeDelivery.has(month) ? fee : Math.max(0, existing.delivery_amount - mediaFull)) + ad
          )
          if (feeDelivery.has(month)) {
            existing.delivery_amount = roundMoney2(mediaFull + fee + ad)
          } else if (Math.abs(ad) > 1e-9) {
            // Keep prior non-media component, replace any previous ad with schedule ad.
            const priorNonMedia = roundMoney2(existing.delivery_amount - mediaFull)
            existing.delivery_amount = roundMoney2(mediaFull + priorNonMedia + ad)
          }
        }
      } else if (Math.abs(ad) > 1e-9 || Math.abs(fee) > 1e-9) {
        deliveryByKey.set(key, {
          media_plan_version: meta.media_plan_version,
          mba_number: meta.mba_number,
          line_uid: uid,
          line_source,
          media_type: perLine.mediaType,
          month,
          media_amount_full: 0,
          delivery_amount: roundMoney2(fee + ad),
        })
      }
    }
  }

  return {
    billingRows: [...billingByKey.values()].sort((a, b) =>
      a.line_uid === b.line_uid
        ? a.month.localeCompare(b.month)
        : a.line_uid.localeCompare(b.line_uid)
    ),
    deliveryRows: [...deliveryByKey.values()].sort((a, b) =>
      a.line_uid === b.line_uid
        ? a.month.localeCompare(b.month)
        : a.line_uid.localeCompare(b.line_uid)
    ),
  }
}

function sumBillingRowsByLineMonth(
  rows: PlanBillingRow[],
  lineUidToId: Map<string, string>
): Map<string, { media: number; fee: number; adserving: number }> {
  const map = new Map<string, { media: number; fee: number; adserving: number }>()
  for (const r of rows) {
    const lineItemId = lineUidToId.get(r.line_uid) ?? r.line_uid
    const key = `${lineItemId}::${r.month}`
    const cur = map.get(key) ?? { media: 0, fee: 0, adserving: 0 }
    cur.media = roundMoney2(cur.media + r.media_amount)
    cur.fee = roundMoney2(cur.fee + r.fee_amount)
    cur.adserving = roundMoney2(cur.adserving + r.adserving_amount)
    map.set(key, cur)
  }
  return map
}

function sumDeliveryRowsByLineMonth(
  rows: PlanDeliveryRow[],
  lineUidToId: Map<string, string>
): Map<string, { media: number; delivery: number }> {
  const map = new Map<string, { media: number; delivery: number }>()
  for (const r of rows) {
    const lineItemId = lineUidToId.get(r.line_uid) ?? r.line_uid
    const key = `${lineItemId}::${r.month}`
    const cur = map.get(key) ?? { media: 0, delivery: 0 }
    cur.media = roundMoney2(cur.media + r.media_amount_full)
    cur.delivery = roundMoney2(cur.delivery + r.delivery_amount)
    map.set(key, cur)
  }
  return map
}

function exceeds(a: number, b: number): boolean {
  return Math.abs(a - b) > BACKFILL_TOLERANCE
}

/**
 * Materialise rows from persisted financials and compare to blob line/month totals.
 */
export function compareBackfillRowsToBlob(args: {
  financials: CampaignFinancials
  mba_number: string
  media_plan_version: number | string
  /** When true, treat structural row≠distinct as known-dup candidate (caller sets status). */
  isKnownDupVersion?: boolean
}): BackfillCompareResult {
  const lineItems = lineItemsFromPersistedFinancials(args)
  const authority = authoritativeFromPersistedFinancials(args.financials, lineItems)
  const meta = {
    media_plan_version: Number(args.media_plan_version) || 0,
    mba_number: args.mba_number,
  }
  let built = buildRows({
    authorityResult: authority,
    lineItems,
    overrides: [],
    meta,
  })
  built = mergeScheduleAdservingIntoRows(built, args.financials, lineItems, meta)

  const blobTotals = collectBlobLineMonthTotals(
    args.financials.billingSchedule,
    args.financials.deliverySchedule
  )
  const distinctBlobLines = new Set(
    [...blobTotals.values()].map((b) => b.lineItemId)
  ).size
  const blobLineCount = blobTotals.size

  // Structural: duplicate (line_uid, month) in built rows
  const billingKeys = new Set<string>()
  let structuralDup = false
  for (const r of built.billingRows) {
    const k = `${r.line_uid}::${r.month}`
    if (billingKeys.has(k)) structuralDup = true
    billingKeys.add(k)
  }

  const lineUidToId = new Map(
    lineItems.map((l) => [String(l.line_uid), String(l.lineItemId)])
  )
  const rowBilling = sumBillingRowsByLineMonth(built.billingRows, lineUidToId)
  const rowDelivery = sumDeliveryRowsByLineMonth(built.deliveryRows, lineUidToId)

  const deltas: LineMonthDelta[] = []
  const allKeys = new Set([...blobTotals.keys(), ...rowBilling.keys(), ...rowDelivery.keys()])

  for (const key of allKeys) {
    const blob = blobTotals.get(key) ?? {
      lineItemId: key.split("::")[0] ?? "",
      month: key.split("::")[1] ?? "",
      billingMedia: 0,
      billingFee: 0,
      billingAdserving: 0,
      deliveryMedia: 0,
      deliveryFee: 0,
      deliveryAdserving: 0,
    }
    const rb = rowBilling.get(key) ?? { media: 0, fee: 0, adserving: 0 }
    const rd = rowDelivery.get(key) ?? { media: 0, delivery: 0 }
    const blobDeliveryTotal = roundMoney2(
      blob.deliveryMedia + blob.deliveryFee + blob.deliveryAdserving
    )

    const checks: Array<[string, number, number]> = [
      ["billing.media", blob.billingMedia, rb.media],
      ["billing.fee", blob.billingFee, rb.fee],
      ["billing.adserving", blob.billingAdserving, rb.adserving],
      ["delivery.media", blob.deliveryMedia, rd.media],
      ["delivery.total", blobDeliveryTotal, rd.delivery],
    ]
    for (const [field, b, r] of checks) {
      if (exceeds(b, r)) {
        deltas.push({
          lineItemId: blob.lineItemId,
          month: blob.month,
          field,
          blob: b,
          rows: r,
          delta: roundMoney2(r - b),
        })
      }
    }
  }

  if (structuralDup || args.isKnownDupVersion) {
    return {
      status: "anomaly",
      anomalyClass: args.isKnownDupVersion ? "known-dup" : "structural",
      deltas,
      billingRowCount: built.billingRows.length,
      deliveryRowCount: built.deliveryRows.length,
      blobLineCount,
      distinctBlobLines,
      built,
      lineItems,
    }
  }

  if (deltas.length > 0) {
    return {
      status: "anomaly",
      anomalyClass: "cent-drift",
      deltas,
      billingRowCount: built.billingRows.length,
      deliveryRowCount: built.deliveryRows.length,
      blobLineCount,
      distinctBlobLines,
      built,
      lineItems,
    }
  }

  return {
    status: "clean",
    anomalyClass: null,
    deltas: [],
    billingRowCount: built.billingRows.length,
    deliveryRowCount: built.deliveryRows.length,
    blobLineCount,
    distinctBlobLines,
    built,
    lineItems,
  }
}

/** Grand-total compare (schedule headers vs row sums) — useful for smoke asserts. */
export function compareGrandTotals(args: {
  billingRows: PlanBillingRow[]
  deliveryRows: PlanDeliveryRow[]
  billingSchedule: BillingMonth[]
  deliverySchedule: BillingMonth[]
}): { billingDelta: number; deliveryDelta: number; ok: boolean } {
  const rowBilling = roundMoney2(
    args.billingRows.reduce((s, r) => s + r.billable_amount, 0)
  )
  const rowDelivery = roundMoney2(
    args.deliveryRows.reduce((s, r) => s + r.delivery_amount, 0)
  )
  const blobBilling = roundMoney2(
    args.billingSchedule.reduce(
      (s, m) =>
        s +
        parseMoney(m.mediaTotal) +
        parseMoney(m.feeTotal) +
        parseMoney(m.adservingTechFees) +
        parseMoney(m.production),
      0
    )
  )
  const blobDelivery = roundMoney2(
    args.deliverySchedule.reduce(
      (s, m) =>
        s +
        parseMoney(m.mediaTotal) +
        parseMoney(m.feeTotal) +
        parseMoney(m.adservingTechFees) +
        parseMoney(m.production),
      0
    )
  )
  const billingDelta = roundMoney2(rowBilling - blobBilling)
  const deliveryDelta = roundMoney2(rowDelivery - blobDelivery)
  return {
    billingDelta,
    deliveryDelta,
    ok:
      Math.abs(billingDelta) <= BACKFILL_TOLERANCE &&
      Math.abs(deliveryDelta) <= BACKFILL_TOLERANCE,
  }
}
