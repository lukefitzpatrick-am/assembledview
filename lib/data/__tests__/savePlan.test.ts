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
import { createAdServingRateResolver } from "@/lib/billing/adServingRateResolver.js"
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
    // MB-25: tests that write overrides assert a successful load.
    billingOverrides: { authoritative: true, clearedLineIds: [] },
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

  // MB-22: override rides the save payload (REPLACE-SET), not a pre-seeded DB row.
  const withOverride = await savePlanVersion(
    draftInput(masterId, [
      baseLine(LINE_A, 1000, {
        billingOverride: {
          mode: "manual",
          reason: "manual",
          months: [{ month: monthKey, amount: overrideAmountDollars }],
          dateBasis: "o2-override-fixture",
        },
      }),
    ])
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

  // Payload line with no override → REPLACE-SET deletes rows → computed.
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

  await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))

  await assert.rejects(
    () =>
      savePlanVersion(
        draftInput(masterId, [
          baseLine(LINE_A, 1000, {
            label: "Search Brand",
            billingOverride: {
              mode: "manual",
              reason: "manual",
              months: [{ month: "2026-05", amount: 777.77 }],
              dateBasis: "o4-c2-block",
            },
          }),
        ])
      ),
    (err: unknown) =>
      err instanceof SavePlanError &&
      err.code === "BILLING_OVERRIDE_SUM_VIOLATION" &&
      err.message.includes("Search Brand")
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

  const overrideLine = {
    ...twoMonthLine,
    billingOverride: {
      mode: "manual" as const,
      reason: "manual" as const,
      months: [{ month: "2026-06", amount: 1000 }],
      dateBasis: "o4-manual-survive",
    },
  }

  const afterDrift = await savePlanVersion(draftInput(masterId, [overrideLine]))
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

  const overrideLine = {
    ...twoMonthLine,
    billingOverride: {
      mode: "manual" as const,
      reason: "manual" as const,
      months: [{ month: "2026-06", amount: 1000 }],
      dateBasis: "mb1-blob-parity",
    },
  }

  const saved = await savePlanVersion(draftInput(masterId, [overrideLine]))
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

test("savePlan MB-2: publish carries billing_overrides to new version + schedule source=override", async (t) => {
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
  const overrideLine = {
    ...twoMonthLine,
    billingOverride: {
      mode: "manual" as const,
      reason: "manual" as const,
      months: [{ month: "2026-06", amount: 1000 }],
      dateBasis: "mb2-carry",
    },
  }
  const v1 = await savePlanVersion(draftInput(masterId, [overrideLine]))

  const published = await savePlanVersion({
    ...draftInput(masterId, [overrideLine]),
    mode: "publish",
    versionNumber: 1,
    campaignStatus: "booked",
  })
  assert.equal(published.versionNumber, 2)
  assert.notEqual(published.versionId, v1.versionId)
  assert.deepEqual(published.droppedBillingOverrides ?? [], [])

  const carried = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, published.versionId))
  assert.equal(carried.length, 1)
  assert.equal(carried[0]!.lineItemId, LINE_A)
  assert.equal(carried[0]!.component, "media")
  assert.deepEqual(carried[0]!.months, [{ month: "2026-06", amount: 1000 }])

  const snap = await snapshot(published.versionId)
  const june = snap.months.find(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A &&
      String(r.month).slice(0, 7) === "2026-06"
  )
  assert.ok(june)
  assert.equal(june!.source, "override")
  assert.equal(Number(june!.amountCents), toCents(1000))

  const notes = await db.execute(sql`
    SELECT kind, payload
    FROM app_notifications
    WHERE kind = 'billing_overrides_publish_carry'
      AND payload->>'mba' = ${MBA}
      AND (payload->>'toVersionId')::bigint = ${published.versionId}
    ORDER BY id DESC
    LIMIT 1
  `)
  const noteRows = Array.from(notes as Iterable<Record<string, unknown>>)
  assert.ok(noteRows.length >= 1, "expected app_notifications audit for carry")
})

