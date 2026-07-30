/**
 * T4a — transactional Postgres save (PENFOLD016 / BOSS006 kill-shot).
 * Requires DATABASE_URL (Supabase pooler). Skips when unset.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { count, eq, sql } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  SavePlanError,
  savePlanVersion,
  type SavePlanLineItem,
  type SavePlanVersionInput,
} from "../savePlan.js"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials.js"
import { explodeScheduleToMonthRows, sumScheduleCents } from "../../../scripts/migration/_scheduleTransform.js"
import { toCents } from "../../../scripts/migration/_shared.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MBA = `t4a${Date.now().toString(36)}`
const LINE_A = `${MBA.toUpperCase()}SEA001`
const LINE_B = `${MBA.toUpperCase()}SEA002`

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
        startDate: "2026-05-01",
        endDate: "2026-05-31",
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
      campaignName: "T4a kill-shot",
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

async function snapshot(versionId: number) {
  const db = getDb()
  const [version] = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
  const lines = await db
    .select()
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, versionId))
  const months = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, versionId))
  return { version, lines, months }
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
    campaignName: "T4a kill-shot",
    campaignStatus: "Draft",
    campaignStartDate: "2026-05-01",
    campaignEndDate: "2026-05-31",
    campaignBudgetCents: 1_100_00,
    channelFlags: { mp_search: true },
    lineItems: lines,
    feeLoading: { feesearch: 10 },
    ...extra,
  }
}

test("savePlan: kill-shot — failure between line_items and schedule_months rolls back all", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  // Baseline successful save
  const first = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000), baseLine(LINE_B, 500)])
  )
  const before = await snapshot(first.versionId)
  assert.equal(before.lines.length, 2)
  assert.ok(before.months.length > 0)
  const beforeVersionJson = JSON.stringify(before.version)
  const beforeLinesJson = JSON.stringify(
    before.lines.map((r) => ({
      lineItemId: r.lineItemId,
      channel: r.channel,
      bursts: r.bursts,
    })).sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
  )
  const beforeMonthsJson = JSON.stringify(
    before.months
      .map((r) => ({
        lineItemId: r.lineItemId,
        component: r.component,
        basis: r.basis,
        month: r.month,
        amountCents: r.amountCents,
        source: r.source,
      }))
      .sort((a, b) =>
        `${a.lineItemId}|${a.component}|${a.basis}|${a.month}`.localeCompare(
          `${b.lineItemId}|${b.component}|${b.basis}|${b.month}`
        )
      )
  )

  await assert.rejects(
    () =>
      savePlanVersion(
        draftInput(masterId, [baseLine(LINE_A, 9999)], {
          _testHooks: {
            afterLineItemsInsert: async () => {
              throw new Error("T4A_KILL_SHOT_INJECTED")
            },
          },
        })
      ),
    (err: unknown) =>
      err instanceof Error && err.message.includes("T4A_KILL_SHOT_INJECTED")
  )

  const after = await snapshot(first.versionId)
  assert.equal(JSON.stringify(after.version), beforeVersionJson)
  assert.equal(
    JSON.stringify(
      after.lines
        .map((r) => ({
          lineItemId: r.lineItemId,
          channel: r.channel,
          bursts: r.bursts,
        }))
        .sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
    ),
    beforeLinesJson
  )
  assert.equal(
    JSON.stringify(
      after.months
        .map((r) => ({
          lineItemId: r.lineItemId,
          component: r.component,
          basis: r.basis,
          month: r.month,
          amountCents: r.amountCents,
          source: r.source,
        }))
        .sort((a, b) =>
          `${a.lineItemId}|${a.component}|${a.basis}|${a.month}`.localeCompare(
            `${b.lineItemId}|${b.component}|${b.basis}|${b.month}`
          )
        )
    ),
    beforeMonthsJson
  )
})

test("savePlan: publish with 0 lines rejected (BOSS006)", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await assert.rejects(
    () =>
      savePlanVersion({
        ...draftInput(masterId, []),
        mode: "publish",
        campaignStatus: "Approved",
      }),
    (err: unknown) =>
      err instanceof SavePlanError &&
      err.code === "BOSS006_EMPTY_PUBLISH" &&
      /0 line/i.test(err.message)
  )

  const db = getDb()
  const [master] = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, masterId))
  assert.equal(master?.publishedVersionId, null)
})

test("savePlan: repeat-save idempotent (stable ids, identical counts)", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const input = draftInput(masterId, [
    baseLine(LINE_A, 1000),
    baseLine(LINE_B, 500),
  ])
  const a = await savePlanVersion(input)
  const snapA = await snapshot(a.versionId)
  const b = await savePlanVersion(input)
  const snapB = await snapshot(b.versionId)

  assert.equal(a.versionId, b.versionId)
  assert.equal(a.lineCount, b.lineCount)
  assert.equal(a.scheduleRowCount, b.scheduleRowCount)
  assert.equal(snapA.lines.length, snapB.lines.length)
  assert.equal(snapB.lines.length, 2)
  assert.deepEqual(
    snapA.lines.map((l) => l.lineItemId).sort(),
    snapB.lines.map((l) => l.lineItemId).sort()
  )
  assert.equal(snapA.months.length, snapB.months.length)
})

test("savePlan: duplicate line_item_id in payload rejects whole txn", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const ok = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)])
  )
  const before = await snapshot(ok.versionId)

  await assert.rejects(
    () =>
      savePlanVersion(
        draftInput(masterId, [
          baseLine(LINE_A, 1000),
          baseLine(LINE_A, 2000, { label: "dup" }),
        ])
      ),
    (err: unknown) =>
      err instanceof SavePlanError &&
      err.code === "DUPLICATE_LINE_ITEM_ID" &&
      err.message.includes(LINE_A)
  )

  const after = await snapshot(ok.versionId)
  assert.equal(after.lines.length, before.lines.length)
  assert.equal(after.months.length, before.months.length)
})

test("savePlan: schedule_months cents match computeCampaignFinancials explode", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const lines = [baseLine(LINE_A, 1000), baseLine(LINE_B, 500)]
  const result = await savePlanVersion(draftInput(masterId, lines))
  const financials = computeCampaignFinancials(
    lines.map((l) => ({
      lineItemId: l.lineItemId,
      mediaType: l.mediaType,
      buyType: l.buyType ?? "cpc",
      rate: l.rate,
      enteredAmount: l.enteredAmount,
      budgetIncludesFees: Boolean(l.budgetIncludesFees),
      clientPaysForMedia: Boolean(l.clientPaysForMedia),
      feePct: l.feePct,
      bursts: l.bursts as never[],
      approval: l.approval ?? "approved",
      billingOverride: l.billingOverride,
      feeOverride: l.feeOverride,
      label: l.label,
    })),
    { feeLoading: { feesearch: 10 } }
  )
  const billingExplode = explodeScheduleToMonthRows(
    result.versionId,
    "billing",
    financials.billingSchedule
  )
  const deliveryExplode = explodeScheduleToMonthRows(
    result.versionId,
    "delivery",
    financials.deliverySchedule
  )
  assert.equal(billingExplode.failureReason, null)
  assert.equal(deliveryExplode.failureReason, null)
  const expectedCents =
    sumScheduleCents(billingExplode.rows) + sumScheduleCents(deliveryExplode.rows)

  const db = getDb()
  const [sumRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.scheduleMonths.amountCents}), 0)::bigint`,
    })
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, result.versionId))
  assert.equal(Number(sumRow?.total ?? 0), expectedCents)
  assert.equal(result.scheduleRowCount, billingExplode.rows.length + deliveryExplode.rows.length)

  // Sanity: media billing cents ≈ entered net + fee slice for non-client-pays
  const billingMedia = sumScheduleCents(billingExplode.rows, "media", "billing")
  assert.ok(billingMedia > 0)
  assert.equal(toCents(1000 + 500), 150000)
})

test("savePlan: missing line_item_id rejected", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await assert.rejects(
    () =>
      savePlanVersion(
        draftInput(masterId, [
          baseLine("  ", 1000), // blank id
        ])
      ),
    (err: unknown) =>
      err instanceof SavePlanError && err.code === "MISSING_LINE_ITEM_ID"
  )
})

test("savePlan: publish path sets published_version_id + fee snapshot", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const result = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    campaignStatus: "Approved",
    feeSnapshot: { feesearch: 10 },
  })
  assert.equal(result.published, true)

  const db = getDb()
  const [master] = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, masterId))
  assert.equal(master?.publishedVersionId, result.versionId)

  const [snapCount] = await db
    .select({ n: count() })
    .from(schema.mbaFeeSnapshots)
    .where(eq(schema.mbaFeeSnapshots.versionId, result.versionId))
  assert.equal(Number(snapCount?.n ?? 0), 1)
})

test("savePlan: close db pool", async () => {
  if (hasDb) await closeDb()
})
