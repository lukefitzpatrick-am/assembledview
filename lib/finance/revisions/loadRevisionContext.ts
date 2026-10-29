/**
 * Load everything the billing revision planner needs for one MBA, from the
 * published tip (pointer AND stamp). Read only. Runs inside the writer's
 * transaction too, so the plan is rebuilt from the same rows it writes.
 */
import "server-only"

import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { schema } from "@/db"
import { isFinancePeriodsLockEnforced } from "@/lib/finance/periods/flag"
import { rowsOf } from "@/lib/xero/dbRows"

import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

import { assembleRevisionLines } from "./assembleRevisionLines"
import { monthKeyRange } from "./planBillingRevision"
import { isProductionLikeLine } from "./planTrueUp"
import { resolveMonthLocks, revisionMonthSpan, type LockFinanceRecord } from "./resolveMonthLocks"
import type {
  Cents,
  MonthKey,
  MonthLock,
  RevisionInput,
  RevisionLine,
  RevisionOptions,
  RevisionRequest,
  TrueUpComponentKey,
} from "./types"

type Schema = typeof schema
export type RevisionExec = PostgresJsDatabase<Schema>

export type BaseBillingRow = {
  lineItemId: string
  component: "media" | "fee" | "adserving"
  month: string // YYYY-MM-01
  amountCents: number
  source: "computed" | "override"
}

export type RevisionFinanceRecord = LockFinanceRecord & { id: number }

export type RevisionContext = {
  masterId: number
  mbaNumber: string
  base: {
    id: number
    versionNumber: number
    publishedAt: string
    mbaScope: unknown
    legacySchedules: Record<string, unknown> | null
    approvedSlice: unknown
    campaignName: string | null
  }
  campaignStartMonth: MonthKey | null
  campaignEndMonth: MonthKey | null
  campaignMonths: MonthKey[]
  currentMonth: MonthKey
  lines: RevisionLine[]
  billingRows: BaseBillingRow[]
  records: RevisionFinanceRecord[]
  locks: MonthLock[]
  aaLockedMonths: MonthKey[]
  hasAaLines: boolean
  hasFixedHeaderFee: boolean
  partial: boolean
  workingDraftCount: number
  /** schedule_months line ids with no line_items row (left as they are). */
  unmatchedLineIds: string[]
}

export class RevisionContextError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "NOT_PUBLISHED",
    message: string,
  ) {
    super(message)
    this.name = "RevisionContextError"
  }
}

export type AaLineIdsLoader = (mbaNumber: string, versionNumber: number) => Promise<Set<string>>

const defaultAaLineIds: AaLineIdsLoader = async (mba, vn) => {
  const { aaBillingLineIds } = await import("@/lib/finance/billingPartner/sentAaBaseline")
  return aaBillingLineIds(mba, vn)
}

function monthOf(date: string | null | undefined): MonthKey | null {
  const s = String(date ?? "").slice(0, 7)
  return /^\d{4}-\d{2}$/.test(s) ? s : null
}