test("savePlan MB-11: publish carries when living id is decorated and override id is bare", async (t) => {
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
  const bareId = LINE_A
  const decoratedId = `billing-search::${LINE_A}`
  const twoMonthLine = baseLine(bareId, 1000, {
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 1000,
        buyAmount: 1,
      },
    ],
  })
  const override = {
    mode: "manual" as const,
    reason: "manual" as const,
    months: [{ month: "2026-06", amount: 1000 }],
    dateBasis: "mb11-carry",
  }
  await savePlanVersion(
    draftInput(masterId, [{ ...twoMonthLine, billingOverride: override }])
  )

  // Publish with decorated schedule id + same override — REPLACE-SET writes
  // decorated id; carry+canonical delete still clears the bare tip−1 row first.
  const published = await savePlanVersion({
    ...draftInput(masterId, [
      { ...twoMonthLine, lineItemId: decoratedId, billingOverride: override },
    ]),
    mode: "publish",
    versionNumber: 1,
    campaignStatus: "booked",
  })
  assert.equal(published.versionNumber, 2)
  assert.deepEqual(
    published.droppedBillingOverrides ?? [],
    [],
    "decorated living id must not drop bare override"
  )

  const carried = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, published.versionId))
  assert.equal(carried.length, 1)
  assert.equal(carried[0]!.lineItemId, decoratedId)
  assert.deepEqual(carried[0]!.months, [{ month: "2026-06", amount: 1000 }])
})

test("savePlan MB-2: publish drops overrides for deleted lines and names them in response", async (t) => {
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
  await savePlanVersion(
    draftInput(masterId, [
      baseLine(LINE_A, 1000, {
        billingOverride: {
          mode: "manual",
          reason: "manual",
          months: [{ month: "2026-05", amount: 1000 }],
          dateBasis: "mb2-drop",
        },
      }),
      baseLine(LINE_B, 500),
    ])
  )

  // Publish without LINE_A — override must be dropped and named, not silent.
  const published = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_B, 500)]),
    mode: "publish",
    versionNumber: 1,
    campaignStatus: "booked",
  })
  assert.equal(published.versionNumber, 2)
  assert.ok(
    (published.droppedBillingOverrides ?? []).some(
      (d) => d.lineItemId === LINE_A && d.component === "media"
    ),
    "dropped list must name LINE_A"
  )

  const carried = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, published.versionId))
  assert.equal(carried.length, 0)

  const snap = await snapshot(published.versionId)
  assert.ok(
    !snap.months.some(
      (r) =>
        r.lineItemId === LINE_A &&
        r.basis === "billing" &&
        r.source === "override"
    )
  )

  const notes = await db.execute(sql`
    SELECT payload
    FROM app_notifications
    WHERE kind = 'billing_overrides_publish_carry'
      AND payload->>'mba' = ${MBA}
      AND (payload->>'toVersionId')::bigint = ${published.versionId}
    ORDER BY id DESC
    LIMIT 1
  `)
  const noteRows = Array.from(notes as Iterable<Record<string, unknown>>)
  assert.ok(noteRows.length >= 1)
  const payload = noteRows[0]!.payload as {
    dropped?: Array<{ lineItemId?: string }>
  }
  assert.ok(
    (payload.dropped ?? []).some((d) => d.lineItemId === LINE_A),
    "audit payload must list dropped LINE_A"
  )
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

test("savePlan MB-22: media override from payload → billing_overrides + schedule source=override", async (t) => {
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
    billingOverride: {
      mode: "manual",
      reason: "prepayment",
      months: [{ month: "2026-06", amount: 1000 }],
      dateBasis: "mb22-media",
    },
  })
  const first = await savePlanVersion(draftInput(masterId, [twoMonthLine]))
  const rows = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, first.versionId))
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.component, "media")
  assert.deepEqual(rows[0]!.months, [{ month: "2026-06", amount: 1000 }])

  const snap = await snapshot(first.versionId)
  const billing = snap.months.filter(
    (r) =>
      r.basis === "billing" &&
      r.component === "media" &&
      r.lineItemId === LINE_A &&
      r.source === "override"
  )
  assert.ok(billing.length >= 1)
  assert.equal(
    Number(
      billing.find((r) => String(r.month).slice(0, 7) === "2026-06")?.amountCents
    ),
    toCents(1000)
  )
  assert.ok(
    snap.months
      .filter((r) => r.basis === "delivery" && r.lineItemId === LINE_A)
      .every((r) => r.source === "computed")
  )
})

