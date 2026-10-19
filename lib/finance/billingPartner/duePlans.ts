/**
 * Due Advertising Associates plans for one billing-partner pack.
 *
 * A version is due when its Sydney published_at falls in the billing cycle
 * (18th of the previous month through the 17th, exclusive of the 18th),
 * the AA workbook would be stored, and the version is not already on a sent
 * pack. Draft pack membership does not clear it.
 *
 * 0100 is AUTHOR ONLY. Pack rows are read only after the marker
 * 0100_billing_partner_packs is present (C-76). Until then every in-cycle
 * AA publish is due.
 */
import "server-only"

import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm"

import { getDb } from "@/db"
import {
  billingPartnerPackItems,
  billingPartnerPacks,
  clients,
  mediaPlanMasters,
  mediaPlanVersions,
  migrationMarkers,
  scheduleMonths,
} from "@/db/schema"

const PACK_MARKER = "0100_billing_partner_packs"
const SYDNEY = "Australia/Sydney"
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

export type ChangeKind = "new" | "amended"

export type DueAaPlan = {
  mbaNumber: string
  clientName: string
  campaignName: string
  versionId: number
  versionNumber: number
  publishedAt: string
  publishedBy: string | null
  changeKind: ChangeKind
  monthsChanged: string[] | null
  backDated: boolean
  /** Billing-basis media dollars for AA lines, keyed YYYY-MM. */
  aaMonthTotals: Record<string, number>
}

export type PublishedAaCandidate = {
  mbaNumber: string
  clientName: string
  campaignName: string
  versionId: number
  versionNumber: number
  masterId: number
  publishedAt: string
  publishedBy: string | null
  /** Earliest published_at on this master. Same instant as publishedAt means new. */
  firstPublishedAt: string
  isAaPlan: boolean
}

export type PackMembership = {
  versionId: number
  mbaNumber: string
  status: "draft" | "sent"
  billingMonth: string
  sentAt: string | null
}

export type ScheduleMonthCell = {
  versionId: number
  lineItemId: string
  component: string
  basis: string
  /** YYYY-MM-DD or YYYY-MM. */
  month: string
  amountCents: number
  /** Billing media on a line the AA workbook keeps. Totals use these rows only. */
  aaBillingMedia: boolean
}

export function normalizeBillingMonth(raw: string): string {
  const t = raw.trim()
  if (MONTH_KEY.test(t)) return `${t}-01`
  if (/^\d{4}-(0[1-9]|1[0-2])-01$/.test(t)) return t
  throw new Error(
    `billingMonth must be YYYY-MM or the first of that month, got ${raw}`,
  )
}

/** Sydney midnight at the start of ymd, as a UTC instant. */
export function sydneyMidnightUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  const utcGuess = new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0))
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const offsetAt = (instant: Date) => {
    const parts = Object.fromEntries(
      fmt
        .formatToParts(instant)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    )
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    )
    return asUtc - instant.getTime()
  }
  return new Date(utcGuess.getTime() - offsetAt(utcGuess))
}

/** Inclusive Sydney 18th of the previous month, exclusive Sydney 18th of billingMonth. */
export function billingCycleBounds(billingMonth: string): { start: Date; end: Date } {
  const first = normalizeBillingMonth(billingMonth)
  const year = Number(first.slice(0, 4))
  const month = Number(first.slice(5, 7))
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const startYmd = `${prevYear}-${pad2(prevMonth)}-18`
  const endYmd = `${year}-${pad2(month)}-18`
  return { start: sydneyMidnightUtc(startYmd), end: sydneyMidnightUtc(endYmd) }
}