export async function loadRevisionContext(
  exec: RevisionExec,
  args: { mbaNumber: string; now: Date; lockMaster?: boolean; aaLineIds?: AaLineIdsLoader },
): Promise<RevisionContext> {
  const mba = String(args.mbaNumber ?? "").trim()
  if (!mba) throw new RevisionContextError("NOT_FOUND", "MBA number is required")

  const masterRows = rowsOf<{ id: number | string; mba_number: string }>(
    await exec.execute(
      args.lockMaster
        ? sql`SELECT id, mba_number FROM media_plan_masters WHERE lower(mba_number) = lower(${mba}) LIMIT 1 FOR UPDATE`
        : sql`SELECT id, mba_number FROM media_plan_masters WHERE lower(mba_number) = lower(${mba}) LIMIT 1`,
    ),
  )
  const masterRow = masterRows[0]
  if (!masterRow) throw new RevisionContextError("NOT_FOUND", `No media plan ${mba}`)
  const masterId = Number(masterRow.id)

  const tipRows = await exec
    .select({
      id: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      publishedAt: schema.mediaPlanVersions.publishedAt,
      mbaScope: schema.mediaPlanVersions.mbaScope,
      legacySchedules: schema.mediaPlanVersions.legacySchedules,
      approvedSlice: schema.mediaPlanVersions.approvedSlice,
      campaignName: schema.mediaPlanVersions.campaignName,
      campaignStartDate: schema.mediaPlanVersions.campaignStartDate,
      campaignEndDate: schema.mediaPlanVersions.campaignEndDate,
      masterStart: schema.mediaPlanMasters.campaignStartDate,
      masterEnd: schema.mediaPlanMasters.campaignEndDate,
    })
    .from(schema.mediaPlanMasters)
    .innerJoin(
      schema.mediaPlanVersions,
      and(
        eq(schema.mediaPlanVersions.id, schema.mediaPlanMasters.publishedVersionId),
        sql`${schema.mediaPlanVersions.publishedAt} IS NOT NULL`,
      ),
    )
    .where(eq(schema.mediaPlanMasters.id, masterId))
    .limit(1)
  const tip = tipRows[0]
  if (!tip || !tip.publishedAt) {
    throw new RevisionContextError("NOT_PUBLISHED", `${mba} has no published version`)
  }

  const lineRows = await exec
    .select({
      lineItemId: schema.lineItems.lineItemId,
      channel: schema.lineItems.channel,
      publisher: schema.lineItems.publisher,
      platform: schema.lineItems.platform,
      clientPaysForMedia: schema.lineItems.clientPaysForMedia,
      position: schema.lineItems.position,
    })
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, tip.id))

  const smRows = await exec
    .select({
      lineItemId: schema.scheduleMonths.lineItemId,
      component: schema.scheduleMonths.component,
      month: schema.scheduleMonths.month,
      amountCents: schema.scheduleMonths.amountCents,
      source: schema.scheduleMonths.source,
    })
    .from(schema.scheduleMonths)
    .where(and(eq(schema.scheduleMonths.versionId, tip.id), eq(schema.scheduleMonths.basis, "billing")))

  const billingRows: BaseBillingRow[] = smRows.map((r) => ({
    lineItemId: r.lineItemId,
    component: r.component as BaseBillingRow["component"],
    month: String(r.month).slice(0, 10),
    amountCents: Number(r.amountCents) || 0,
    source: r.source === "override" ? "override" : "computed",
  }))

  const records = (
    await exec
      .select({
        id: schema.financeBillingRecords.id,
        invoiceKey: schema.financeBillingRecords.invoiceKey,
        mbaNumber: schema.financeBillingRecords.mbaNumber,
        billingMonth: schema.financeBillingRecords.billingMonth,
        approvedAt: schema.financeBillingRecords.approvedAt,
        exportedAt: schema.financeBillingRecords.exportedAt,
        matchedXeroInvoiceId: schema.financeBillingRecords.matchedXeroInvoiceId,
        billed: schema.financeBillingRecords.billed,
        billedAt: schema.financeBillingRecords.billedAt,
      })
      .from(schema.financeBillingRecords)
      .where(
        sql`lower(${schema.financeBillingRecords.mbaNumber}) = lower(${mba})
            OR lower(${schema.financeBillingRecords.invoiceKey}) LIKE ${`media:${mba.toLowerCase()}:%`}`,
      )
  ).map((r) => ({ ...r, id: Number(r.id) }))

  // AA packs (marker 0100) and AA line ids, only when a sent pack holds this MBA.
  let sentAaPackMonths: string[] = []
  const packMarker = await exec
    .select({ key: schema.migrationMarkers.key })
    .from(schema.migrationMarkers)
    .where(eq(schema.migrationMarkers.key, "0100_billing_partner_packs"))
    .limit(1)
  if (packMarker.length > 0) {
    const packs = await exec
      .select({ billingMonth: schema.billingPartnerPacks.billingMonth })
      .from(schema.billingPartnerPackItems)
      .innerJoin(schema.billingPartnerPacks, eq(schema.billingPartnerPackItems.packId, schema.billingPartnerPacks.id))
      .where(
        and(
          sql`lower(${schema.billingPartnerPackItems.mbaNumber}) = lower(${mba})`,
          eq(schema.billingPartnerPacks.status, "sent"),
        ),
      )
    sentAaPackMonths = packs.map((p) => String(p.billingMonth))
  }
  let aaIds = new Set<string>()
  if (sentAaPackMonths.length > 0) {
    aaIds = await (args.aaLineIds ?? defaultAaLineIds)(mba, tip.versionNumber)
  }

  const lockEnforced = isFinancePeriodsLockEnforced()
  const periods = lockEnforced
    ? (
        await exec
          .select({ month: schema.financePeriods.periodMonth, status: schema.financePeriods.status })
          .from(schema.financePeriods)
      ).map((p) => ({ month: String(p.month), status: String(p.status) }))
    : []

  const drafts = await exec
    .select({ n: sql<number>`count(*)` })
    .from(schema.planWorkingDrafts)
    .where(eq(schema.planWorkingDrafts.masterId, masterId))

  const campaignStartMonth = monthOf(tip.campaignStartDate) ?? monthOf(tip.masterStart)
  const campaignEndMonth = monthOf(tip.campaignEndDate) ?? monthOf(tip.masterEnd)

  // Lines: line_items order, cells from billing-basis schedule_months (ids joined bare, MB-11).
  const { lines, unmatchedLineIds } = assembleRevisionLines({ lineRows, billingRows, aaLineIds: aaIds })

  const campaignMonths =
    campaignStartMonth && campaignEndMonth ? monthKeyRange(campaignStartMonth, campaignEndMonth) : []

  const now = args.now
  const cellMonths = billingRows.map((r) => r.month.slice(0, 7))
  const firstPass = resolveMonthLocks({
    mbaNumber: mba,
    months: [],
    records,
    sentAaPackMonths,
    periods,
    financePeriodsLockEnforced: lockEnforced,
    lastCampaignMonth: campaignEndMonth,
    now,
  })
  const span = revisionMonthSpan({
    campaignStartMonth,
    campaignEndMonth,
    currentMonth: firstPass.currentMonth,
    cellMonths,
  })
  const resolved = resolveMonthLocks({
    mbaNumber: mba,
    months: span,
    records,
    sentAaPackMonths,
    periods,
    financePeriodsLockEnforced: lockEnforced,
    lastCampaignMonth: campaignEndMonth,
    now,
  })

  const scope = tip.mbaScope as { partial?: unknown } | null
  return {
    masterId,
    mbaNumber: masterRow.mba_number,
    base: {
      id: tip.id,
      versionNumber: tip.versionNumber,
      publishedAt: String(tip.publishedAt),
      mbaScope: tip.mbaScope,
      legacySchedules: (tip.legacySchedules as Record<string, unknown> | null) ?? null,
      approvedSlice: tip.approvedSlice,
      campaignName: tip.campaignName,
    },
    campaignStartMonth,
    campaignEndMonth,
    campaignMonths,
    currentMonth: resolved.currentMonth,
    lines,
    billingRows,
    records,
    locks: resolved.locks,
    aaLockedMonths: resolved.aaLockedMonths,
    hasAaLines: aaIds.size > 0,
    hasFixedHeaderFee: billingRows.some((r) => r.lineItemId === "__service__fees" && r.amountCents !== 0),
    partial: scope?.partial === true,
    workingDraftCount: Number(drafts[0]?.n ?? 0),
    unmatchedLineIds,
  }
}

