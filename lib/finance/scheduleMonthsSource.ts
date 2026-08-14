/**
 * PC1 — rebuild BillingMonth[] from schedule_months rows (inverse of
 * `explodeScheduleToMonthRows`) and gate finance derive behind
 * `DATA_BACKEND_FINANCE_SCHEDULE=blob|shadow|rows` (default blob).
 *
 * Money: cents live in rows; dollars only at this boundary via {@link centsToDollars}.
 * ZERO rows for a version → legacy blob parse (logged + counted). The 53 ACCEPTed
 * empty-divergence versions (DISPOSITIONS §E) land here.
 */

import { eq, inArray } from "drizzle-orm"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import { getDb, schema } from "@/db"
import {
  compareReferenceRows,
  recordShadowDiff,
  type FieldDiff,
  type RowFieldDiff,
} from "@/lib/data/shadowDiff"
import { normalizeMonthKey } from "@/lib/finance/accrual"
import {
  isoMonthToScheduleMonthYear,
  scheduleMonthYearToIso,
} from "@/lib/finance/computeCampaignFinancials"
import { getBillingSchedule, getDeliverySchedule } from "@/lib/finance/normalizeFields"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { roundMoney2 } from "@/lib/format/money"
import type { ScheduleBasis, ScheduleComponent } from "@/scripts/migration/_scheduleTransform"

export type FinanceScheduleBackend = "blob" | "shadow" | "rows"

export type ScheduleMonthRowInput = {
  versionId: number
  lineItemId: string
  component: ScheduleComponent
  basis: ScheduleBasis
  /** `YYYY-MM-01` or `YYYY-MM`. */
  month: string
  amountCents: number
  source: "computed" | "override"
}

export type ResolvedVersionSchedules = {
  billing: BillingMonth[]
  delivery: BillingMonth[]
  fallbackUsed: boolean
}

export type ScheduleAmountDiff = {
  versionId: number
  lineItemId: string
  month: string
  component: ScheduleComponent
  basis: ScheduleBasis
  blobAmount: number
  rowsAmount: number
  delta: number
  fallbackUsed: boolean
}

/** Attached by {@link hydrateVersionsFinanceScheduleSource} for derive paths. */
export const FINANCE_SCHEDULE_RESOLVED_KEY = "__financeScheduleResolved" as const

export type AttachedFinanceSchedule = ResolvedVersionSchedules & {
  mode: FinanceScheduleBackend
}

const MONEY_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const MEDIA_COST_KEYS = [
  "search",
  "socialMedia",
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digiDisplay",
  "digiAudio",
  "digiVideo",
  "bvod",
  "integration",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "influencers",
  "production",
] as const

type MediaCostKey = (typeof MEDIA_COST_KEYS)[number]

const SERVICE_ADSERVING = "__service__adserving"
const SERVICE_PRODUCTION = "__service__production"
const SERVICE_FEES = "__service__fees"
const SERVICE_MEDIA_TOTAL = "__service__media_total"

/** Cents → dollars at the schedule_months / BillingMonth boundary only. */
export function centsToDollars(cents: number): number {
  if (!Number.isFinite(cents)) return 0
  return roundMoney2(cents / 100)
}

export function getFinanceScheduleBackend(): FinanceScheduleBackend {
  const v = (process.env.DATA_BACKEND_FINANCE_SCHEDULE ?? "blob").trim().toLowerCase()
  if (v === "shadow" || v === "rows") return v
  return "blob"
}

function fmtMoney(n: number): string {
  return MONEY_FMT.format(roundMoney2(n))
}

function emptyMediaCosts(): BillingMonth["mediaCosts"] {
  const out = {} as BillingMonth["mediaCosts"]
  for (const k of MEDIA_COST_KEYS) out[k] = fmtMoney(0)
  return out
}

function monthDateToKey(month: string): string | null {
  const raw = String(month ?? "").trim()
  if (!raw) return null
  // YYYY-MM-01 → YYYY-MM
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return normalizeMonthKey(raw.slice(0, 7))
  return normalizeMonthKey(raw)
}

