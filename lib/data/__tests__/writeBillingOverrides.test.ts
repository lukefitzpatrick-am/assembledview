/**
 * MB-3 — reset_line must undo the schedule_months mirror.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { eq } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import { toCents } from "../../../scripts/migration/_shared.js"
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

const MBA = `mb3${Date.now().toString(36)}`
const LINE_A = `${MBA.toUpperCase()}SEA001`

function baseLine(
  lineItemId: string,
  budget: number,
  overrides?: Partial<SavePlanLineItem>
): SavePlanLineItem {
  return {
    lineItemId,
    channel: "search",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: budget,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 10,
    approval: "approved",
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget,
        buyAmount: 1,
      },
    ],
    attrs: {},
    ...overrides,
  }
}

async function seedMaster(): Promise<number> {
  const db = getDb()
  const [row] = await db
    .insert(schema.mediaPlanMasters)
    .values({
      mbaNumber: MBA,
      campaignName: "MB-3 reset mirror",
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
  lines: SavePlanLineItem[]
): SavePlanVersionInput {
  return {
    masterId,
    mbaNumber: MBA,
    versionNumber: 1,
    mode: "draft",
    campaignName: "MB-3 reset mirror",
    campaignStatus: "Draft",
    campaignStartDate: "2026-06-01",
    campaignEndDate: "2026-07-31",
    campaignBudgetCents: 1_100_00,
    channelFlags: { mp_search: true },
    lineItems: lines,
    feeLoading: { feesearch: 10 },
    billingOverrides: { authoritative: true, clearedLineIds: [] },
  }
}

describe("BillingOverrideWriteError", () => {
  it("carries NOT_FOUND / BAD_REQUEST codes for route mapping", () => {
    const missing = new BillingOverrideWriteError("NOT_FOUND", "gone")
    assert.equal(missing.code, "NOT_FOUND")
    assert.equal(missing.message, "gone")

    const bad = new BillingOverrideWriteError("BAD_REQUEST", "need months")
    assert.equal(bad.code, "BAD_REQUEST")
  })
})

describe("MB-3 reset_line undoes schedule_months mirror", () => {
  it("set override → reset → zero overrides and zero source=override billing rows; amounts back to auto", async (t) => {
    if (!hasDb) {
      t.skip("DATABASE_URL not set")
      return
    }
    await wipeMba()
    const masterId = await seedMaster()
    t.after(async () => {
      await wipeMba()
    })

    const db = getDb()
    const line = baseLine(LINE_A, 1000)
    const saved = await savePlanVersion(draftInput(masterId, [line]))
    const before = await db
      .select()
      .from(schema.scheduleMonths)
      .where(eq(schema.scheduleMonths.versionId, saved.versionId))
    const autoBilling = before.filter(
      (r) =>
        r.basis === "billing" &&
        r.component === "media" &&
        r.lineItemId === LINE_A
    )
    assert.ok(autoBilling.length >= 2, "expected multi-month auto billing rows")
    assert.ok(autoBilling.every((r) => r.source === "computed"))
    const autoByMonth = new Map(
      autoBilling.map((r) => [String(r.month).slice(0, 7), Number(r.amountCents)])
    )
    // Auto split should not already be full $1000 on June alone.
    assert.notEqual(autoByMonth.get("2026-06"), toCents(1000))

    await replaceBillingOverrideLine({
      versionId: saved.versionId,
      mbaNumber: MBA,
      lineItemId: LINE_A,
      component: "media",
      mode: "manual",
      reason: "manual",
      months: [
        { month: "2026-06", amount: 1000 },
        { month: "2026-07", amount: 0 },
      ],
      dateBasis: "mb3-reset-fixture",
    })

    const midOverrides = await db
      .select()
      .from(schema.billingOverrides)
      .where(eq(schema.billingOverrides.versionId, saved.versionId))
    assert.equal(midOverrides.length, 1)

    const midMonths = await db
      .select()
      .from(schema.scheduleMonths)
      .where(eq(schema.scheduleMonths.versionId, saved.versionId))
    const midBilling = midMonths.filter(
      (r) =>
        r.basis === "billing" &&
        r.component === "media" &&
        r.lineItemId === LINE_A
    )
    assert.ok(midBilling.some((r) => r.source === "override"))
    const juneMid = midBilling.find((r) => String(r.month).slice(0, 7) === "2026-06")
    assert.equal(Number(juneMid?.amountCents), toCents(1000))

    const deliveryBeforeReset = midMonths
      .filter((r) => r.basis === "delivery" && r.lineItemId === LINE_A)
      .map((r) => ({
        month: String(r.month).slice(0, 7),
        component: r.component,
        amountCents: Number(r.amountCents),
        source: r.source,
      }))
      .sort((a, b) =>
        `${a.component}|${a.month}`.localeCompare(`${b.component}|${b.month}`)
      )

    await resetBillingOverrideLine({
      versionId: saved.versionId,
      mbaNumber: MBA,
      lineItemId: LINE_A,
      component: "media",
    })

    const afterOverrides = await db
      .select()
      .from(schema.billingOverrides)
      .where(eq(schema.billingOverrides.versionId, saved.versionId))
    assert.equal(afterOverrides.length, 0)

    const afterMonths = await db
      .select()
      .from(schema.scheduleMonths)
      .where(eq(schema.scheduleMonths.versionId, saved.versionId))
    const afterBilling = afterMonths.filter(
      (r) =>
        r.basis === "billing" &&
        r.component === "media" &&
        r.lineItemId === LINE_A
    )
    assert.equal(
      afterBilling.filter((r) => r.source === "override").length,
      0,
      "no billing source=override rows after reset"
    )
    assert.ok(afterBilling.every((r) => r.source === "computed"))
    for (const [monthKey, cents] of autoByMonth) {
      const row = afterBilling.find((r) => String(r.month).slice(0, 7) === monthKey)
      assert.ok(row, `missing restored month ${monthKey}`)
      assert.equal(Number(row!.amountCents), cents, `month ${monthKey} back to auto`)
    }

    const deliveryAfter = afterMonths
      .filter((r) => r.basis === "delivery" && r.lineItemId === LINE_A)
      .map((r) => ({
        month: String(r.month).slice(0, 7),
        component: r.component,
        amountCents: Number(r.amountCents),
        source: r.source,
      }))
      .sort((a, b) =>
        `${a.component}|${a.month}`.localeCompare(`${b.component}|${b.month}`)
      )
    assert.deepEqual(deliveryAfter, deliveryBeforeReset)
  })

  it("replace_line rolls back when media months do not sum to line media total", async (t) => {
    if (!hasDb) {
      t.skip("DATABASE_URL not set")
      return
    }
    await wipeMba()
    const masterId = await seedMaster()
    t.after(async () => {
      await wipeMba()
    })

    const saved = await savePlanVersion(
      draftInput(masterId, [baseLine(LINE_A, 1000)])
    )

    await assert.rejects(
      () =>
        replaceBillingOverrideLine({
          versionId: saved.versionId,
          mbaNumber: MBA,
          lineItemId: LINE_A,
          component: "media",
          mode: "manual",
          reason: "manual",
          months: [{ month: "2026-06", amount: 777.77 }],
          dateBasis: "mb3-sum-gate",
        }),
      (err: unknown) =>
        err instanceof BillingOverrideWriteError &&
        err.code === "SUM_VIOLATION" &&
        typeof err.delta === "number"
    )

    const db = getDb()
    const overrides = await db
      .select()
      .from(schema.billingOverrides)
      .where(eq(schema.billingOverrides.versionId, saved.versionId))
    assert.equal(overrides.length, 0)
    const overrideMonths = await db
      .select()
      .from(schema.scheduleMonths)
      .where(eq(schema.scheduleMonths.versionId, saved.versionId))
    assert.equal(
      overrideMonths.filter((r) => r.source === "override").length,
      0
    )
  })

  it("close db pool", async () => {
    if (hasDb) await closeDb()
  })
})