test("savePlan MB-22: fee override from payload → billing_overrides fee row", async (t) => {
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
  // Seed auto first to learn the AUTO fee total (fee is a slice of gross — not net×%).
  const bare = baseLine(LINE_A, 1000, {
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 1000,
        buyAmount: 1,
      },
    ],
  })
  const first = await savePlanVersion(draftInput(masterId, [bare]))
  const autoFeeCents = (
    await snapshot(first.versionId)
  ).months
    .filter(
      (r) =>
        r.basis === "billing" &&
        r.component === "fee" &&
        r.lineItemId === LINE_A
    )
    .reduce((s, r) => s + Number(r.amountCents), 0)
  const autoFeeDollars = autoFeeCents / 100
  assert.ok(autoFeeDollars > 0)

  const line = {
    ...bare,
    feeOverride: {
      mode: "manual" as const,
      reason: "manual" as const,
      months: [{ month: "2026-06", amount: autoFeeDollars }],
      dateBasis: "mb22-fee",
      component: "fee" as const,
    },
  }
  const saved = await savePlanVersion(draftInput(masterId, [line]))
  const rows = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, saved.versionId))
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.component, "fee")
  assert.deepEqual(rows[0]!.months, [{ month: "2026-06", amount: autoFeeDollars }])

  const snap = await snapshot(saved.versionId)
  const feeRows = snap.months.filter(
    (r) =>
      r.basis === "billing" &&
      r.component === "fee" &&
      r.lineItemId === LINE_A &&
      r.source === "override"
  )
  assert.ok(feeRows.length >= 1)
})

test("savePlan MB-22: non-reconciling override rolls back and names the line", async (t) => {
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
  const before = await snapshot(first.versionId)

  await assert.rejects(
    () =>
      savePlanVersion(
        draftInput(masterId, [
          baseLine(LINE_A, 1000, {
            label: "Off-by Search",
            billingOverride: {
              mode: "manual",
              reason: "manual",
              months: [{ month: "2026-05", amount: 50 }],
              dateBasis: "mb22-gate",
            },
          }),
        ])
      ),
    (err: unknown) =>
      err instanceof SavePlanError &&
      err.code === "BILLING_OVERRIDE_SUM_VIOLATION" &&
      err.message.includes("Off-by Search")
  )

  const after = await snapshot(first.versionId)
  assert.equal(after.lines.length, before.lines.length)
  assert.equal(after.months.length, before.months.length)
  const db = getDb()
  const overrides = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, first.versionId))
  assert.equal(overrides.length, 0)
})

test("savePlan MB-22: partial-MBA excluded line override survives byte-identical", async (t) => {
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
  const months = [{ month: "2026-05", amount: 500 }] as const
  const excludedOverride = {
    mode: "manual" as const,
    reason: "manual" as const,
    months: [...months],
    dateBasis: "mb22-excluded",
  }
  // Payload always covers every line (buildEditorLineItemInputs); B is excluded
  // but still carries its override — REPLACE-SET must not delete it.
  const saved = await savePlanVersion(
    draftInput(masterId, [
      baseLine(LINE_A, 1000, { approval: "approved" }),
      baseLine(LINE_B, 500, {
        approval: "excluded",
        billingOverride: excludedOverride,
      }),
    ])
  )

  const rows = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, saved.versionId))
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.lineItemId, LINE_B)
  assert.deepEqual(rows[0]!.months, [{ month: "2026-05", amount: 500 }])
  assert.equal(rows[0]!.dateBasis, "mb22-excluded")

  // Re-save with same excluded+override payload — byte-identical survive.
  await savePlanVersion(
    draftInput(masterId, [
      baseLine(LINE_A, 1000, { approval: "approved" }),
      baseLine(LINE_B, 500, {
        approval: "excluded",
        billingOverride: excludedOverride,
      }),
    ])
  )
  const again = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, saved.versionId))
  assert.equal(again.length, 1)
  assert.deepEqual(again[0]!.months, [{ month: "2026-05", amount: 500 }])
  assert.equal(again[0]!.mode, "manual")
  assert.equal(again[0]!.reason, "manual")
  assert.equal(again[0]!.dateBasis, "mb22-excluded")
})