export function selectDueAaPlans(input: {
  billingMonth: string
  versions: PublishedAaCandidate[]
  packs: PackMembership[]
  scheduleMonths: ScheduleMonthCell[]
}): DueAaPlan[] {
  const billingMonth = normalizeBillingMonth(input.billingMonth)
  const bounds = billingCycleBounds(billingMonth)
  const sentVersionIds = new Set(
    input.packs.filter((pack) => pack.status === "sent").map((pack) => pack.versionId),
  )
  const byVersion = groupByVersion(input.scheduleMonths)
  const due: DueAaPlan[] = []

  for (const version of input.versions) {
    if (!version.isAaPlan) continue
    if (sentVersionIds.has(version.versionId)) continue
    const publishedAt = new Date(version.publishedAt).getTime()
    if (publishedAt < bounds.start.getTime() || publishedAt >= bounds.end.getTime()) continue

    const lastSentId = lastSentVersionId(version.mbaNumber, input.packs)
    const currentRows = byVersion.get(version.versionId) ?? []
    const previousRows = lastSentId == null ? [] : (byVersion.get(lastSentId) ?? [])
    const monthsChanged = monthsThatDiffer(currentRows, previousRows)

    due.push({
      mbaNumber: version.mbaNumber,
      clientName: version.clientName,
      campaignName: version.campaignName,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      publishedAt: new Date(version.publishedAt).toISOString(),
      publishedBy: version.publishedBy,
      changeKind: sameInstant(version.publishedAt, version.firstPublishedAt) ? "new" : "amended",
      monthsChanged,
      backDated: monthsChanged != null && monthsChanged.some((month) => month < billingMonth.slice(0, 7)),
      aaMonthTotals: aaMonthTotals(currentRows),
    })
  }

  due.sort((a, b) => {
    const at = a.publishedAt.localeCompare(b.publishedAt)
    if (at !== 0) return at
    const mba = a.mbaNumber.localeCompare(b.mbaNumber)
    if (mba !== 0) return mba
    return a.versionNumber - b.versionNumber
  })
  return due
}

export async function listDueAaPlans(billingMonth: string): Promise<DueAaPlan[]> {
  const bounds = billingCycleBounds(billingMonth)
  const db = getDb()
  const versionRows = await db
    .select({
      versionId: mediaPlanVersions.id,
      versionNumber: mediaPlanVersions.versionNumber,
      mbaNumber: mediaPlanVersions.mbaNumber,
      publishedAt: mediaPlanVersions.publishedAt,
      publishedBy: mediaPlanVersions.publishedBy,
      campaignName: sql<string>`coalesce(${mediaPlanVersions.campaignName}, ${mediaPlanMasters.campaignName}, '')`,
      clientName: sql<string>`coalesce(${clients.mpClientName}, ${mediaPlanMasters.mpClientName}, '')`,
      masterId: mediaPlanMasters.id,
      firstPublishedAt: sql<string | Date>`(
        SELECT min(earlier.published_at)
        FROM media_plan_versions earlier
        WHERE earlier.master_id = ${mediaPlanMasters.id}
          AND earlier.published_at IS NOT NULL
      )`,
    })
    .from(mediaPlanVersions)
    .innerJoin(mediaPlanMasters, eq(mediaPlanVersions.masterId, mediaPlanMasters.id))
    .leftJoin(clients, eq(mediaPlanMasters.clientId, clients.id))
    .where(
      and(
        isNotNull(mediaPlanVersions.publishedAt),
        gte(mediaPlanVersions.publishedAt, bounds.start.toISOString()),
        lt(mediaPlanVersions.publishedAt, bounds.end.toISOString()),
      ),
    )

  const packs = await loadPackMembership()
  const sentVersionIds = new Set(
    packs.filter((pack) => pack.status === "sent").map((pack) => pack.versionId),
  )
  const open = versionRows.filter(
    (row) => row.publishedAt != null && !sentVersionIds.has(row.versionId),
  )
  const aa = await mapPool(open, 4, async (row) => {
    const decision = await aaWorkbookStored(row.mbaNumber, row.versionNumber)
    if (!decision.stores || row.publishedAt == null) return null
    const publishedAt = instantIso(row.publishedAt)
    const firstPublishedAt = instantIso(row.firstPublishedAt)
    const candidate: PublishedAaCandidate = {
      mbaNumber: row.mbaNumber,
      clientName: String(row.clientName ?? ""),
      campaignName: String(row.campaignName ?? ""),
      versionId: row.versionId,
      versionNumber: row.versionNumber,
      masterId: row.masterId,
      publishedAt,
      publishedBy: row.publishedBy,
      firstPublishedAt,
      isAaPlan: true,
    }
    return { candidate, lineIds: decision.lineIds }
  })
  const kept = aa.filter((row): row is NonNullable<typeof row> => row != null)
  const lineIdsByVersion = new Map(kept.map((row) => [row.candidate.versionId, row.lineIds]))
  const extraSentIds = new Set<number>()
  for (const row of kept) {
    const lastSent = lastSentVersionId(row.candidate.mbaNumber, packs)
    if (lastSent != null) extraSentIds.add(lastSent)
  }
  const scheduleIds = [
    ...new Set([
      ...kept.map((row) => row.candidate.versionId),
      ...extraSentIds,
    ]),
  ]
  const schedule = await loadScheduleCells(scheduleIds, lineIdsByVersion)
  return selectDueAaPlans({
    billingMonth,
    versions: kept.map((row) => row.candidate),
    packs,
    scheduleMonths: schedule,
  })
}

