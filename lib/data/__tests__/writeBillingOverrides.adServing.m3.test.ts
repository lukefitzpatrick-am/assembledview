/**
 * M3 (C-421): an override write rewrites `legacy_schedules` with the same
 * inputs `savePlanVersion` uses, so the stored billing schedule keeps its ad
 * serving. Fixture: a display line ($1,000 at CPM $10, 100,000 impressions,
 * client display ad serving $5 CPM, so $500), a prog BVOD, a digi audio and
 * a prog OOH line on the video, audio and impression rates ($350, $900, $20),
 * a search line that takes the override, a social line, and a production
 * line whose attrs say "OOH".
 * After an override and after a reset, the stored blob equals what a save of
 * the same plan and override rows stores, with and without a stored MBA scope.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { eq } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import { createAdServingRateResolver } from "@/lib/billing/adServingRateResolver.js"
import { loadEnvLocalForTests } from "../../testing/loadEnvLocalForTests"
import { replaceBillingOverrideLine, resetBillingOverrideLine } from "../writeBillingOverrides.js"
import { savePlanVersion, type SavePlanLineItem, type SavePlanVersionInput } from "../savePlan.js"

loadEnvLocalForTests()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())
const MBA = `m3a${Date.now().toString(36)}`
const DISPLAY = `${MBA.toUpperCase()}DD001`
const SEARCH = `${MBA.toUpperCase()}SEA001`
const RATES = { display: 5, video: 7, audio: 3, imp: 1 }
const FEES = { feedigidisplay: 10, feesearch: 10, feesocial: 10, feeprogbvod: 10, feedigiaudio: 10, feeprogooh: 10 }

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
    publisher: "Pub",
    bursts: [{ startDate: "2026-06-01", endDate: "2026-07-31", budget: 1000, buyAmount: 10 }],
    attrs: { site: "Site" },
  },
  {
    lineItemId: SEARCH,
    channel: "search",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 1000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    approval: "approved",
    platform: "Google",
    bursts: [{ startDate: "2026-06-01", endDate: "2026-07-31", budget: 1000, buyAmount: 1 }],
    attrs: {},
  },
]

// One line per other client rate, so each rate column is pinned (M3 review R1):
// prog BVOD at the video rate (50,000 impressions x $7 CPM = $350), digi audio
// on CPC at the audio rate (300 clicks at 0.1% CTR = 300,000 impressions x $3
// = $900), prog OOH at the impression rate (20,000 x $1 = $20).
const rateLines: SavePlanLineItem[] = [
  ["PBV001", "prog_bvod", "progBvod", "cpm", 20, 1000],
  ["DA001", "digi_audio", "digiAudio", "cpc", 1, 300],
  ["POH001", "prog_ooh", "progOoh", "cpm", 25, 500],
].map(([suffix, channel, mediaType, buyType, rate, budget]) => ({
  lineItemId: `${MBA.toUpperCase()}${suffix}`,
  channel: channel as SavePlanLineItem["channel"],
  mediaType: String(mediaType),
  buyType: String(buyType),
  rate: Number(rate),
  enteredAmount: Number(budget),
  budgetIncludesFees: false,
  clientPaysForMedia: false,
  noAdserving: false,
  approval: "approved" as const,
  platform: "DSP",
  bursts: [{ startDate: "2026-06-01", endDate: "2026-07-31", budget: Number(budget), buyAmount: Number(rate) }],
  attrs: {},
}))

// A social line: its save headers come from the socialMedia branch (platform, targeting).
const socialLine: SavePlanLineItem = {
  lineItemId: `${MBA.toUpperCase()}SOC001`,
  channel: "social",
  mediaType: "socialMedia",
  buyType: "cpm",
  rate: 8,
  enteredAmount: 400,
  budgetIncludesFees: false,
  clientPaysForMedia: false,
  approval: "approved",
  platform: "Meta",
  bursts: [{ startDate: "2026-06-01", endDate: "2026-06-30", budget: 400, buyAmount: 8 }],
  attrs: { targeting: "Women 25-54" },
}

// A production line whose attrs name the work ("OOH"): the save prices it as production.
const PRODUCTION = `${MBA.toUpperCase()}PRD001`
const productionLine: SavePlanLineItem = {
  lineItemId: PRODUCTION,
  channel: "production",
  mediaType: "production",
  buyType: "fixed_cost",
  rate: 0,
  enteredAmount: 300,
  budgetIncludesFees: false,
  clientPaysForMedia: false,
  approval: "approved",
  bursts: [{ startDate: "2026-06-01", endDate: "2026-06-30", budget: 300, buyAmount: 300 }],
  attrs: { media_type: "OOH", description: "Print" },
}

async function wipe(): Promise<void> {
  const db = getDb()
  const masters = await db
    .select({ id: schema.mediaPlanMasters.id, clientId: schema.mediaPlanMasters.clientId })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.mbaNumber, MBA))
  for (const m of masters) {
    await db.update(schema.mediaPlanMasters).set({ publishedVersionId: null }).where(eq(schema.mediaPlanMasters.id, m.id))
    await db.delete(schema.mediaPlanVersions).where(eq(schema.mediaPlanVersions.masterId, m.id))
    await db.delete(schema.mediaPlanMasters).where(eq(schema.mediaPlanMasters.id, m.id))
    if (m.clientId != null) await db.delete(schema.clients).where(eq(schema.clients.id, m.clientId))
  }
}

type Plan = { lines: SavePlanLineItem[]; mbaScope: SavePlanVersionInput["mbaScope"] }

async function saveDraft(masterId: number, plan: Plan, billingOverrides: SavePlanVersionInput["billingOverrides"]) {
  return savePlanVersion({
    masterId,
    mbaNumber: MBA,
    versionNumber: 1,
    mode: "draft",
    campaignName: "M3 override ad serving",
    campaignStatus: "Draft",
    campaignStartDate: "2026-06-01",
    campaignEndDate: "2026-07-31",
    campaignBudgetCents: 200_000,
    channelFlags: { mp_digidisplay: true, mp_search: true },
    lineItems: plan.lines,
    feeLoading: FEES,
    mbaScope: plan.mbaScope,
    billingOverrides,
    // The route builds these from the client row the editor loaded.
    getRateForMediaType: createAdServingRateResolver(RATES),
    adservaudio: RATES.audio,
  })
}

async function storedBlob(versionId: number): Promise<unknown> {
  const [row] = await getDb()
    .select({ blob: schema.mediaPlanVersions.legacySchedules })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
  return row?.blob
}

function adServingTotal(blob: unknown): number {
  const schedule = (blob as { billingSchedule?: Array<{ adservingTechFees?: string }> }).billingSchedule ?? []
  return schedule.reduce((sum, m) => sum + Number(String(m.adservingTechFees ?? "0").replace(/[$,]/g, "")), 0)
}

async function overrideThenResave(plan: Plan, adServing: number, months: Array<{ month: string; amount: number }>) {
  await wipe()
  const db = getDb()
  const [client] = await db
    .insert(schema.clients)
    .values({
      mpClientName: `M3 client ${MBA}`,
      adservdisplay: String(RATES.display),
      adservvideo: String(RATES.video),
      adservaudio: String(RATES.audio),
      adservimp: String(RATES.imp),
    })
    .returning({ id: schema.clients.id })
  const [master] = await db
    .insert(schema.mediaPlanMasters)
    .values({ mbaNumber: MBA, clientId: client!.id, campaignName: "M3 override ad serving", campaignStatus: "Draft", campaignBudgetCents: 200_000 })
    .returning({ id: schema.mediaPlanMasters.id })

  const saved = await saveDraft(master!.id, plan, { authoritative: true, clearedLineIds: [] })
  // A draft has no fee snapshot until publish; the override path reads one (C-423).
  await db.insert(schema.mbaFeeSnapshots).values({ versionId: saved.versionId, fees: FEES })
  assert.equal(adServingTotal(await storedBlob(saved.versionId)), adServing)

  await replaceBillingOverrideLine({
    versionId: saved.versionId,
    mbaNumber: MBA,
    lineItemId: SEARCH,
    component: "media",
    months,
    dateBasis: "m3-fixture",
  })
  const afterOverride = await storedBlob(saved.versionId)
  assert.equal(adServingTotal(afterOverride), adServing, "override write keeps ad serving")

  // Same plan and override rows through savePlan (null envelope keeps the rows).
  await saveDraft(master!.id, plan, null)
  assert.deepEqual(afterOverride, await storedBlob(saved.versionId), "override write stores what a save stores")

  await resetBillingOverrideLine({ versionId: saved.versionId, mbaNumber: MBA, lineItemId: SEARCH, component: "media" })
  const afterReset = await storedBlob(saved.versionId)
  assert.equal(adServingTotal(afterReset), adServing, "reset keeps ad serving")
  await saveDraft(master!.id, plan, null)
  assert.deepEqual(afterReset, await storedBlob(saved.versionId), "reset stores what a save stores")
}

test("an override write keeps ad serving and stores what a save stores", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  t.after(wipe)
  await overrideThenResave({ lines: [...lines, ...rateLines, socialLine, productionLine], mbaScope: { lineItemIds: null, monthYears: null } }, 1770, [
    { month: "2026-06", amount: 1000 },
    { month: "2026-07", amount: 0 },
  ])
})

test("a scoped plan: the override write keeps the stored scope's lines and months", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  t.after(async () => {
    await wipe()
    await closeDb()
  })
  // June only, with a June search line (a save checks overrides against the scoped months): June's ad serving.
  const juneSearch = { ...lines[1]!, bursts: [{ startDate: "2026-06-01", endDate: "2026-06-30", budget: 1000, buyAmount: 1 }] }
  await overrideThenResave({ lines: [lines[0]!, juneSearch], mbaScope: { lineItemIds: null, monthYears: ["June 2026"] } }, 245.9, [
    { month: "2026-06", amount: 1000 },
  ])
  // Display left out of the MBA: no ad serving.
  await overrideThenResave({ lines, mbaScope: { lineItemIds: [SEARCH], monthYears: null } }, 0, [
    { month: "2026-06", amount: 1000 },
    { month: "2026-07", amount: 0 },
  ])
})