test("savePlan MB-22: publish with override → new version has it", async (t) => {
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
  const overrideLine = baseLine(LINE_A, 1000, {
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 1000,
        buyAmount: 1,
      },
    ],
    billingOverride: {
      mode: "manual",
      reason: "manual",
      months: [{ month: "2026-06", amount: 1000 }],
      dateBasis: "mb22-publish",
    },
  })
  const v1 = await savePlanVersion(draftInput(masterId, [overrideLine]))
  const published = await savePlanVersion({
    ...draftInput(masterId, [overrideLine]),
    mode: "publish",
    versionNumber: 1,
    campaignStatus: "booked",
  })
  assert.notEqual(published.versionId, v1.versionId)
  const rows = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, published.versionId))
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0]!.months, [{ month: "2026-06", amount: 1000 }])
})

test("savePlan MB-25 (a): authoritative false leaves pre-existing overrides untouched", async (t) => {
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
  const withOverride = baseLine(LINE_A, 1000, {
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 1000,
        buyAmount: 1,
      },
    ],
    billingOverride: {
      mode: "manual",
      reason: "prepayment",
      months: [{ month: "2026-06", amount: 1000 }],
      dateBasis: "mb25-a",
    },
  })
  const first = await savePlanVersion(draftInput(masterId, [withOverride]))
  const before = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, first.versionId))
  assert.equal(before.length, 1)

  // Simulate failed GET: client sends no overrides on lines + authoritative false.
  await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)], {
      billingOverrides: { authoritative: false, clearedLineIds: [] },
    })
  )
  const after = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, first.versionId))
  assert.equal(after.length, 1)
  assert.deepEqual(after[0]!.months, [{ month: "2026-06", amount: 1000 }])
})

test("savePlan MB-25 (b): clearedLineIds deletes reset line; sibling survives", async (t) => {
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
  const lineA = baseLine(LINE_A, 1000, {
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 1000,
        buyAmount: 1,
      },
    ],
    billingOverride: {
      mode: "manual",
      reason: "prepayment",
      months: [{ month: "2026-06", amount: 1000 }],
      dateBasis: "mb25-b-a",
    },
  })
  const lineB = baseLine(LINE_B, 500, {
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 500,
        buyAmount: 1,
      },
    ],
    billingOverride: {
      mode: "manual",
      reason: "manual",
      months: [{ month: "2026-06", amount: 500 }],
      dateBasis: "mb25-b-b",
    },
  })
  const first = await savePlanVersion(draftInput(masterId, [lineA, lineB]))
  assert.equal(
    (
      await db
        .select()
        .from(schema.billingOverrides)
        .where(eq(schema.billingOverrides.versionId, first.versionId))
    ).length,
    2
  )

  // Reset A: payload keeps B override, tombstones A, no override on A.
  await savePlanVersion(
    draftInput(
      masterId,
      [
        baseLine(LINE_A, 1000, {
          bursts: lineA.bursts as SavePlanLineItem["bursts"],
        }),
        lineB,
      ],
      {
        billingOverrides: {
          authoritative: true,
          clearedLineIds: [LINE_A],
        },
      }
    )
  )
  const after = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, first.versionId))
  assert.equal(after.length, 1)
  assert.equal(after[0]!.lineItemId, LINE_B)
})

test("savePlan: eligible non-excluded line writes adserving rows on billing + delivery", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const pdId = `${MBA.toUpperCase()}PD001`
  const getRateForMediaType = createAdServingRateResolver({
    video: 0,
    audio: 0,
    display: 2.5,
    imp: 0,
  })
  const line: SavePlanLineItem = {
    lineItemId: pdId,
    channel: "prog_display",
    mediaType: "progDisplay",
    buyType: "cpm",
    rate: 10,
    enteredAmount: 5_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    noAdserving: false,
    feePct: 15,
    approval: "approved",
    bursts: [
      {
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        budget: 5_000,
        buyAmount: 10,
        deliverables: 500_000,
      },
    ],
  }

  const result = await savePlanVersion(
    draftInput(masterId, [line], {
      channelFlags: { mp_progdisplay: true },
      feeLoading: { feeprogdisplay: 15 },
      getRateForMediaType,
      adservaudio: 0,
    })
  )

  // Persist path: schedule_months rows.
  const snap = await snapshot(result.versionId)
  const adBilling = snap.months.filter(
    (r) => r.component === "adserving" && r.basis === "billing"
  )
  const adDelivery = snap.months.filter(
    (r) => r.component === "adserving" && r.basis === "delivery"
  )
  assert.ok(adBilling.length > 0, "DB must have adserving rows on billing basis")
  assert.ok(adDelivery.length > 0, "DB must have adserving rows on delivery basis")
  assert.ok(adBilling.every((r) => Number(r.amountCents) > 0))
  assert.ok(adDelivery.every((r) => Number(r.amountCents) > 0))

  // Explode the persisted blobs (not just in-memory recompute).
  const billingExplode = explodeScheduleToMonthRows(
    result.versionId,
    "billing",
    result.legacySchedules.billingSchedule
  )
  const deliveryExplode = explodeScheduleToMonthRows(
    result.versionId,
    "delivery",
    result.legacySchedules.deliverySchedule
  )
  assert.equal(billingExplode.failureReason, null)
  assert.equal(deliveryExplode.failureReason, null)
  assert.ok(
    billingExplode.rows.some((r) => r.component === "adserving" && r.amountCents > 0),
    "explode(billing) must yield adserving rows"
  )
  assert.ok(
    deliveryExplode.rows.some((r) => r.component === "adserving" && r.amountCents > 0),
    "explode(delivery) must yield adserving rows"
  )
})