/**
 * Infer schedule media-type bucket from line_item_id (`billing-{type}::…`).
 * Unknown token → search as schedule placement only (fee resolution is C-9 elsewhere).
 */
export function mediaTypeFromScheduleLineId(lineItemId: string): MediaCostKey | null {
  const id = String(lineItemId ?? "").trim()
  if (!id || id.startsWith("__service__")) return null
  const m = /^billing-([A-Za-z0-9_]+)::/.exec(id)
  if (!m) return "search"
  const key = m[1]!
  if ((MEDIA_COST_KEYS as readonly string[]).includes(key)) return key as MediaCostKey
  return "search"
}

type LineAccum = {
  id: string
  mediaType: MediaCostKey
  monthlyAmounts: Record<string, number>
  feeMonthlyAmounts: Record<string, number>
  adServingMonthlyAmounts: Record<string, number>
  mediaOverride: boolean
  feeOverride: boolean
}

type MonthAccum = {
  monthYear: string
  mediaByType: Record<string, number>
  feeTotal: number
  adserving: number
  production: number
  lines: Map<string, LineAccum>
  serviceMediaTotal: number
  serviceFees: number
}

function ensureMonth(map: Map<string, MonthAccum>, monthKey: string): MonthAccum {
  let m = map.get(monthKey)
  if (!m) {
    m = {
      monthYear: isoMonthToScheduleMonthYear(monthKey),
      mediaByType: {},
      feeTotal: 0,
      adserving: 0,
      production: 0,
      lines: new Map(),
      serviceMediaTotal: 0,
      serviceFees: 0,
    }
    map.set(monthKey, m)
  }
  return m
}

function ensureLine(month: MonthAccum, lineItemId: string, mediaType: MediaCostKey): LineAccum {
  const canonId = toBillingOverrideLineItemId(lineItemId)
  let line = month.lines.get(canonId)
  if (!line) {
    line = {
      // Canonical Map key for grouping; decorated input id for emitted identity.
      id: lineItemId,
      mediaType,
      monthlyAmounts: {},
      feeMonthlyAmounts: {},
      adServingMonthlyAmounts: {},
      mediaOverride: false,
      feeOverride: false,
    }
    month.lines.set(canonId, line)
  }
  return line
}

function finalizeMonths(byMonth: Map<string, MonthAccum>): BillingMonth[] {
  const keys = [...byMonth.keys()].sort()
  const out: BillingMonth[] = []

  for (const monthKey of keys) {
    const acc = byMonth.get(monthKey)!
    const mediaCosts = emptyMediaCosts()
    let mediaTotal = 0
    let productionFromLines = 0

    for (const [type, amt] of Object.entries(acc.mediaByType)) {
      const rounded = roundMoney2(amt)
      if ((MEDIA_COST_KEYS as readonly string[]).includes(type)) {
        mediaCosts[type as MediaCostKey] = fmtMoney(rounded)
      }
      if (type === "production") productionFromLines = roundMoney2(productionFromLines + rounded)
      else mediaTotal = roundMoney2(mediaTotal + rounded)
    }

    // Synthetic service totals only when no per-line counterparts.
    if (mediaTotal === 0 && acc.serviceMediaTotal !== 0) {
      mediaTotal = roundMoney2(acc.serviceMediaTotal)
    }
    let feeTotal = roundMoney2(acc.feeTotal)
    if (feeTotal === 0 && acc.serviceFees !== 0) {
      feeTotal = roundMoney2(acc.serviceFees)
    }

    const production = roundMoney2(
      productionFromLines > 0 ? productionFromLines : acc.production
    )
    mediaCosts.production = fmtMoney(production)

    const lineItems: NonNullable<BillingMonth["lineItems"]> = {}
    for (const line of acc.lines.values()) {
      const mediaSum = roundMoney2(
        Object.values(line.monthlyAmounts).reduce((s, n) => s + n, 0)
      )
      const feeSum = roundMoney2(
        Object.values(line.feeMonthlyAmounts).reduce((s, n) => s + n, 0)
      )
      const item: BillingLineItem = {
        id: line.id,
        header1: "",
        header2: "",
        monthlyAmounts: { ...line.monthlyAmounts },
        feeMonthlyAmounts: { ...line.feeMonthlyAmounts },
        totalAmount: mediaSum,
        totalFeeAmount: feeSum,
        mediaAmount: mediaSum,
        feeAmount: feeSum,
        mediaType: line.mediaType,
      }
      if (Object.keys(line.adServingMonthlyAmounts).length > 0) {
        item.adServingMonthlyAmounts = { ...line.adServingMonthlyAmounts }
      }
      if (line.mediaOverride) item.billingMode = "manual"
      if (line.feeOverride) item.feeBillingMode = "manual"
      const bucket = (lineItems[line.mediaType] ??= [])
      bucket.push(item)
    }

    const hasLines = Object.keys(lineItems).length > 0
    out.push({
      monthYear: acc.monthYear,
      mediaTotal: fmtMoney(mediaTotal),
      feeTotal: fmtMoney(feeTotal),
      totalAmount: fmtMoney(mediaTotal + feeTotal + acc.adserving + production),
      adservingTechFees: fmtMoney(acc.adserving),
      production: fmtMoney(production),
      mediaCosts,
      ...(hasLines ? { lineItems } : {}),
    })
  }

  return out
}

