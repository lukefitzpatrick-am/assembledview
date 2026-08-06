/**
 * MB-13 — fee override is timing-only: months must redistribute the auto fee
 * (sum ≡ calculatedFee). Pins that first publish freezes approved_slice to the
 * auto fee, stamps schedule_months fee rows source=override with retimed
 * amounts, keeps mba_fee_snapshots as rates, refuses post-publish fee writes
 * (MB-15c), and that media+fee Prebill + reset_line clear both rows.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { eq } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import { toCents } from "../../../scripts/migration/_shared.js"
import type { ApprovedSlice } from "@/lib/finance/approvedSlice"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import {
  BillingOverrideWriteError,
  replaceBillingOverrideLine,
  resetBillingOverrideLine,
} from "../writeBillingOverrides.js"
import {
  savePlanVersion,
  type SavePlanLineItem,
  type SavePlanVersionInput,
} from "../savePlan.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MBA = `mb13${Date.now().toString(36)}`
const LINE_A = `${MBA.toUpperCase()}SEA001`

/** $1000 media @ 10% feePct — calculated fee is a gross slice (~$111.11), not net×%. */
const MEDIA = 1000
const FEE_PCT = 10
/** MB-13.2 only: refused post-publish amount (never lands). */
const OVERRIDE_FEE = 250

function twoMonthLine(
  overrides?: Partial<SavePlanLineItem>
): SavePlanLineItem {
  return {
    lineItemId: LINE_A,
    channel: "search",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: MEDIA,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: FEE_PCT,
    approval: "approved",
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: MEDIA,
        buyAmount: 1,
      },
    ],
    attrs: {},
    ...overrides,
  }
}

function lineInputForCompute(line: SavePlanLineItem) {
  return {
    lineItemId: line.lineItemId,
    mediaType: line.mediaType,
    buyType: line.buyType ?? "cpc",
    rate: line.rate,
    enteredAmount: line.enteredAmount,
    budgetIncludesFees: Boolean(line.budgetIncludesFees),
    clientPaysForMedia: Boolean(line.clientPaysForMedia),
    feePct: line.feePct,
    bursts: line.bursts as never[],
    approval: line.approval ?? "approved",
    billingOverride: line.billingOverride,
    feeOverride: line.feeOverride,
  }
}

async function seedMaster(): Promise<number> {
  const db = getDb()
  const [row] = await db
    .insert(schema.mediaPlanMasters)
    .values({
      mbaNumber: MBA,
      campaignName: "MB-13 fee override publish",
      campaignStatus: "Draft",
      campaignBudgetCents: 1_100_00,
    })
    .returning({ id: schema.mediaPlanMasters.id })
  return row!.id
}

async function wipeMba(): Promise<void> {
  const db = getDb()
  const masters = await db
    .select({ id: schema.mediaPlanMasters.id })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.mbaNumber, MBA))
  for (const m of masters) {
    await db
      .update(schema.mediaPlanMasters)
      .set({ publishedVersionId: null })
      .where(eq(schema.mediaPlanMasters.id, m.id))
    await db
      .delete(schema.mediaPlanVersions)
      .where(eq(schema.mediaPlanVersions.masterId, m.id))
    await db
      .delete(schema.mediaPlanMasters)
      .where(eq(schema.mediaPlanMasters.id, m.id))
  }
}

function draftInput(
  masterId: number,
  lines: SavePlanLineItem[],
  extra?: Partial<SavePlanVersionInput>
): SavePlanVersionInput {
  return {
    masterId,
    mbaNumber: MBA,
    versionNumber: 1,
    mode: "draft",
    campaignName: "MB-13 fee override publish",
    campaignStatus: "Draft",
    campaignStartDate: "2026-06-01",
    campaignEndDate: "2026-07-31",
    campaignBudgetCents: 1_100_00,
    channelFlags: { mp_search: true },
    lineItems: lines,
    feeLoading: { feesearch: FEE_PCT },
    billingOverrides: { authoritative: true, clearedLineIds: [] },
    ...extra,
  }
}

function feeOverrideMonths(total: number) {
  return [
    { month: "2026-06", amount: total },
    { month: "2026-07", amount: 0 },
  ]
}

function asSlice(raw: unknown): ApprovedSlice {
  assert.ok(raw && typeof raw === "object", "expected approved_slice object")
  return raw as ApprovedSlice
}

function billingFeeCentsSum(
  months: Array<{
    basis: string
    component: string
    lineItemId: string
    amountCents: number
  }>,
  lineItemId: string
): number {
  return months
    .filter(
      (r) =>
        r.basis === "billing" &&
        r.component === "fee" &&
        r.lineItemId === lineItemId
    )
    .reduce((s, r) => s + Number(r.amountCents), 0)
}