test("VC Stage 1: publish stamps published_at (server now) + lowercased published_by", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  const beforeMs = Date.now()
  const published = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    versionNumber: 1,
    campaignStatus: "booked",
    publishedByEmail: "Luke@Assembled.Media",
  })
  const afterMs = Date.now()
  const snap = await snapshot(published.versionId)
  assert.ok(snap.version?.publishedAt, "published_at must be set")
  const stampedMs = new Date(String(snap.version!.publishedAt)).getTime()
  assert.ok(Number.isFinite(stampedMs), "published_at parses")
  assert.ok(
    stampedMs >= beforeMs - 5_000 && stampedMs <= afterMs + 5_000,
    `published_at within ~5s of now (got ${snap.version!.publishedAt})`
  )
  assert.equal(snap.version?.publishedBy, "luke@assembled.media")
})

test("VC Stage 1: draft save leaves published_at null", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const draft = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)], {
      publishedByEmail: "should-not-stamp@example.com",
    })
  )
  const snap = await snapshot(draft.versionId)
  assert.equal(snap.version?.publishedAt, null)
  assert.equal(snap.version?.publishedBy, null)
})

test("VC Stage 2a: draft re-save of published version → VERSION_PUBLISHED_IMMUTABLE, nothing written", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  const published = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    campaignStatus: "booked",
    publishedByEmail: "publisher@example.com",
  })
  const before = await snapshot(published.versionId)
  assert.ok(before.version?.publishedAt)
  assert.equal(before.version?.publishedBy, "publisher@example.com")
  assert.equal(before.version?.campaignName, "T4a kill-shot")

  await assert.rejects(
    () =>
      savePlanVersion(
        draftInput(masterId, [baseLine(LINE_A, 1100)], {
          versionNumber: published.versionNumber,
          campaignName: "Draft re-save after publish",
        })
      ),
    (err: unknown) =>
      err instanceof SavePlanError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE" &&
      err.message.includes(String(published.versionId)) &&
      err.message.includes(`v${published.versionNumber}`)
  )

  const after = await snapshot(published.versionId)
  assert.equal(after.version?.publishedAt, before.version?.publishedAt)
  assert.equal(after.version?.publishedBy, before.version?.publishedBy)
  assert.equal(after.version?.campaignName, before.version?.campaignName)
  assert.equal(after.lines.length, before.lines.length)
  assert.equal(after.months.length, before.months.length)
})

test("VC Stage 1: new_version inserts unpublished (published_at null)", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  const staged = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "new_version",
    campaignStatus: "draft",
    publishedByEmail: "should-not-stamp@example.com",
  })
  assert.equal(staged.versionNumber, 2)
  assert.equal(staged.published, false)
  const snap = await snapshot(staged.versionId)
  assert.equal(snap.version?.publishedAt, null)
  assert.equal(snap.version?.publishedBy, null)
})

test("NV-1: new_version with 0 lines rejected (BOSS006)", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  await assert.rejects(
    () =>
      savePlanVersion({
        ...draftInput(masterId, []),
        mode: "new_version",
        campaignStatus: "draft",
      }),
    (err: unknown) =>
      err instanceof SavePlanError &&
      err.code === "BOSS006_EMPTY_PUBLISH" &&
      /0 line/i.test(err.message)
  )
})