function accumulateRows(
  rows: ScheduleMonthRowInput[],
  basis: ScheduleBasis
): Map<string, MonthAccum> {
  const byMonth = new Map<string, MonthAccum>()

  for (const row of rows) {
    if (row.basis !== basis) continue
    const monthKey = monthDateToKey(row.month)
    if (!monthKey) continue
    const dollars = centsToDollars(row.amountCents)
    if (dollars === 0) continue

    const month = ensureMonth(byMonth, monthKey)
    const id = String(row.lineItemId ?? "").trim()
    const isOverride = row.source === "override"

    if (id === SERVICE_ADSERVING || row.component === "adserving") {
      month.adserving = roundMoney2(month.adserving + dollars)
      if (id !== SERVICE_ADSERVING && row.component === "adserving") {
        const mediaType = mediaTypeFromScheduleLineId(id) ?? "search"
        const line = ensureLine(month, id, mediaType)
        const monthYear = month.monthYear
        line.adServingMonthlyAmounts = line.adServingMonthlyAmounts ?? {}
        line.adServingMonthlyAmounts[monthYear] = roundMoney2(
          (line.adServingMonthlyAmounts[monthYear] ?? 0) + dollars
        )
      }
      continue
    }
    if (id === SERVICE_PRODUCTION) {
      month.production = roundMoney2(month.production + dollars)
      continue
    }
    if (id === SERVICE_MEDIA_TOTAL) {
      month.serviceMediaTotal = roundMoney2(month.serviceMediaTotal + dollars)
      continue
    }
    if (id === SERVICE_FEES) {
      month.serviceFees = roundMoney2(month.serviceFees + dollars)
      continue
    }

    const mediaType = mediaTypeFromScheduleLineId(id) ?? "search"
    const line = ensureLine(month, id, mediaType)
    const monthYear = month.monthYear

    if (row.component === "media") {
      line.monthlyAmounts[monthYear] = roundMoney2(
        (line.monthlyAmounts[monthYear] ?? 0) + dollars
      )
      month.mediaByType[mediaType] = roundMoney2(
        (month.mediaByType[mediaType] ?? 0) + dollars
      )
      if (isOverride) line.mediaOverride = true
    } else {
      line.feeMonthlyAmounts[monthYear] = roundMoney2(
        (line.feeMonthlyAmounts[monthYear] ?? 0) + dollars
      )
      month.feeTotal = roundMoney2(month.feeTotal + dollars)
      if (isOverride) line.feeOverride = true
    }
  }

  return byMonth
}

/**
 * Inverse of `explodeScheduleToMonthRows` — rebuild billing + delivery
 * BillingMonth[] from typed schedule_months rows.
 */
export function buildSchedulesFromMonthRows(rows: ScheduleMonthRowInput[]): {
  billing: BillingMonth[]
  delivery: BillingMonth[]
} {
  return {
    billing: finalizeMonths(accumulateRows(rows, "billing")),
    delivery: finalizeMonths(accumulateRows(rows, "delivery")),
  }
}

