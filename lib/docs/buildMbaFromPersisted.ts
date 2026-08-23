/**
 * PC3 — build MBA PDF inputs strictly from persisted rows + snapshots.
 * Client-sent totals are never accepted.
 */

import { format, parseISO } from "date-fns"
import { and, eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { readMbaLineApprovals } from "@/lib/data/readApprovals"
import { addGst } from "@/lib/finance/gst"
import { isoMonthToScheduleMonthYear } from "@/lib/finance/computeCampaignFinancials"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import {
  centsToDollars,
  loadScheduleMonthRowsForVersions,
  mediaTypeFromScheduleLineId,
  resolveVersionSchedules,
  type ScheduleMonthRowInput,
} from "@/lib/finance/scheduleMonthsSource"
import type { ApprovedSlice } from "@/lib/finance/approvedSlice"
import { deriveApprovedSliceFromScheduleRows } from "@/lib/docs/deriveApprovedSliceFromSchedule"
import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"
import { roundMoney2 } from "@/lib/format/money"
import type { MBAData } from "@/lib/generateMBA"
import {
  computeSnapshotChecksum,
  snapshotChecksumFooter,
  type ChecksumScheduleRow,
} from "@/lib/docs/snapshotChecksum"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

export class PersistedDocError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "NOT_APPROVED"
      | "MISSING_SLICE"
      | "BAD_REQUEST",
    message: string
  ) {
    super(message)
    this.name = "PersistedDocError"
  }
}

function normaliseMba(mba: string): string {
  return String(mba ?? "").trim().toLowerCase()
}

function formatDateDdMmYyyy(raw: unknown): string {
  if (raw == null || raw === "") return ""
  const s = String(raw).trim()
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return format(parseISO(s.slice(0, 10)), "dd/MM/yyyy")
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy")
  } catch {
    /* fall through */
  }
  return s
}

function monthKey(month: string): string {
  const raw = String(month ?? "").trim()
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7)
  return raw
}

function sliceMonthSet(slice: ApprovedSlice): Set<string> | null {
  const months = new Set<string>()
  for (const line of slice.lines ?? []) {
    for (const m of line.months ?? []) months.add(monthKey(m))
  }
  return months.size > 0 ? months : null
}

function sliceLineSet(slice: ApprovedSlice): Set<string> {
  return new Set((slice.lines ?? []).map((l) => String(l.lineItemId)))
}

function toChecksumRows(rows: ScheduleMonthRowInput[]): ChecksumScheduleRow[] {
  return rows.map((r) => ({
    lineItemId: r.lineItemId,
    component: r.component,
    basis: r.basis,
    month: String(r.month).slice(0, 10),
    amountCents: Number(r.amountCents) || 0,
    source: r.source,
  }))
}

function rowInApprovedSlice(
  r: ScheduleMonthRowInput,
  approvedIds: Set<string>,
  approvedMonths: Set<string> | null
): boolean {
  const mk = monthKey(r.month)
  if (approvedMonths && !approvedMonths.has(mk)) return false
  if (r.lineItemId.startsWith("__service__")) return true
  if (approvedIds.size > 0 && !approvedIds.has(r.lineItemId)) return false
  return true
}

export type MbaMediaBreakdownArgs = {
  scheduleRows: ScheduleMonthRowInput[]
  approvedIds: Set<string>
  approvedMonths: Set<string> | null
  unapprovedLineIds: Set<string>
}

export type MbaMediaBreakdown = {
  grossMediaByType: Map<string, number>
  billedMediaCents: number
  clientPaidCents: number
}

/**
 * MBA media table = billed approved-slice media + delivery-only (client-paid)
 * lines. Billing schedule stays billed-only; this is approval-to-spend.
 */