test("MB-13.1: fee override retimes across months but cannot change the amount; slice freezes the auto fee", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  // Derive auto fee from the override-free line — do not hardcode.
  const baseline = computeCampaignFinancials(
    [lineInputForCompute(twoMonthLine())],
    { feeLoading: { feesearch: FEE_PCT } }
  )
  const calculatedFee = baseline.mbaScopeTotals.fee
  assert.ok(calculatedFee > 0)
  assert.equal(baseline.mbaScopeTotals.nettExGst, MEDIA + calculatedFee)

  // MB-22: override rides the save payload (REPLACE-SET), not a pre-seeded DB row.
  // Production stamps feeOverride onto every payload line (buildPostgresSavePayload).
  // Redistribute calculatedFee into June (whole) + July ($0) — genuine retiming, sum preserved.
  const feeOverride = {
    mode: "manual" as const,
    reason: "manual" as const,
    dateBasis: "mb13-1",
    component: "fee" as const,
    months: feeOverrideMonths(calculatedFee),
  }
  const line = twoMonthLine({ feeOverride })

  const withOverride = computeCampaignFinancials(
    [lineInputForCompute(line)],
    { feeLoading: { feesearch: FEE_PCT } }
  )
  assert.equal(withOverride.mbaScopeTotals.fee, calculatedFee)
  assert.equal(withOverride.mbaFeeAdjusted, false)

  const db = getDb()
  await savePlanVersion(draftInput(masterId, [line]))
  await savePlanVersion(draftInput(masterId, [line]))

  const published = await savePlanVersion({
    ...draftInput(masterId, [line]),
    mode: "publish",
    versionNumber: 1,
    campaignStatus: "booked",
    feeSnapshot: { feesearch: FEE_PCT },
  })
  assert.equal(published.published, true)
  assert.equal(published.versionNumber, 2)

  const [version] = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, published.versionId))
  const slice = asSlice(version?.approvedSlice)
  assert.equal(slice.lines.length, 1)
  assert.equal(slice.lines[0]!.lineItemId, LINE_A)
  assert.equal(
    slice.lines[0]!.feeCents,
    toCents(calculatedFee),
    "approved_slice.feeCents freezes the auto fee — the only fee that can exist"
  )
  assert.equal(slice.lines[0]!.mediaCents, toCents(MEDIA))
  assert.equal(
    slice.totalCents,
    slice.lines.reduce(
      (s, l) =>
        s + l.mediaCents + l.feeCents + l.adservingCents + l.productionCents,
      0
    )
  )

  const [feeSnap] = await db
    .select()
    .from(schema.mbaFeeSnapshots)
    .where(eq(schema.mbaFeeSnapshots.versionId, published.versionId))
  assert.ok(feeSnap)
  // mba_fee_snapshots stores fee *rates* (feeLoading / feeSnapshot), not dollar overrides.
  assert.deepEqual(feeSnap!.fees, { feesearch: FEE_PCT })

  const months = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, published.versionId))
  const billingFeeRows = months.filter(
    (r) =>
      r.basis === "billing" &&
      r.component === "fee" &&
      r.lineItemId === LINE_A
  )
  assert.equal(
    billingFeeCentsSum(months, LINE_A),
    toCents(calculatedFee),
    "billing schedule_months fee cents sum to auto fee"
  )
  const juneFee = billingFeeRows.find(
    (r) => String(r.month).slice(0, 7) === "2026-06"
  )
  const julyFee = billingFeeRows.find(
    (r) => String(r.month).slice(0, 7) === "2026-07"
  )
  assert.equal(
    Number(juneFee?.amountCents),
    toCents(calculatedFee),
    "2026-06 carries the whole retimed fee"
  )
  assert.equal(Number(julyFee?.amountCents), 0, "2026-07 fee is $0 after retiming")
  assert.ok(
    billingFeeRows.length > 0 &&
      billingFeeRows.every((r) => r.source === "override"),
    "every billing fee row stamped source=override"
  )
})