/**
 * Resolve schedules for one version. ZERO rows → blob fallback (logged by caller /
 * hydrate). Non-empty rows → rebuild; never re-parse blob for money.
 */
export function resolveVersionSchedules(
  version: Record<string, unknown>,
  rows: ScheduleMonthRowInput[]
): ResolvedVersionSchedules {
  const versionId = Number(version.id ?? version.version_id ?? 0)
  if (!rows.length) {
    const billing =
      parsePersistedBillingScheduleToMonths(getBillingSchedule(version)) ?? []
    const delivery =
      parsePersistedBillingScheduleToMonths(getDeliverySchedule(version)) ?? []
    if (versionId) {
      console.info("[finance-schedule] blob fallback — zero schedule_months rows", {
        versionId,
        mba: version.mba_number ?? version.mbaNumber ?? null,
      })
    }
    return { billing, delivery, fallbackUsed: true }
  }
  const built = buildSchedulesFromMonthRows(rows)
  return { ...built, fallbackUsed: false }
}

type FlatCell = {
  id: string
  versionId: number
  lineItemId: string
  month: string
  component: ScheduleComponent
  basis: ScheduleBasis
  amount: number
}

function flattenMonths(
  versionId: number,
  months: BillingMonth[],
  basis: ScheduleBasis
): FlatCell[] {
  const out: FlatCell[] = []
  for (const month of months) {
    const monthIso = scheduleMonthYearToIso(month.monthYear)
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const li of items as BillingLineItem[]) {
        const lineItemId = String(li.id ?? "").trim()
        if (!lineItemId) continue
        const media = roundMoney2(li.monthlyAmounts?.[month.monthYear] ?? 0)
        const fee = roundMoney2(li.feeMonthlyAmounts?.[month.monthYear] ?? 0)
        if (media !== 0) {
          out.push({
            id: `${versionId}|${basis}|${lineItemId}|${monthIso}|media`,
            versionId,
            lineItemId,
            month: monthIso,
            component: "media",
            basis,
            amount: media,
          })
        }
        if (fee !== 0) {
          out.push({
            id: `${versionId}|${basis}|${lineItemId}|${monthIso}|fee`,
            versionId,
            lineItemId,
            month: monthIso,
            component: "fee",
            basis,
            amount: fee,
          })
        }
      }
    }
  }
  return out
}

const AMOUNT_EPS = 0.01

/**
 * Per-line per-month media+fee compare (blob vs rows) with $0.01 tolerance.
 */
export function compareScheduleMonthAmounts(args: {
  versionId: number
  blobBilling: BillingMonth[]
  blobDelivery: BillingMonth[]
  rowsBilling: BillingMonth[]
  rowsDelivery: BillingMonth[]
  fallbackUsed?: boolean
}): ScheduleAmountDiff[] {
  const blob = [
    ...flattenMonths(args.versionId, args.blobBilling, "billing"),
    ...flattenMonths(args.versionId, args.blobDelivery, "delivery"),
  ]
  const rows = [
    ...flattenMonths(args.versionId, args.rowsBilling, "billing"),
    ...flattenMonths(args.versionId, args.rowsDelivery, "delivery"),
  ]
  const blobById = new Map(blob.map((c) => [c.id, c]))
  const rowsById = new Map(rows.map((c) => [c.id, c]))
  const ids = new Set([...blobById.keys(), ...rowsById.keys()])
  const diffs: ScheduleAmountDiff[] = []

  for (const id of ids) {
    const b = blobById.get(id)
    const r = rowsById.get(id)
    const blobAmount = b?.amount ?? 0
    const rowsAmount = r?.amount ?? 0
    const delta = roundMoney2(rowsAmount - blobAmount)
    if (Math.abs(delta) <= AMOUNT_EPS) continue
    const sample = b ?? r!
    diffs.push({
      versionId: args.versionId,
      lineItemId: sample.lineItemId,
      month: sample.month,
      component: sample.component,
      basis: sample.basis,
      blobAmount,
      rowsAmount,
      delta,
      fallbackUsed: args.fallbackUsed === true,
    })
  }
  return diffs
}

