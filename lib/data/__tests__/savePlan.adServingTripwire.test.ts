/**
 * AS-4 (c) — save-coverage for `[savePlan-adserving-zero]`.
 *
 * Sibling of `savePlan.test.ts` (already ~1.5k lines / DB kill-shot suite) so
 * tripwire cases stay focused and do not grow the transactional harness further.
 * Requires DATABASE_URL. Assert-only — does not change tripwire or savePlan.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { eq } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  savePlanVersion,
  type SavePlanLineItem,
  type SavePlanVersionInput,
} from "../savePlan.js"
import { createAdServingRateResolver } from "@/lib/billing/adServingRateResolver.js"
import type { AdServingZeroTripwireResult } from "@/lib/billing/adServingSaveTripwire.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MBA = `as4${Date.now().toString(36)}`

type TripLogPayload = AdServingZeroTripwireResult & {
  mba: string
  version: number
  mode: string
  hasResolver: boolean
  adservaudio: number | null
}

function eligibleLine(
  lineItemId: string,
  opts: {
    channel: SavePlanLineItem["channel"]
    mediaType: string
    budget: number
    deliverables: number
    noAdserving?: boolean
  }
): SavePlanLineItem {
  return {
    lineItemId,
    channel: opts.channel,
    mediaType: opts.mediaType,
    buyType: "cpm",
    rate: 10,
    enteredAmount: opts.budget,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    noAdserving: opts.noAdserving ?? false,
    feePct: 15,
    approval: "approved",
    bursts: [
      {
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        budget: opts.budget,
        buyAmount: 10,
        deliverables: opts.deliverables,
      },
    ],
    attrs: {},
  }
}

async function seedMaster(): Promise<number> {
  const db = getDb()
  const [row] = await db
    .insert(schema.mediaPlanMasters)
    .values({
      mbaNumber: MBA,
      campaignName: "AS-4 adserving tripwire",
      campaignStatus: "Draft",
      campaignBudgetCents: 20_000_00,
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
    campaignName: "AS-4 adserving tripwire",
    campaignStatus: "Draft",
    campaignStartDate: "2026-05-01",
    campaignEndDate: "2026-05-31",
    campaignBudgetCents: 20_000_00,
    channelFlags: { mp_progdisplay: true },
    lineItems: lines,
    feeLoading: { feeprogdisplay: 15 },
    billingOverrides: { authoritative: true, clearedLineIds: [] },
    ...extra,
  }
}

function captureTripwireLogs(
  errorMock: ReturnType<typeof mock.method>
): TripLogPayload[] {
  return errorMock.mock.calls
    .filter((c) => c.arguments[0] === "[savePlan-adserving-zero]")
    .map((c) => c.arguments[1] as TripLogPayload)
}

test("AS-4 save: campaign_zero tripwire when eligible lines save with adServingTotal $0", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const errorMock = mock.method(console, "error", () => {})
  t.after(() => errorMock.mock.restore())

  const pdId = `${MBA.toUpperCase()}PD001`
  const line = eligibleLine(pdId, {
    channel: "prog_display",
    mediaType: "progDisplay",
    budget: 5_000,
    deliverables: 500_000,
  })

  // No getRateForMediaType → financials fall back to (() => 0) → adServingTotal $0.
  const result = await savePlanVersion(draftInput(masterId, [line]))
  assert.ok(result.versionId > 0, "save must complete (tripwire never blocks)")

  const trips = captureTripwireLogs(errorMock)
  assert.equal(trips.length, 1, "must emit exactly one [savePlan-adserving-zero]")
  const trip = trips[0]!
  assert.equal(trip.kind, "campaign_zero")
  assert.ok(Math.abs(trip.adServingTotal) < 0.005)
  assert.equal(trip.zeroLines.length, 1)
  assert.equal(trip.zeroLines[0]!.lineItemId, pdId)
  assert.equal(trip.zeroLines[0]!.mediaType, "progDisplay")
  assert.equal(trip.chargedLines.length, 0)
})

test("AS-4 save: partial_zero when one eligible line charges and a sibling stays $0", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const errorMock = mock.method(console, "error", () => {})
  t.after(() => errorMock.mock.restore())

  const pdId = `${MBA.toUpperCase()}PD001`
  const dvId = `${MBA.toUpperCase()}DV001`
  const lines = [
    eligibleLine(pdId, {
      channel: "prog_display",
      mediaType: "progDisplay",
      budget: 5_000,
      deliverables: 500_000,
    }),
    eligibleLine(dvId, {
      channel: "digi_video",
      mediaType: "digiVideo",
      budget: 4_000,
      deliverables: 400_000,
    }),
  ]

  // Display rate charges progDisplay; video=0 leaves digiVideo at $0 → partial_zero.
  const getRateForMediaType = createAdServingRateResolver({
    video: 0,
    audio: 0,
    display: 2.5,
    imp: 0,
  })

  const result = await savePlanVersion(
    draftInput(masterId, lines, {
      channelFlags: { mp_progdisplay: true, mp_digivideo: true },
      feeLoading: { feeprogdisplay: 15, feedigivideo: 15 },
      getRateForMediaType,
      adservaudio: 0,
    })
  )
  assert.ok(result.versionId > 0, "save must complete (tripwire never blocks)")

  const trips = captureTripwireLogs(errorMock)
  assert.equal(trips.length, 1, "must emit exactly one [savePlan-adserving-zero]")
  const trip = trips[0]!
  assert.equal(trip.kind, "partial_zero")
  assert.ok(trip.adServingTotal > 0.005, "campaign total must be non-zero")
  assert.equal(trip.chargedLines.length, 1)
  assert.equal(trip.chargedLines[0]!.lineItemId, pdId)
  assert.equal(trip.chargedLines[0]!.mediaType, "progDisplay")
  assert.ok(trip.chargedLines[0]!.adServingAmount >= 0.005)
  assert.equal(trip.zeroLines.length, 1)
  assert.equal(trip.zeroLines[0]!.lineItemId, dvId)
  assert.equal(trip.zeroLines[0]!.mediaType, "digiVideo")
  assert.ok(Math.abs(trip.zeroLines[0]!.adServingAmount) < 0.005)
})

test("AS-4 save: no tripwire when every eligible line charges", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const errorMock = mock.method(console, "error", () => {})
  t.after(() => errorMock.mock.restore())

  const pdId = `${MBA.toUpperCase()}PD001`
  const dvId = `${MBA.toUpperCase()}DV001`
  const lines = [
    eligibleLine(pdId, {
      channel: "prog_display",
      mediaType: "progDisplay",
      budget: 5_000,
      deliverables: 500_000,
    }),
    eligibleLine(dvId, {
      channel: "digi_video",
      mediaType: "digiVideo",
      budget: 4_000,
      deliverables: 400_000,
    }),
  ]

  const getRateForMediaType = createAdServingRateResolver({
    video: 3,
    audio: 0,
    display: 2.5,
    imp: 0,
  })

  const result = await savePlanVersion(
    draftInput(masterId, lines, {
      channelFlags: { mp_progdisplay: true, mp_digivideo: true },
      feeLoading: { feeprogdisplay: 15, feedigivideo: 15 },
      getRateForMediaType,
      adservaudio: 0,
    })
  )
  assert.ok(result.versionId > 0)

  const trips = captureTripwireLogs(errorMock)
  assert.equal(trips.length, 0, "healthy campaign must not emit tripwire")
})

test("AS-4 save: no tripwire when all eligible lines are noAdserving", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const errorMock = mock.method(console, "error", () => {})
  t.after(() => errorMock.mock.restore())

  const pdId = `${MBA.toUpperCase()}PD001`
  const dvId = `${MBA.toUpperCase()}DV001`
  // Legitimate flags — without this control the tripwire cries wolf on ~57% of lines.
  const lines = [
    eligibleLine(pdId, {
      channel: "prog_display",
      mediaType: "progDisplay",
      budget: 5_000,
      deliverables: 500_000,
      noAdserving: true,
    }),
    eligibleLine(dvId, {
      channel: "digi_video",
      mediaType: "digiVideo",
      budget: 4_000,
      deliverables: 400_000,
      noAdserving: true,
    }),
  ]

  // No rates (would be campaign_zero if flags were ignored).
  const result = await savePlanVersion(
    draftInput(masterId, lines, {
      channelFlags: { mp_progdisplay: true, mp_digivideo: true },
      feeLoading: { feeprogdisplay: 15, feedigivideo: 15 },
    })
  )
  assert.ok(result.versionId > 0)

  const trips = captureTripwireLogs(errorMock)
  assert.equal(
    trips.length,
    0,
    "noAdserving-true eligible lines must not emit tripwire"
  )
})

test("AS-4 save: close db pool", async () => {
  if (hasDb) await closeDb()
})