async function loadPackMembership(): Promise<PackMembership[]> {
  const db = getDb()
  const [marker] = await db
    .select({ key: migrationMarkers.key })
    .from(migrationMarkers)
    .where(eq(migrationMarkers.key, PACK_MARKER))
    .limit(1)
  if (!marker) return []

  const rows = await db
    .select({
      versionId: billingPartnerPackItems.versionId,
      mbaNumber: billingPartnerPackItems.mbaNumber,
      status: billingPartnerPacks.status,
      billingMonth: billingPartnerPacks.billingMonth,
      sentAt: billingPartnerPacks.sentAt,
    })
    .from(billingPartnerPackItems)
    .innerJoin(
      billingPartnerPacks,
      eq(billingPartnerPackItems.packId, billingPartnerPacks.id),
    )

  return rows.map((row) => ({
    versionId: row.versionId,
    mbaNumber: row.mbaNumber,
    status: row.status === "sent" ? "sent" : "draft",
    billingMonth: row.billingMonth,
    sentAt: row.sentAt,
  }))
}

/**
 * Same store decision as renderPlanVersionDocuments: the workbook is stored
 * only when planHasAdvertisingAssociatesLineItem is true and the AA filter
 * still has a line.
 */
async function aaWorkbookStored(
  mbaNumber: string,
  versionNumber: number,
): Promise<{ stores: boolean; lineIds: Set<string> }> {
  const { buildMediaItemsFromPersisted } = await import(
    "@/lib/docs/buildMediaItemsFromPersisted"
  )
  const {
    advertisingAssociatesFilteredPlanHasLineItems,
    filterMediaItemsForAdvertisingAssociates,
    planHasAdvertisingAssociatesLineItem,
    shouldIncludeMediaPlanLineItem,
  } = await import("@/lib/mediaplan/advertisingAssociatesExcel")

  const built = await buildMediaItemsFromPersisted({ mbaNumber, versionNumber })
  if (
    !planHasAdvertisingAssociatesLineItem(
      built.mediaItems,
      built.publishers,
      shouldIncludeMediaPlanLineItem,
    )
  ) {
    return { stores: false, lineIds: new Set() }
  }
  const filtered = filterMediaItemsForAdvertisingAssociates(
    built.mediaItems,
    built.publishers,
  )
  if (!advertisingAssociatesFilteredPlanHasLineItems(filtered)) {
    return { stores: false, lineIds: new Set() }
  }
  const lineIds = new Set<string>()
  for (const items of Object.values(filtered)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const id = item.line_item_id ?? item.lineItemId
      if (id != null && String(id).trim()) lineIds.add(String(id).trim())
    }
  }
  return { stores: true, lineIds }
}