test("MB-13.2 / MB-15c: fee override after first publish is refused; published bytes unchanged", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = twoMonthLine()
  const db = getDb()
  const baseline = computeCampaignFinancials([lineInputForCompute(line)], {
    feeLoading: { feesearch: FEE_PCT },
  })
  const calculatedFee = baseline.mbaScopeTotals.fee

  // First publish with NO fee override — freeze calculated fee into approved_slice.
  const published = await savePlanVersion({
    ...draftInput(masterId, [line]),
    mode: "publish",
    campaignStatus: "booked",
    feeSnapshot: { feesearch: FEE_PCT },
  })
  assert.equal(published.published, true)

  const [beforeVersion] = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, published.versionId))
  const frozen = asSlice(beforeVersion?.approvedSlice)
  assert.equal(frozen.lines[0]!.feeCents, toCents(calculatedFee))
  const checksumBefore = String(beforeVersion?.snapshotChecksum ?? "")
  assert.ok(checksumBefore.length >= 16, "publish wrote snapshot_checksum")

  const monthsBefore = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, published.versionId))
  assert.equal(billingFeeCentsSum(monthsBefore, LINE_A), toCents(calculatedFee))

  // MB-15c: post-publish billing writers refuse — no schedule/slice/checksum drift.
  await assert.rejects(
    () =>
      replaceBillingOverrideLine({
        versionId: published.versionId,
        mbaNumber: MBA,
        lineItemId: LINE_A,
        component: "fee",
        mode: "manual",
        reason: "manual",
        months: feeOverrideMonths(OVERRIDE_FEE),
        dateBasis: "mb13-2-after-publish",
      }),
    (err: unknown) =>
      err instanceof BillingOverrideWriteError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE"
  )

  const [afterVersion] = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, published.versionId))
  const sliceAfter = asSlice(afterVersion?.approvedSlice)
  assert.deepEqual(sliceAfter, frozen)
  assert.equal(String(afterVersion?.snapshotChecksum ?? ""), checksumBefore)

  const monthsAfter = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, published.versionId))
  assert.equal(billingFeeCentsSum(monthsAfter, LINE_A), toCents(calculatedFee))
  const feeOverrides = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, published.versionId))
  assert.equal(feeOverrides.length, 0)
})

test("MB-13.3: MB-8 media+fee Prebill — both rows round-trip; reset_line clears both", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = twoMonthLine()
  const saved = await savePlanVersion(draftInput(masterId, [line]))
  const db = getDb()

  const baseline = computeCampaignFinancials([lineInputForCompute(line)], {
    feeLoading: { feesearch: FEE_PCT },
  })
  const calculatedFee = baseline.mbaScopeTotals.fee
  const mediaMonths = [
    { month: "2026-06", amount: MEDIA },
    { month: "2026-07", amount: 0 },
  ]
  const feeMonths = feeOverrideMonths(calculatedFee)

  await replaceBillingOverrideLine({
    versionId: saved.versionId,
    mbaNumber: MBA,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "prepayment",
    months: mediaMonths,
    dateBasis: "mb13-3-prebill",
  })
  await replaceBillingOverrideLine({
    versionId: saved.versionId,
    mbaNumber: MBA,
    lineItemId: LINE_A,
    component: "fee",
    mode: "manual",
    reason: "prepayment",
    months: feeMonths,
    dateBasis: "mb13-3-prebill",
  })

  const mid = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, saved.versionId))
  assert.equal(mid.length, 2)
  const mediaRow = mid.find((r) => r.component === "media")
  const feeRow = mid.find((r) => r.component === "fee")
  assert.ok(mediaRow)
  assert.ok(feeRow)
  assert.equal(mediaRow!.reason, "prepayment")
  assert.equal(feeRow!.reason, "prepayment")
  assert.deepEqual(mediaRow!.months, mediaMonths)
  assert.deepEqual(feeRow!.months, feeMonths)

  const midMonths = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, saved.versionId))
  const juneMedia = midMonths.find(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A &&
      String(r.month).slice(0, 7) === "2026-06"
  )
  const juneFee = midMonths.find(
    (r) =>
      r.basis === "billing" &&
      r.component === "fee" &&
      r.lineItemId === LINE_A &&
      String(r.month).slice(0, 7) === "2026-06"
  )
  assert.equal(Number(juneMedia?.amountCents), toCents(MEDIA))
  assert.equal(juneMedia?.source, "override")
  assert.equal(Number(juneFee?.amountCents), toCents(calculatedFee))
  assert.equal(juneFee?.source, "override")

  // reset_line without component clears BOTH media + fee (MB-8 contract).
  const reset = await resetBillingOverrideLine({
    versionId: saved.versionId,
    mbaNumber: MBA,
    lineItemId: LINE_A,
  })
  assert.equal(reset.deleted, 2)

  const after = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, saved.versionId))
  assert.equal(after.length, 0)

  const afterMonths = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, saved.versionId))
  assert.equal(
    afterMonths.filter(
      (r) =>
        r.basis === "billing" &&
        r.lineItemId === LINE_A &&
        r.source === "override"
    ).length,
    0,
    "no billing source=override rows after reset_line"
  )
})

test("MB-13 close db pool", async () => {
  if (hasDb) await closeDb()
})