test("NV-1: pointer→unpublished + new_version cut → reads resolve NEW tip (pointer unchanged)", async (t) => {
  // Route behaviour (assert only — do not change): /api/plans/save clears
  // plan_working_drafts via deleteWorkingDraft on ALL successful modes
  // (draft / new_version / publish) — see app/api/plans/save/route.ts.
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const v1 = await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  // Stale pointer: published_version_id → unpublished v1 (NV-0 debris).
  const db = getDb()
  await db
    .update(schema.mediaPlanMasters)
    .set({ publishedVersionId: v1.versionId })
    .where(eq(schema.mediaPlanMasters.id, masterId))

  const { mapPlanMasterFromPostgres } = await import("../readMediaPlans.js")
  const [masterBefore] = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, masterId))
  const versionsBefore = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterId))
  const pubBefore = versionsBefore.find((v) => v.id === masterBefore!.publishedVersionId)
  const maxBefore = Math.max(
    ...versionsBefore.map((v) => Number(v.versionNumber) || 0)
  )
  const tipBefore = mapPlanMasterFromPostgres(
    masterBefore as unknown as Record<string, unknown>,
    pubBefore
      ? {
          version_number: pubBefore.versionNumber,
          published_at: pubBefore.publishedAt,
        }
      : null,
    maxBefore
  )
  assert.equal(
    tipBefore.version_number,
    maxBefore,
    "stale pointer→unpublished must fall back to max(vn)"
  )

  const cut = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1200)]),
    mode: "new_version",
    campaignStatus: "draft",
  })
  assert.equal(cut.published, false)
  assert.equal(cut.versionNumber, maxBefore + 1)

  const [masterAfter] = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, masterId))
  // NV-0: new_version must NOT advance published_version_id.
  assert.equal(masterAfter!.publishedVersionId, v1.versionId)

  const versionsAfter = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterId))
  const pubAfter = versionsAfter.find((v) => v.id === masterAfter!.publishedVersionId)
  const maxAfter = Math.max(
    ...versionsAfter.map((v) => Number(v.versionNumber) || 0)
  )
  const tipAfter = mapPlanMasterFromPostgres(
    masterAfter as unknown as Record<string, unknown>,
    pubAfter
      ? {
          version_number: pubAfter.versionNumber,
          published_at: pubAfter.publishedAt,
        }
      : null,
    maxAfter
  )
  assert.equal(tipAfter.version_number, cut.versionNumber)
  assert.equal(tipAfter.version_number, maxAfter)
})

test("VC Stage 1: publish with no email stamps published_at, published_by null", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  const published = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    campaignStatus: "booked",
    publishedByEmail: null,
  })
  const snap = await snapshot(published.versionId)
  assert.ok(snap.version?.publishedAt)
  assert.equal(snap.version?.publishedBy, null)
})

test("CS-B: draft overwrite with booked payload does not write version campaign_status", async (t) => {
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
  const before = await snapshot(first.versionId)
  const beforeStatus = before.version?.campaignStatus

  await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)], {
      campaignStatus: "booked",
    })
  )
  const after = await snapshot(first.versionId)
  assert.equal(after.version?.campaignStatus, beforeStatus)
  assert.notEqual(after.version?.campaignStatus, "booked")
})

test("CS-B REQUIREMENT LOCK: status-only change at v5 does not cut a version and leaves line_items.created_at unchanged", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  let last = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "new_version",
  })
  last = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "new_version",
  })
  last = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "new_version",
  })
  last = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "new_version",
  })
  assert.equal(last.versionNumber, 5)

  const db = getDb()
  const [lineBefore] = await db
    .select({ createdAt: schema.lineItems.createdAt })
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, last.versionId))
    .limit(1)
  assert.ok(lineBefore?.createdAt)

  const { writeCampaignStatus } = await import("../writeCampaignStatus.js")
  await writeCampaignStatus(MBA, "cancelled")

  const versions = await db
    .select({ id: schema.mediaPlanVersions.id })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterId))
  assert.equal(versions.length, 5)

  const [lineAfter] = await db
    .select({ createdAt: schema.lineItems.createdAt })
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, last.versionId))
    .limit(1)
  assert.equal(lineAfter?.createdAt, lineBefore.createdAt)
})

test("savePlan: close db pool", async () => {
  if (hasDb) await closeDb()
})
