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

test("savePlan: billing_overrides → schedule_months source=override, then computed on clear", async (t) => {
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
  const first = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)])
  )
  const before = await snapshot(first.versionId)
  const mediaRows = before.months.filter(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A
  )
  assert.ok(mediaRows.length > 0, "expected computed media schedule_months")
  assert.ok(mediaRows.every((r) => r.source === "computed"))

  const target = mediaRows[0]!
  const monthKey = String(target.month).slice(0, 7) // YYYY-MM
  // C2 (O4): override month sum must equal booked line media — amount may match
  // auto cents; the fixture proves source flips override ↔ computed.
  const overrideAmountDollars = 1000
  const overrideCents = toCents(overrideAmountDollars)

  // Seed override outside savePlan's txn (suite pattern: committed fixture + wipeMba cleanup).
  await db.insert(schema.billingOverrides).values({
    versionId: first.versionId,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "manual",
    months: [{ month: monthKey, amount: overrideAmountDollars }],
    dateBasis: "o2-override-fixture",
  })

  const withOverride = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)])
  )
  assert.equal(withOverride.versionId, first.versionId)
  const mid = await snapshot(withOverride.versionId)
  const overridden = mid.months.filter(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A &&
      String(r.month).slice(0, 7) === monthKey
  )
  assert.equal(overridden.length, 1)
  assert.equal(overridden[0]!.source, "override")
  assert.equal(Number(overridden[0]!.amountCents), overrideCents)

  await db
    .delete(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, first.versionId))

  const cleared = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)])
  )
  assert.equal(cleared.versionId, first.versionId)
  const after = await snapshot(cleared.versionId)
  const restored = after.months.filter(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A &&
      String(r.month).slice(0, 7) === monthKey
  )
  assert.equal(restored.length, 1)
  assert.equal(restored[0]!.source, "computed")
  assert.equal(Number(restored[0]!.amountCents), Number(target.amountCents))
})

test("savePlan O4: C2 sum violation blocks save (manual override)", async (t) => {
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
  const first = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)])
  )
  await db.insert(schema.billingOverrides).values({
    versionId: first.versionId,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "manual",
    months: [{ month: "2026-05", amount: 777.77 }],
    dateBasis: "o4-c2-block",
  })

  await assert.rejects(
    () => savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)])),
    (err: unknown) =>
      err instanceof SavePlanError &&
      err.code === "BILLING_OVERRIDE_SUM_VIOLATION"
  )
})

test("savePlan O4: manual override months survive auto-drift recompute untouched", async (t) => {
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
  // Two-month flight: auto recompute splits media; manual packs it into June.
  const twoMonthLine = baseLine(LINE_A, 1000, {
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 1000,
        buyAmount: 1,
      },
    ],
  })
  const first = await savePlanVersion(draftInput(masterId, [twoMonthLine]))
  const before = await snapshot(first.versionId)
  const juneAuto = before.months.find(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A &&
      String(r.month).slice(0, 7) === "2026-06"
  )
  assert.ok(juneAuto, "expected auto June media row")
  assert.equal(juneAuto!.source, "computed")
  // Auto split should not already be the full $1000 on June alone.
  assert.notEqual(Number(juneAuto!.amountCents), toCents(1000))

  await db.insert(schema.billingOverrides).values({
    versionId: first.versionId,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "manual",
    months: [{ month: "2026-06", amount: 1000 }],
    dateBasis: "o4-manual-survive",
  })

  const afterDrift = await savePlanVersion(draftInput(masterId, [twoMonthLine]))
  assert.equal(afterDrift.versionId, first.versionId)
  const mid = await snapshot(afterDrift.versionId)
  const juneManual = mid.months.find(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A &&
      String(r.month).slice(0, 7) === "2026-06"
  )
  assert.ok(juneManual)
  assert.equal(juneManual!.source, "override")
  assert.equal(Number(juneManual!.amountCents), toCents(1000))
})

/**
 * MB-1: savePlanVersion must compute financials WITH billing_overrides attached
 * so legacy_schedules blob and schedule_months agree (blob default / shadow both
 * serve the blob — mismatch surfaces as auto months on every finance read).
 */