/**
 * True-up only: billing cells that are not on a plan line (__service__*
 * header rows, rows with no line_items row). They count toward a month's
 * schedule in the true-up and never change. Same split as the report:
 * __service__production and PROD line ids are production.
 */
export function trueUpFixedCells(ctx: Pick<RevisionContext, "lines" | "billingRows">): Partial<
  Record<TrueUpComponentKey, Record<MonthKey, Cents>>
> {
  const onLines = new Set(ctx.lines.map((l) => toBillingOverrideLineItemId(l.lineItemId)))
  const out: Partial<Record<TrueUpComponentKey, Record<MonthKey, Cents>>> = {}
  const add = (c: TrueUpComponentKey, m: MonthKey, v: number) => {
    const rec = (out[c] ??= {})
    rec[m] = (rec[m] ?? 0) + v
  }
  for (const r of ctx.billingRows) {
    if (!r.amountCents) continue
    const isService = r.lineItemId.startsWith("__service__")
    if (!isService && onLines.has(toBillingOverrideLineItemId(r.lineItemId))) continue
    const m = r.month.slice(0, 7)
    if (r.component === "fee") add("fee", m, r.amountCents)
    else if (r.component === "adserving") add("adserving", m, r.amountCents)
    else if (r.lineItemId === "__service__production") add("production", m, r.amountCents)
    else if (!isService && isProductionLikeLine({ lineItemId: r.lineItemId, isProduction: false })) add("production", m, r.amountCents)
    else add("media", m, r.amountCents)
  }
  return out
}

export function buildRevisionInput(
  ctx: RevisionContext,
  request: RevisionRequest,
  options: RevisionOptions,
): RevisionInput {
  const trueUp = request.mode === "true_up" || request.mode === "true_up_restore"
  return {
    lines: ctx.lines,
    locks: ctx.locks,
    aaLockedMonths: ctx.aaLockedMonths,
    currentMonth: ctx.currentMonth,
    campaignMonths: ctx.campaignMonths,
    hasFixedHeaderFee: ctx.hasFixedHeaderFee,
    ...(trueUp ? { fixedCells: trueUpFixedCells(ctx) } : {}),
    request,
    options,
  }
}

/** Ids of finance_billing_records keyed by YYYY-MM (media keys only). */
export function mediaRecordIdsByMonth(ctx: RevisionContext): Map<MonthKey, number> {
  const out = new Map<MonthKey, number>()
  const prefix = `media:${ctx.mbaNumber.toLowerCase()}:`
  for (const r of ctx.records) {
    const key = String(r.invoiceKey ?? "").toLowerCase()
    if (key.startsWith(prefix)) out.set(key.slice(prefix.length), r.id)
  }
  return out
}