function cellsToShadowRows(cells: FlatCell[]): Record<string, unknown>[] {
  return cells.map((c) => ({
    id: c.id,
    amount: c.amount,
    lineItemId: c.lineItemId,
    month: c.month,
    component: c.component,
    basis: c.basis,
  }))
}

/** Record one version's blob↔rows amount shadow into the migration-diffs ring. */
export function recordFinanceScheduleShadowDiff(
  versionId: number,
  blobBilling: BillingMonth[],
  blobDelivery: BillingMonth[],
  rowsBilling: BillingMonth[],
  rowsDelivery: BillingMonth[]
): ScheduleAmountDiff[] {
  const diffs = compareScheduleMonthAmounts({
    versionId,
    blobBilling,
    blobDelivery,
    rowsBilling,
    rowsDelivery,
  })
  const blobCells = [
    ...flattenMonths(versionId, blobBilling, "billing"),
    ...flattenMonths(versionId, blobDelivery, "delivery"),
  ]
  const rowCells = [
    ...flattenMonths(versionId, rowsBilling, "billing"),
    ...flattenMonths(versionId, rowsDelivery, "delivery"),
  ]
  const event = compareReferenceRows(
    `finance-schedule:v${versionId}`,
    cellsToShadowRows(blobCells),
    cellsToShadowRows(rowCells),
    {
      domain: "finance-schedule",
      kpiNumericCompare: true,
      moneyFields: ["amount"],
      moneyEpsCents: 1,
    }
  )
  // Annotate field diffs with structured amounts when present.
  if (diffs.length > 0 && event.fieldDiffs.length === 0) {
    const fieldDiffs: RowFieldDiff[] = diffs.slice(0, 50).map((d) => ({
      id: `${d.versionId}|${d.basis}|${d.lineItemId}|${d.month}|${d.component}`,
      fields: [
        {
          field: "amount",
          xano: d.blobAmount,
          postgres: d.rowsAmount,
        } satisfies FieldDiff,
      ],
    }))
    event.fieldDiffs = fieldDiffs
  }
  recordShadowDiff(event)
  return diffs
}

/** Batch-load schedule_months for a set of version ids. */
export async function loadScheduleMonthRowsForVersions(
  versionIds: number[]
): Promise<Map<number, ScheduleMonthRowInput[]>> {
  const out = new Map<number, ScheduleMonthRowInput[]>()
  const ids = [...new Set(versionIds.filter((id) => Number.isFinite(id) && id > 0))]
  for (const id of ids) out.set(id, [])
  if (ids.length === 0) return out

  const db = getDb()
  const rows = await db
    .select({
      versionId: schema.scheduleMonths.versionId,
      lineItemId: schema.scheduleMonths.lineItemId,
      component: schema.scheduleMonths.component,
      basis: schema.scheduleMonths.basis,
      month: schema.scheduleMonths.month,
      amountCents: schema.scheduleMonths.amountCents,
      source: schema.scheduleMonths.source,
    })
    .from(schema.scheduleMonths)
    .where(inArray(schema.scheduleMonths.versionId, ids))

  for (const r of rows) {
    const list = out.get(r.versionId) ?? []
    list.push({
      versionId: r.versionId,
      lineItemId: r.lineItemId,
      component: r.component as ScheduleComponent,
      basis: r.basis as ScheduleBasis,
      month: String(r.month),
      amountCents: Number(r.amountCents),
      source: (r.source === "override" ? "override" : "computed") as "computed" | "override",
    })
    out.set(r.versionId, list)
  }
  return out
}

export type HydrateFinanceScheduleResult = {
  mode: FinanceScheduleBackend
  versionCount: number
  fallbackCount: number
  shadowDiffCount: number
}

/**
 * Attach resolved schedules onto versions for compose/derive/accrual/forecast.
 * - blob: no-op
 * - shadow: serve blob; async-compare rows; attach blob resolved (fallbackUsed false unless empty both)
 * - rows: attach rows-derived (blob fallback when zero rows)
 */