async function loadScheduleCells(
  versionIds: number[],
  aaLineIdsByVersion: Map<number, Set<string>>,
): Promise<ScheduleMonthCell[]> {
  if (versionIds.length === 0) return []
  const db = getDb()
  const cells: ScheduleMonthCell[] = []
  for (let i = 0; i < versionIds.length; i += 200) {
    const chunk = versionIds.slice(i, i + 200)
    const rows = await db
      .select({
        versionId: scheduleMonths.versionId,
        lineItemId: scheduleMonths.lineItemId,
        component: scheduleMonths.component,
        basis: scheduleMonths.basis,
        month: scheduleMonths.month,
        amountCents: scheduleMonths.amountCents,
      })
      .from(scheduleMonths)
      .where(inArray(scheduleMonths.versionId, chunk))
    for (const row of rows) {
      const lineIds = aaLineIdsByVersion.get(row.versionId)
      cells.push({
        versionId: row.versionId,
        lineItemId: row.lineItemId,
        component: row.component,
        basis: row.basis,
        month: row.month,
        amountCents: Number(row.amountCents),
        aaBillingMedia:
          row.basis === "billing" &&
          row.component === "media" &&
          (lineIds?.has(row.lineItemId) ?? false),
      })
    }
  }
  return cells
}

function lastSentVersionId(mbaNumber: string, packs: PackMembership[]): number | null {
  const sent = packs.filter((pack) => pack.mbaNumber === mbaNumber && pack.status === "sent")
  if (sent.length === 0) return null
  sent.sort((a, b) => {
    const at = (a.sentAt ?? "").localeCompare(b.sentAt ?? "")
    if (at !== 0) return at
    return a.versionId - b.versionId
  })
  return sent[sent.length - 1]!.versionId
}

function monthsThatDiffer(
  current: ScheduleMonthCell[],
  previous: ScheduleMonthCell[],
): string[] | null {
  if (current.length === 0 || previous.length === 0) return null
  const left = cellAmounts(current)
  const right = cellAmounts(previous)
  const months = new Set<string>()
  const keys = new Set([...left.keys(), ...right.keys()])
  for (const key of keys) {
    const a = left.has(key) ? left.get(key)! : null
    const b = right.has(key) ? right.get(key)! : null
    if (a !== b) months.add(key.slice(key.lastIndexOf("|") + 1))
  }
  return [...months].sort()
}

function cellAmounts(rows: ScheduleMonthCell[]): Map<string, number> {
  const amounts = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.lineItemId}|${row.component}|${row.basis}|${monthKey(row.month)}`
    amounts.set(key, (amounts.get(key) ?? 0) + row.amountCents)
  }
  return amounts
}

function aaMonthTotals(rows: ScheduleMonthCell[]): Record<string, number> {
  const cents = new Map<string, number>()
  for (const row of rows) {
    if (!row.aaBillingMedia || row.basis !== "billing" || row.component !== "media") continue
    const month = monthKey(row.month)
    cents.set(month, (cents.get(month) ?? 0) + row.amountCents)
  }
  const totals: Record<string, number> = {}
  for (const month of [...cents.keys()].sort()) {
    totals[month] = (cents.get(month) ?? 0) / 100
  }
  return totals
}

function groupByVersion(rows: ScheduleMonthCell[]): Map<number, ScheduleMonthCell[]> {
  const grouped = new Map<number, ScheduleMonthCell[]>()
  for (const row of rows) {
    const list = grouped.get(row.versionId)
    if (list) list.push(row)
    else grouped.set(row.versionId, [row])
  }
  return grouped
}

function monthKey(month: string): string {
  return month.slice(0, 7)
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime()
}

function instantIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toISOString()
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      out[index] = await fn(items[index]!)
    }
  })
  await Promise.all(workers)
  return out
}