export function computeMbaMediaBreakdown(
  args: MbaMediaBreakdownArgs
): MbaMediaBreakdown {
  const { scheduleRows, approvedIds, approvedMonths, unapprovedLineIds } = args
  const unapprovedCanon = new Set<string>()
  for (const raw of unapprovedLineIds) {
    const canon = toBillingOverrideLineItemId(raw)
    if (canon) unapprovedCanon.add(canon)
  }

  const billedByType = new Map<string, number>()
  let billedMediaCents = 0
  for (const r of scheduleRows) {
    if (r.basis !== "billing" || r.component !== "media") continue
    if (!rowInApprovedSlice(r, approvedIds, approvedMonths)) continue
    if (r.lineItemId.startsWith("__service__")) continue
    const key = mediaTypeFromScheduleLineId(r.lineItemId) ?? "search"
    if (key === "production") continue
    const amt = Number(r.amountCents) || 0
    billedByType.set(key, (billedByType.get(key) ?? 0) + amt)
    billedMediaCents += amt
  }

  const hasBillingMedia = new Set<string>()
  for (const r of scheduleRows) {
    if (r.basis !== "billing" || r.component !== "media") continue
    if (r.lineItemId.startsWith("__service__")) continue
    const canon = toBillingOverrideLineItemId(r.lineItemId)
    if (canon) hasBillingMedia.add(canon)
  }

  const clientPaidByType = new Map<string, number>()
  let clientPaidCents = 0
  for (const r of scheduleRows) {
    if (r.basis !== "delivery" || r.component !== "media") continue
    if (r.lineItemId.startsWith("__service__")) continue
    const canon = toBillingOverrideLineItemId(r.lineItemId)
    if (!canon) continue
    if (hasBillingMedia.has(canon)) continue
    if (unapprovedCanon.has(canon)) continue
    const mk = monthKey(r.month)
    if (approvedMonths && !approvedMonths.has(mk)) continue
    const key = mediaTypeFromScheduleLineId(r.lineItemId) ?? "search"
    if (key === "production") continue
    const amt = Number(r.amountCents) || 0
    clientPaidByType.set(key, (clientPaidByType.get(key) ?? 0) + amt)
    clientPaidCents += amt
  }

  const grossMediaByType = new Map(billedByType)
  for (const [key, amt] of clientPaidByType) {
    grossMediaByType.set(key, (grossMediaByType.get(key) ?? 0) + amt)
  }

  return { grossMediaByType, billedMediaCents, clientPaidCents }
}

export type PersistedMbaRender = {
  mbaData: MBAData
  checksumHex: string
  footer: string
  filename: string
  versionId: number
  versionNumber: number
  campaignStatus: string
  sliceSource: "persisted" | "derived"
}

/**
 * Load version + schedule_months + approved_slice + fee snapshot and build MBAData.
 * Throws PersistedDocError for 404 / 422 conditions.
 */
