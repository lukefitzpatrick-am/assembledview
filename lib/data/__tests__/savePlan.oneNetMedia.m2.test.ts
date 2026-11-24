/**
 * M2 review R1 (C-417): `savePlanVersion` hands `one_net_media` to the
 * financials it stores. Fixture: a fee-inclusive display line, $0.70 at
 * 19.5%, CPM $1 (563.5 impressions, an exact half), ad serving at $1,000 CPM.
 * Off: 563 impressions and $563.00 ad serving. On: 564 and $564.00, in the
 * stored billing schedule and in `schedule_months` (adserving cents).
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { and, eq } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import { createAdServingRateResolver } from "@/lib/billing/adServingRateResolver.js"
import { setFeatureRowReaderForTests } from "@/lib/features/server"
import { loadEnvLocalForTests } from "../../testing/loadEnvLocalForTests"
import { savePlanVersion, type SavePlanLineItem, type SavePlanVersionInput } from "../savePlan.js"

loadEnvLocalForTests()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())
const MBA = `m2s${Date.now().toString(36)}`
const LINE = `${MBA.toUpperCase()}DD001`

const line: SavePlanLineItem = {
  lineItemId: LINE,
  channel: "digi_display",
  mediaType: "digiDisplay",
  buyType: "cpm",
  rate: 1,
  enteredAmount: 0.7,
  budgetIncludesFees: true,
  clientPaysForMedia: false,
  noAdserving: false,
  feePct: 19.5,
  approval: "approved",
  bursts: [{ startDate: "2026-05-01", endDate: "2026-05-31", budget: 0.7, buyAmount: 1, deliverables: 563 }],
  attrs: {},
}

async function wipeMba(): Promise<void> {
  const db = getDb()
  const masters = await db
    .select({ id: schema.mediaPlanMasters.id })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.mbaNumber, MBA))
  for (const m of masters) {
    await db.update(schema.mediaPlanMasters).set({ publishedVersionId: null }).where(eq(schema.mediaPlanMasters.id, m.id))
    await db.delete(schema.mediaPlanVersions).where(eq(schema.mediaPlanVersions.masterId, m.id))
    await db.delete(schema.mediaPlanMasters).where(eq(schema.mediaPlanMasters.id, m.id))
  }
}

async function saveWithSwitch(on: boolean) {
  await wipeMba()
  setFeatureRowReaderForTests(
    async () => new Map([["one_net_media", { key: "one_net_media", enabled: on, updatedAt: null, updatedBy: null, updatedByName: null, note: null }]]),
  )
  const [master] = await getDb()
    .insert(schema.mediaPlanMasters)
    .values({ mbaNumber: MBA, campaignName: "M2 one net media", campaignStatus: "Draft", campaignBudgetCents: 100_000 })
    .returning({ id: schema.mediaPlanMasters.id })
  const input: SavePlanVersionInput = {
    masterId: master!.id,
    mbaNumber: MBA,
    versionNumber: 1,
    mode: "draft",
    campaignName: "M2 one net media",
    campaignStatus: "Draft",
    campaignStartDate: "2026-05-01",
    campaignEndDate: "2026-05-31",
    campaignBudgetCents: 100_000,
    channelFlags: { mp_digidisplay: true },
    lineItems: [line],
    feeLoading: { feedigidisplay: 19.5 },
    billingOverrides: { authoritative: true, clearedLineIds: [] },
    getRateForMediaType: createAdServingRateResolver({ display: 1000, video: 1000, audio: 1000, imp: 0 }),
    adservaudio: 1000,
  }
  const result = await savePlanVersion(input)
  const months = await getDb()
    .select({ cents: schema.scheduleMonths.amountCents })
    .from(schema.scheduleMonths)
    .where(
      and(
        eq(schema.scheduleMonths.versionId, result.versionId),
        eq(schema.scheduleMonths.basis, "billing"),
        eq(schema.scheduleMonths.component, "adserving"),
      ),
    )
  const blob = JSON.stringify(result.legacySchedules.billingSchedule)
  return {
    blob: [blob.match(/"totalAdServingAmount":([0-9.]+)/)?.[1], blob.match(/"adservingTechFees":"([^"]+)"/)?.[1]],
    scheduleCents: months.reduce((sum, m) => sum + Number(m.cents), 0),
  }
}

test("savePlan stores ad serving on the count the switch gives (off 563, on 564)", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  t.after(async () => {
    setFeatureRowReaderForTests(null)
    await wipeMba()
    await closeDb()
  })
  assert.deepEqual(await saveWithSwitch(false), { blob: ["563", "$563.00"], scheduleCents: 56_300 })
  assert.deepEqual(await saveWithSwitch(true), { blob: ["564", "$564.00"], scheduleCents: 56_400 })
})
