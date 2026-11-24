/**
 * M3 goldens (C-421): what an override write and a reset store that must not
 * move when the override path takes savePlan's inputs. A plan whose master has
 * no client prices no ad serving, so its stored money is the same before and
 * after the fix: the money in both stored schedules, the billing-basis
 * `schedule_months` rows and the override row. Requires DATABASE_URL. Skips
 * when unset.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { eq } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import { loadEnvLocalForTests } from "../../testing/loadEnvLocalForTests"
import { replaceBillingOverrideLine, resetBillingOverrideLine } from "../writeBillingOverrides.js"
import { savePlanVersion, type SavePlanLineItem } from "../savePlan.js"

loadEnvLocalForTests()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())
const MBA = `m3g${Date.now().toString(36)}`
const DISPLAY = `${MBA.toUpperCase()}DD001`
const SEARCH = `${MBA.toUpperCase()}SEA001`
const FEES = { feedigidisplay: 10, feesearch: 10 }

const lines: SavePlanLineItem[] = [
  {
    lineItemId: DISPLAY,
    channel: "digi_display",
    mediaType: "digiDisplay",
    buyType: "cpm",
    rate: 10,
    enteredAmount: 1000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    noAdserving: false,
    approval: "approved",
    bursts: [{ startDate: "2026-06-01", endDate: "2026-07-31", budget: 1000, buyAmount: 10 }],
    attrs: {},
  },
  {
    lineItemId: SEARCH,
    channel: "search",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 1000,
    budgetIncludesFees: true,
    clientPaysForMedia: false,
    approval: "approved",
    bursts: [{ startDate: "2026-06-01", endDate: "2026-07-31", budget: 1000, buyAmount: 1 }],
    attrs: {},
  },
]

async function wipe(): Promise<void> {
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

type Month = { monthYear?: string; mediaTotal?: string; feeTotal?: string; adservingTechFees?: string; totalAmount?: string }

/** The money in each stored schedule, month by month. */
async function storedMoney(versionId: number) {
  const db = getDb()
  const [row] = await db
    .select({ blob: schema.mediaPlanVersions.legacySchedules })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
  const blob = row?.blob as { billingSchedule: Month[]; deliverySchedule: Month[] }
  const money = (months: Month[]) =>
    months.map((m) => [m.monthYear, m.mediaTotal, m.feeTotal, m.adservingTechFees, m.totalAmount].join(" | "))
  const rows = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, versionId))
  return {
    billing: money(blob.billingSchedule),
    delivery: money(blob.deliverySchedule),
    rows: rows
      .filter((r) => r.basis === "billing")
      .map((r) => `${r.lineItemId === SEARCH ? "search" : "display"} ${r.component} ${String(r.month).slice(0, 7)} ${r.amountCents} ${r.source}`)
      .sort(),
  }
}

test("override write and reset store the same money (no client, no ad serving)", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  t.after(async () => {
    await wipe()
    await closeDb()
  })
  await wipe()
  const db = getDb()
  const [master] = await db
    .insert(schema.mediaPlanMasters)
    .values({ mbaNumber: MBA, campaignName: "M3 golden", campaignStatus: "Draft", campaignBudgetCents: 200_000 })
    .returning({ id: schema.mediaPlanMasters.id })
  const saved = await savePlanVersion({
    masterId: master!.id,
    mbaNumber: MBA,
    versionNumber: 1,
    mode: "draft",
    campaignName: "M3 golden",
    campaignStatus: "Draft",
    campaignStartDate: "2026-06-01",
    campaignEndDate: "2026-07-31",
    campaignBudgetCents: 200_000,
    channelFlags: { mp_digidisplay: true, mp_search: true },
    lineItems: lines,
    feeLoading: FEES,
    mbaScope: { lineItemIds: null, monthYears: null },
    billingOverrides: { authoritative: true, clearedLineIds: [] },
  })
  await db.insert(schema.mbaFeeSnapshots).values({ versionId: saved.versionId, fees: FEES })

  const override = await replaceBillingOverrideLine({
    versionId: saved.versionId,
    mbaNumber: MBA,
    lineItemId: SEARCH,
    component: "media",
    months: [{ month: "2026-06", amount: 900 }, { month: "2026-07", amount: 0 }],
    dateBasis: "m3-golden",
  })
  assert.deepEqual(override.months, [{ month: "2026-06", amount: 900 }, { month: "2026-07", amount: 0 }])
  assert.deepEqual(await storedMoney(saved.versionId), GOLDEN_AFTER_OVERRIDE)

  await resetBillingOverrideLine({ versionId: saved.versionId, mbaNumber: MBA, lineItemId: SEARCH, component: "media" })
  assert.deepEqual(await storedMoney(saved.versionId), GOLDEN_AFTER_RESET)
})

const FEE_ROWS = [
  "display fee 2026-06 5464 computed",
  "display fee 2026-07 5647 computed",
  "display media 2026-06 49180 computed",
  "display media 2026-07 50820 computed",
  "search fee 2026-06 4918 computed",
  "search fee 2026-07 5082 computed",
]
const DELIVERY = ["June 2026 | $934.42 | $103.82 | $0.00 | $1,038.24", "July 2026 | $965.58 | $107.29 | $0.00 | $1,072.87"]

const GOLDEN_AFTER_OVERRIDE = {
  billing: ["June 2026 | $1,391.80 | $103.82 | $0.00 | $1,495.62", "July 2026 | $508.20 | $107.29 | $0.00 | $615.49"],
  delivery: DELIVERY,
  rows: [...FEE_ROWS, "search media 2026-06 90000 override", "search media 2026-07 0 override"],
}
const GOLDEN_AFTER_RESET = {
  billing: DELIVERY,
  delivery: DELIVERY,
  rows: [...FEE_ROWS, "search media 2026-06 44262 computed", "search media 2026-07 45738 computed"],
}