export async function buildMbaFromPersisted(args: {
  mbaNumber: string
  versionNumber: number
  liveCampaignStatus?: string | null
}): Promise<PersistedMbaRender> {
  const mbaNumber = String(args.mbaNumber ?? "").trim()
  const versionNumber = Number(args.versionNumber)
  if (!mbaNumber || !Number.isFinite(versionNumber) || versionNumber <= 0) {
    throw new PersistedDocError(
      "BAD_REQUEST",
      "mba_number and version_number are required"
    )
  }

  const db = getDb()
  const [version] = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(
      and(
        sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(mbaNumber)}`,
        eq(schema.mediaPlanVersions.versionNumber, versionNumber)
      )
    )
    .limit(1)

  if (!version) {
    throw new PersistedDocError(
      "NOT_FOUND",
      `Version not found for MBA ${mbaNumber} v${versionNumber}`
    )
  }

  if (!isVersionPublished(version)) {
    throw new PersistedDocError(
      "NOT_APPROVED",
      `Document render requires a published version (published_at set; campaign_status="${String(version.campaignStatus ?? "") || "empty"}")`
    )
  }

  const [master] = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, version.masterId))
    .limit(1)

  let client = {
    name: "",
    streetaddress: "",
    suburb: "",
    state: "",
    postcode: "",
  }
  if (master?.clientId != null) {
    const [c] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, master.clientId))
      .limit(1)
    if (c) {
      client = {
        name: String(c.mpClientName ?? c.legalbusinessname ?? ""),
        streetaddress: String(c.streetaddress ?? ""),
        suburb: String(c.suburb ?? ""),
        state: String(c.stateDropdown ?? ""),
        postcode: String(c.postcode ?? ""),
      }
    }
  }

  const [feeRow] = await db
    .select({ fees: schema.mbaFeeSnapshots.fees })
    .from(schema.mbaFeeSnapshots)
    .where(eq(schema.mbaFeeSnapshots.versionId, version.id))
    .limit(1)

  const rowsByVersion = await loadScheduleMonthRowsForVersions([version.id])
  const scheduleRows = rowsByVersion.get(version.id) ?? []

  const versionAsRecord: Record<string, unknown> = {
    id: version.id,
    mba_number: version.mbaNumber,
    version_number: version.versionNumber,
    billingSchedule:
      version.legacySchedules && typeof version.legacySchedules === "object"
        ? (version.legacySchedules as Record<string, unknown>).billingSchedule
        : null,
    deliverySchedule:
      version.legacySchedules && typeof version.legacySchedules === "object"
        ? (version.legacySchedules as Record<string, unknown>).deliverySchedule
        : null,
  }
  const resolved = resolveVersionSchedules(versionAsRecord, scheduleRows)

  const approvals = await readMbaLineApprovals(
    String(version.mbaNumber),
    Number(version.versionNumber)
  )
  const unapprovedLineIds = new Set<string>()
  if (approvals.ok) {
    for (const line of approvals.lines) {
      if (line.approved === false) {
        const canon = toBillingOverrideLineItemId(line.line_item_id)
        if (canon) unapprovedLineIds.add(canon)
      }
    }
  }

  let approvedSlice = version.approvedSlice as ApprovedSlice | null
  let sliceSource: "persisted" | "derived" = "persisted"
  if (!approvedSlice || typeof approvedSlice !== "object" || !Array.isArray(approvedSlice.lines)) {
    approvedSlice = deriveApprovedSliceFromScheduleRows(scheduleRows, { unapprovedLineIds })
    sliceSource = "derived"
  }
  if (!approvedSlice) {
    throw new PersistedDocError(
      "MISSING_SLICE",
      "No billing schedule persisted for this version — open the plan and save it once, then download"
    )
  }

  const approvedIds = sliceLineSet(approvedSlice)
  const approvedMonths = sliceMonthSet(approvedSlice)

  const breakdown = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds,
    approvedMonths,
    unapprovedLineIds,
  })

  const gross_media = [...breakdown.grossMediaByType.entries()]
    .filter(([, cents]) => cents !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, cents]) => ({
      media_type: MEDIA_TYPE_LABELS[key] ?? key,
      gross_amount: centsToDollars(cents),
    }))

  let mediaCents = 0
  let feeCents = 0
  let adservingCents = 0
  let productionCents = 0
  for (const line of approvedSlice.lines) {
    mediaCents += Number(line.mediaCents) || 0
    feeCents += Number(line.feeCents) || 0
    adservingCents += Number(line.adservingCents) || 0
    productionCents += Number(line.productionCents) || 0
  }
  const exGstCents =
    Number(approvedSlice.totalCents) ||
    mediaCents + feeCents + adservingCents + productionCents
  const billedExGst = centsToDollars(exGstCents)
  const approvalExGst = centsToDollars(exGstCents + breakdown.clientPaidCents)
  const clientPaidDollars = centsToDollars(breakdown.clientPaidCents)

  const monthTotals = new Map<string, number>()
  for (const r of scheduleRows) {
    if (r.basis !== "billing") continue
    if (!rowInApprovedSlice(r, approvedIds, approvedMonths)) continue
    const mk = monthKey(r.month)
    monthTotals.set(mk, (monthTotals.get(mk) ?? 0) + (Number(r.amountCents) || 0))
  }

  const billingFromRows = [...monthTotals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mk, cents]) => {
      const monthYear = isoMonthToScheduleMonthYear(mk)
      return {
        monthYear,
        totalAmount: String(roundMoney2(centsToDollars(cents))),
      }
    })

  const finalBilling =
    billingFromRows.length > 0
      ? billingFromRows
      : resolved.billing.map((b) => ({
          monthYear: b.monthYear,
          totalAmount: String(b.totalAmount ?? "0"),
        }))

  const checksumHex = computeSnapshotChecksum({
    scheduleMonths: toChecksumRows(scheduleRows),
    approvedSlice,
    feeSnapshot: feeRow?.fees ?? null,
  })

  const footer = snapshotChecksumFooter(versionNumber, checksumHex)

  const dateLabel =
    formatDateDdMmYyyy(version.campaignStartDate) ||
    formatDateDdMmYyyy(version.createdAt) ||
    "01/01/1970"

  const mbaData: MBAData = {
    date: dateLabel,
    mba_number: version.mbaNumber,
    campaign_name: String(version.campaignName ?? master?.campaignName ?? ""),
    campaign_brand: String(version.brand ?? ""),
    po_number: String(version.poNumber ?? ""),
    media_plan_version: String(versionNumber),
    client,
    campaign: {
      date_start: formatDateDdMmYyyy(version.campaignStartDate),
      date_end: formatDateDdMmYyyy(version.campaignEndDate),
    },
    gross_media,
    totals: {
      gross_media: centsToDollars(
        breakdown.billedMediaCents + breakdown.clientPaidCents
      ),
      service_fee: centsToDollars(feeCents),
      production: centsToDollars(productionCents),
      adserving: centsToDollars(adservingCents),
      totals_ex_gst: approvalExGst,
      total_inc_gst: addGst(approvalExGst),
      billing_ex_gst: billedExGst,
      billing_inc_gst: addGst(billedExGst),
      ...(breakdown.clientPaidCents > 0
        ? { client_paid_media: clientPaidDollars }
        : {}),
    },
    billingSchedule: finalBilling,
    checksumFooter: footer,
  }

  const safeClient = (client.name || "client").replace(/[^\w\-]+/g, "_")
  const safeCampaign = (mbaData.campaign_name || "campaign").replace(/[^\w\-]+/g, "_")
  const filename = `MBA_${safeClient}_${safeCampaign}_v${versionNumber}.pdf`

  return {
    mbaData,
    checksumHex,
    footer,
    filename,
    versionId: version.id,
    versionNumber,
    campaignStatus: String(version.campaignStatus ?? ""),
    sliceSource,
  }
}

/** Recompute checksum for an already-loaded version (tripwire / savePlan). */
export async function computeChecksumForVersionId(versionId: number): Promise<{
  checksumHex: string
  stored: string | null
}> {
  const db = getDb()
  const [version] = await db
    .select({
      id: schema.mediaPlanVersions.id,
      approvedSlice: schema.mediaPlanVersions.approvedSlice,
      snapshotChecksum: schema.mediaPlanVersions.snapshotChecksum,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
    .limit(1)

  if (!version) {
    throw new PersistedDocError("NOT_FOUND", `version ${versionId} not found`)
  }

  const [feeRow] = await db
    .select({ fees: schema.mbaFeeSnapshots.fees })
    .from(schema.mbaFeeSnapshots)
    .where(eq(schema.mbaFeeSnapshots.versionId, versionId))
    .limit(1)

  const rowsByVersion = await loadScheduleMonthRowsForVersions([versionId])
  const scheduleRows = rowsByVersion.get(versionId) ?? []

  const checksumHex = computeSnapshotChecksum({
    scheduleMonths: toChecksumRows(scheduleRows),
    approvedSlice: version.approvedSlice as ApprovedSlice | null,
    feeSnapshot: feeRow?.fees ?? null,
  })

  return {
    checksumHex,
    stored: version.snapshotChecksum ?? null,
  }
}