test("savePlan MB-1: media override → blob billingMode=manual + months == schedule_months override cents", async (t) => {
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
  const twoMonthLine = baseLine(LINE_A, 1000, {
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 1000,
        buyAmount: 1,
      },
    ],
  })
  const first = await savePlanVersion(draftInput(masterId, [twoMonthLine]))
  const before = await snapshot(first.versionId)
  const deliveryBefore = before.months
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
  assert.ok(deliveryBefore.length > 0)
  assert.ok(deliveryBefore.every((r) => r.source === "computed"))

  await db.insert(schema.billingOverrides).values({
    versionId: first.versionId,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "manual",
    months: [{ month: "2026-06", amount: 1000 }],
    dateBasis: "mb1-blob-parity",
  })

  const saved = await savePlanVersion(draftInput(masterId, [twoMonthLine]))
  assert.equal(saved.versionId, first.versionId)
  const snap = await snapshot(saved.versionId)
  const legacy = snap.version?.legacySchedules as {
    billingSchedule?: Array<{
      monthYear?: string
      lineItems?: Record<
        string,
        Array<{
          id?: string
          billingMode?: string
          monthlyAmounts?: Record<string, number>
        }>
      >
    }>
    deliverySchedule?: unknown
  } | null
  assert.ok(legacy?.billingSchedule, "expected legacy_schedules.billingSchedule")

  // Collect blob media monthlyAmounts for LINE_A keyed by YYYY-MM.
  // Each month's lineItems carries the full monthlyAmounts map — read once.
  const scheduleMonthToKey = (monthYear: string): string => {
    if (/^\d{4}-\d{2}/.test(monthYear)) return monthYear.slice(0, 7)
    const m = monthYear.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i
    )
    if (!m) return ""
    const idx = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ].indexOf(m[1]!.toLowerCase())
    return idx < 0 ? "" : `${m[2]}-${String(idx + 1).padStart(2, "0")}`
  }
  const blobMediaByMonth = new Map<string, number>()
  let sawManualMode = false
  for (const month of legacy!.billingSchedule!) {
    const buckets = month.lineItems ?? {}
    for (const lines of Object.values(buckets)) {
      for (const line of lines ?? []) {
        if (String(line.id ?? "").trim() !== LINE_A) continue
        if (line.billingMode === "manual") sawManualMode = true
        if (blobMediaByMonth.size > 0) continue
        for (const [monthYear, amount] of Object.entries(
          line.monthlyAmounts ?? {}
        )) {
          const key = scheduleMonthToKey(monthYear)
          if (!key) continue
          blobMediaByMonth.set(key, Number(amount || 0))
        }
      }
    }
  }
  assert.equal(sawManualMode, true, "blob line must stamp billingMode=manual")
  assert.equal(blobMediaByMonth.get("2026-06"), 1000)
  assert.equal(blobMediaByMonth.get("2026-07") ?? 0, 0)

  const billingOverrideRows = snap.months.filter(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A &&
      r.source === "override"
  )
  assert.ok(billingOverrideRows.length >= 1)
  for (const row of billingOverrideRows) {
    const monthKey = String(row.month).slice(0, 7)
    const blobDollars = blobMediaByMonth.get(monthKey)
    assert.equal(
      blobDollars,
      Number(row.amountCents) / 100,
      `blob month ${monthKey} must equal schedule_months override cents`
    )
  }
  assert.equal(
    Number(
      billingOverrideRows.find((r) => String(r.month).slice(0, 7) === "2026-06")
        ?.amountCents
    ),
    toCents(1000)
  )

  // Delivery basis stays override-free and computed (same cents as pre-override).
  const deliveryAfter = snap.months
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
  assert.deepEqual(deliveryAfter, deliveryBefore)
  assert.ok(deliveryAfter.every((r) => r.source === "computed"))

  // Belt-and-braces: every billing source=override row matches blob monthlyAmounts.
  const allBillingOverrides = snap.months.filter(
    (r) => r.basis === "billing" && r.source === "override"
  )
  for (const row of allBillingOverrides) {
    if (row.component !== "media") continue
    const monthKey = String(row.month).slice(0, 7)
    assert.equal(
      blobMediaByMonth.get(monthKey),
      Number(row.amountCents) / 100,
      `override row ${row.lineItemId}/${monthKey} must match blob`
    )
  }
})

test("savePlan O4.6: publish ignores stale client versionNumber — writes tip+1", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  // Tip becomes 3 via draft + two publishes.
  await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  const p2 = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    versionNumber: 1, // client stale vs tip=1 → server writes 2
    campaignStatus: "booked",
  })
  assert.equal(p2.versionNumber, 2)
  const p3 = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    versionNumber: 2,
    campaignStatus: "booked",
  })
  assert.equal(p3.versionNumber, 3)

  // Fresh-session bug: Xano watermark still 1 → client sends nextVersionNumber=2
  // while Postgres tip is 3. Server must write 4 (no 23505).
  const stale = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    versionNumber: 2,
    campaignStatus: "booked",
  })
  assert.equal(stale.versionNumber, 4)
  assert.equal(stale.published, true)

  const db = getDb()
  const versions = await db
    .select({
      id: schema.mediaPlanVersions.id,
      vn: schema.mediaPlanVersions.versionNumber,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterId))
  const numbers = versions.map((v) => v.vn).sort((a, b) => a - b)
  assert.deepEqual(numbers, [1, 2, 3, 4])
  assert.ok(versions.some((v) => v.id === stale.versionId && v.vn === 4))
})

test("savePlan O4.6: draft-overwrite still targets the loaded version", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const first = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)])
  )
  assert.equal(first.versionNumber, 1)

  // Publish tip ahead so a buggy client vn would collide if draft also resolved tip+1.
  await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    versionNumber: 99,
    campaignStatus: "booked",
  })

  const overwrite = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1500)], {
      versionNumber: 1,
      campaignName: "Draft overwrite target",
    })
  )
  assert.equal(overwrite.versionNumber, 1)
  assert.equal(overwrite.versionId, first.versionId)
  assert.equal(overwrite.published, false)

  const snap = await snapshot(overwrite.versionId)
  assert.equal(snap.version?.versionNumber, 1)
  assert.equal(snap.version?.campaignName, "Draft overwrite target")
})

test("savePlan: close db pool", async () => {
  if (hasDb) await closeDb()
})