export async function hydrateVersionsFinanceScheduleSource(
  versions: Record<string, unknown>[]
): Promise<HydrateFinanceScheduleResult> {
  const mode = getFinanceScheduleBackend()
  if (mode === "blob" || versions.length === 0) {
    return { mode, versionCount: versions.length, fallbackCount: 0, shadowDiffCount: 0 }
  }

  const versionIds = versions.map((v) => Number(v.id ?? v.version_id ?? 0)).filter((id) => id > 0)
  let rowsByVersion: Map<number, ScheduleMonthRowInput[]>
  try {
    rowsByVersion = await loadScheduleMonthRowsForVersions(versionIds)
  } catch (err) {
    console.error("[finance-schedule] failed to load schedule_months; leaving blob path", err)
    return { mode, versionCount: versions.length, fallbackCount: 0, shadowDiffCount: 0 }
  }

  let fallbackCount = 0
  let shadowDiffCount = 0

  for (const version of versions) {
    const versionId = Number(version.id ?? version.version_id ?? 0)
    const rows = rowsByVersion.get(versionId) ?? []
    const blobBilling =
      parsePersistedBillingScheduleToMonths(getBillingSchedule(version)) ?? []
    const blobDelivery =
      parsePersistedBillingScheduleToMonths(getDeliverySchedule(version)) ?? []

    if (mode === "shadow") {
      if (rows.length === 0) {
        fallbackCount++
        console.info("[finance-schedule] shadow: zero rows (blob fallback class)", {
          versionId,
          mba: version.mba_number ?? null,
        })
        const attached: AttachedFinanceSchedule = {
          billing: blobBilling,
          delivery: blobDelivery,
          fallbackUsed: true,
          mode,
        }
        ;(version as Record<string, unknown>)[FINANCE_SCHEDULE_RESOLVED_KEY] = attached
        continue
      }
      const rebuilt = buildSchedulesFromMonthRows(rows)
      const diffs = recordFinanceScheduleShadowDiff(
        versionId,
        blobBilling,
        blobDelivery,
        rebuilt.billing,
        rebuilt.delivery
      )
      shadowDiffCount += diffs.length
      const attached: AttachedFinanceSchedule = {
        billing: blobBilling,
        delivery: blobDelivery,
        fallbackUsed: false,
        mode,
      }
      ;(version as Record<string, unknown>)[FINANCE_SCHEDULE_RESOLVED_KEY] = attached
      continue
    }

    // rows mode
    const resolved = resolveVersionSchedules(version, rows)
    if (resolved.fallbackUsed) fallbackCount++
    const attached: AttachedFinanceSchedule = { ...resolved, mode }
    ;(version as Record<string, unknown>)[FINANCE_SCHEDULE_RESOLVED_KEY] = attached
    // Also overwrite schedule fields so forecast/accrual flatteners that read
    // billingSchedule directly see the rows-derived months.
    version.billingSchedule = resolved.billing
    version.deliverySchedule = resolved.delivery
  }

  return {
    mode,
    versionCount: versions.length,
    fallbackCount,
    shadowDiffCount,
  }
}

/** Read attached schedules if hydrate ran; else null. */
export function getAttachedFinanceSchedule(
  version: Record<string, unknown>
): AttachedFinanceSchedule | null {
  const raw = version[FINANCE_SCHEDULE_RESOLVED_KEY]
  if (!raw || typeof raw !== "object") return null
  return raw as AttachedFinanceSchedule
}

function legacySchedulesFromJson(raw: unknown): {
  billingSchedule: unknown
  deliverySchedule: unknown
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { billingSchedule: null, deliverySchedule: null }
  }
  const o = raw as Record<string, unknown>
  return {
    billingSchedule: o.billingSchedule ?? o.billing_schedule ?? null,
    deliverySchedule: o.deliverySchedule ?? o.delivery_schedule ?? null,
  }
}

export type FinanceScheduleProbeResult = {
  versionCount: number
  fallbackCount: number
  diffCount: number
  csv: string
  /** MBA → absolute delta sum (top divergent). */
  topDivergentMbas: Array<{ mba: string; versionId: number; diffCount: number; absDelta: number }>
}

/**
 * Admin probe: derive all published versions both ways, emit diff CSV.
 * Columns: version, line, month, component, blobAmount, rowsAmount, delta, fallbackUsed
 */
