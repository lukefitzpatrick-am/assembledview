/**
 * CS-B — campaign status writes the master only; version rows stay byte-identical.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { eq } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  CampaignStatusWriteError,
  writeCampaignStatus,
} from "../writeCampaignStatus.js"
import { savePlanVersion, type SavePlanLineItem } from "../savePlan.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())
const MBA = `csb${Date.now().toString(36)}`
const LINE = `${MBA.toUpperCase()}SEA001`

function baseLine(): SavePlanLineItem {
  return {
    lineItemId: LINE,
    channel: "search",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 1000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 10,
    approval: "approved",
    bursts: [
      {
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        budget: 1000,
        buyAmount: 1,
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
      campaignName: "CS-B status",
      campaignStatus: "planned",
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

async function versionRowsJson(masterId: number): Promise<string> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterId))
  return JSON.stringify(
    rows.toSorted((a, b) => Number(a.id) - Number(b.id))
  )
}

test("writeCampaignStatus: writes master only; version row is byte-identical", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await savePlanVersion({
    masterId,
    mbaNumber: MBA,
    versionNumber: 1,
    mode: "draft",
    campaignName: "CS-B status",
    campaignStatus: "planned",
    campaignStartDate: "2026-05-01",
    campaignEndDate: "2026-05-31",
    campaignBudgetCents: 1_100_00,
    channelFlags: { mp_search: true },
    lineItems: [baseLine()],
    feeLoading: { feesearch: 10 },
    billingOverrides: { authoritative: true, clearedLineIds: [] },
  })

  const beforeVersions = await versionRowsJson(masterId)
  const result = await writeCampaignStatus(MBA, "booked")
  assert.equal(result.status, "booked")

  const db = getDb()
  const [master] = await db
    .select({ campaignStatus: schema.mediaPlanMasters.campaignStatus })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, masterId))
  assert.equal(master?.campaignStatus, "booked")
  assert.equal(await versionRowsJson(masterId), beforeVersions)
})

test("writeCampaignStatus: rejects a value outside SELECTABLE_CAMPAIGN_STATUSES", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  await assert.rejects(
    () => writeCampaignStatus(MBA, "draft"),
    (err: unknown) =>
      err instanceof CampaignStatusWriteError && err.code === "INVALID_STATUS"
  )
  await assert.rejects(
    () => writeCampaignStatus(MBA, "completed"),
    (err: unknown) =>
      err instanceof CampaignStatusWriteError && err.code === "INVALID_STATUS"
  )
  await assert.rejects(
    () => writeCampaignStatus(MBA, "live"),
    (err: unknown) =>
      err instanceof CampaignStatusWriteError && err.code === "INVALID_STATUS"
  )
})

test("writeCampaignStatus: close db pool", async () => {
  if (hasDb) await closeDb()
})