export async function probeFinanceScheduleDiffs(): Promise<FinanceScheduleProbeResult> {
  const db = getDb()
  const published = await db
    .select({
      versionId: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      legacySchedules: schema.mediaPlanVersions.legacySchedules,
    })
    .from(schema.mediaPlanMasters)
    .innerJoin(
      schema.mediaPlanVersions,
      eq(schema.mediaPlanMasters.publishedVersionId, schema.mediaPlanVersions.id)
    )

  const versionIds = published.map((p) => p.versionId)
  const rowsByVersion = await loadScheduleMonthRowsForVersions(versionIds)

  const allDiffs: ScheduleAmountDiff[] = []
  let fallbackCount = 0
  const mbaAgg = new Map<string, { mba: string; versionId: number; diffCount: number; absDelta: number }>()

  for (const p of published) {
    const legacy = legacySchedulesFromJson(p.legacySchedules)
    const version = {
      id: p.versionId,
      mba_number: p.mbaNumber,
      billingSchedule: legacy.billingSchedule,
      deliverySchedule: legacy.deliverySchedule,
    }
    const rows = rowsByVersion.get(p.versionId) ?? []
    const resolved = resolveVersionSchedules(version, rows)
    if (resolved.fallbackUsed) fallbackCount++

    const blobBilling =
      parsePersistedBillingScheduleToMonths(legacy.billingSchedule) ?? []
    const blobDelivery =
      parsePersistedBillingScheduleToMonths(legacy.deliverySchedule) ?? []

    // When fallback, rows-derived is empty — compare is tautological empty vs blob.
    // Still record fallbackUsed rows as informational (no amount cells from rows).
    const diffs = compareScheduleMonthAmounts({
      versionId: p.versionId,
      blobBilling,
      blobDelivery,
      rowsBilling: resolved.fallbackUsed ? [] : resolved.billing,
      rowsDelivery: resolved.fallbackUsed ? [] : resolved.delivery,
      fallbackUsed: resolved.fallbackUsed,
    })

    // Skip pure-fallback "missing on rows" noise for the empty-divergence class —
    // those are expected ACCEPTs. Only count amount mismatches when rows existed,
    // OR when blob had amounts and rows were empty (real drift beyond §E empty both).
    const counted = resolved.fallbackUsed
      ? diffs.filter((d) => d.blobAmount !== 0)
      : diffs

    for (const d of counted) {
      allDiffs.push(d)
      const key = `${p.mbaNumber}|${p.versionId}`
      const cur = mbaAgg.get(key) ?? {
        mba: p.mbaNumber,
        versionId: p.versionId,
        diffCount: 0,
        absDelta: 0,
      }
      cur.diffCount++
      cur.absDelta = roundMoney2(cur.absDelta + Math.abs(d.delta))
      mbaAgg.set(key, cur)
    }

    if (!resolved.fallbackUsed && counted.length > 0) {
      recordFinanceScheduleShadowDiff(
        p.versionId,
        blobBilling,
        blobDelivery,
        resolved.billing,
        resolved.delivery
      )
    }
  }

  const header =
    "version,line,month,component,basis,blobAmount,rowsAmount,delta,fallbackUsed,mba"
  const lines = [header]
  const mbaByVersion = new Map(published.map((p) => [p.versionId, p.mbaNumber]))
  for (const d of allDiffs) {
    lines.push(
      [
        d.versionId,
        csvEscape(d.lineItemId),
        d.month,
        d.component,
        d.basis,
        d.blobAmount,
        d.rowsAmount,
        d.delta,
        d.fallbackUsed ? "1" : "0",
        csvEscape(mbaByVersion.get(d.versionId) ?? ""),
      ].join(",")
    )
  }

  const topDivergentMbas = [...mbaAgg.values()]
    .sort((a, b) => b.absDelta - a.absDelta || b.diffCount - a.diffCount)
    .slice(0, 25)

  return {
    versionCount: published.length,
    fallbackCount,
    diffCount: allDiffs.length,
    csv: lines.join("\n") + (lines.length > 1 ? "\n" : ""),
    topDivergentMbas,
  }
}

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
