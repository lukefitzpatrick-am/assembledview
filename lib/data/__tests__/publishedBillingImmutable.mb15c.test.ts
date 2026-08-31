/**
 * MB-15c — published versions are immutable to billing writers.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { eq } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  BillingOverrideWriteError,
  replaceBillingOverrideLine,
  resetBillingOverrideLine,
} from "../writeBillingOverrides.js"
import { writeCampaignStatus } from "../writeCampaignStatus.js"
import {
  savePlanVersion,
  type SavePlanLineItem,
  type SavePlanVersionInput,
} from "../savePlan.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MBA = `mb15c${Date.now().toString(36)}`
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
      campaignName: "MB-15c published immutable",
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
    campaignName: "MB-15c published immutable",
    campaignStatus: "Draft",
    campaignStartDate: "2026-06-01",
    campaignEndDate: "2026-07-31",
    campaignBudgetCents: 1_100_00,
    channelFlags: { mp_search: true },
    lineItems: lines,
    feeLoading: { feesearch: 10 },
    billingOverrides: { authoritative: true, clearedLineIds: [] },
    ...extra,
  }
}

async function snapshotBillingState(versionId: number) {
  const db = getDb()
  const [version] = await db
    .select({
      snapshotChecksum: schema.mediaPlanVersions.snapshotChecksum,
      campaignStatus: schema.mediaPlanVersions.campaignStatus,
      versionNumber: schema.mediaPlanVersions.versionNumber,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
  const overrides = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, versionId))
  const months = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, versionId))
  return {
    checksum: String(version?.snapshotChecksum ?? ""),
    status: String(version?.campaignStatus ?? ""),
    versionNumber: Number(version?.versionNumber ?? 0),
    overridesJson: JSON.stringify(
      overrides
        .map((r) => ({
          lineItemId: r.lineItemId,
          component: r.component,
          months: r.months,
          reason: r.reason,
          dateBasis: r.dateBasis,
        }))
        .sort((a, b) =>
          `${a.lineItemId}|${a.component}`.localeCompare(
            `${b.lineItemId}|${b.component}`
          )
        )
    ),
    monthsJson: JSON.stringify(
      months
        .map((r) => ({
          lineItemId: r.lineItemId,
          component: r.component,
          basis: r.basis,
          month: String(r.month).slice(0, 10),
          amountCents: Number(r.amountCents),
          source: r.source,
        }))
        .sort((a, b) =>
          `${a.basis}|${a.lineItemId}|${a.component}|${a.month}`.localeCompare(
            `${b.basis}|${b.lineItemId}|${b.component}|${b.month}`
          )
        )
    ),
  }
}

test("MB-15c (i): replace_line against published version → VERSION_PUBLISHED_IMMUTABLE, nothing written", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = baseLine(LINE_A, 1000)
  // CS-B: stamp master so publish INSERT snapshots approved onto the version.
  // Gates still read version.campaign_status until CS-C.
  await writeCampaignStatus(MBA, "approved")
  const published = await savePlanVersion({
    ...draftInput(masterId, [line]),
    mode: "publish",
    feeSnapshot: { feesearch: 10 },
  })
  assert.equal(published.published, true)

  const before = await snapshotBillingState(published.versionId)
  assert.ok(before.checksum.length >= 16)
  assert.equal(before.overridesJson, "[]")

  await assert.rejects(
    () =>
      replaceBillingOverrideLine({
        versionId: published.versionId,
        mbaNumber: MBA,
        lineItemId: LINE_A,
        component: "media",
        mode: "manual",
        reason: "manual",
        months: [
          { month: "2026-06", amount: 1000 },
          { month: "2026-07", amount: 0 },
        ],
        dateBasis: "mb15c-approved",
      }),
    (err: unknown) =>
      err instanceof BillingOverrideWriteError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE" &&
      err.message.includes(String(published.versionId)) &&
      err.message.includes(`v${published.versionNumber}`) &&
      /approved/i.test(err.message)
  )

  await assert.rejects(
    () =>
      resetBillingOverrideLine({
        versionId: published.versionId,
        mbaNumber: MBA,
        lineItemId: LINE_A,
      }),
    (err: unknown) =>
      err instanceof BillingOverrideWriteError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE"
  )

  const after = await snapshotBillingState(published.versionId)
  assert.equal(after.checksum, before.checksum)
  assert.equal(after.overridesJson, before.overridesJson)
  assert.equal(after.monthsJson, before.monthsJson)
})

test("MB-15c (ii): same replace_line against an unpublished version succeeds", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = baseLine(LINE_A, 1000)
  const draft = await savePlanVersion(draftInput(masterId, [line]))
  assert.equal(draft.published, false)

  await replaceBillingOverrideLine({
    versionId: draft.versionId,
    mbaNumber: MBA,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "manual",
    months: [
      { month: "2026-06", amount: 1000 },
      { month: "2026-07", amount: 0 },
    ],
    dateBasis: "mb15c-draft",
  })

  const db = getDb()
  const overrides = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, draft.versionId))
  assert.equal(overrides.length, 1)
  assert.equal(overrides[0]!.component, "media")
})

test("VC1-3: published + status 'draft' -> downloads allowed, docs generate, billing MUTABLE", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = baseLine(LINE_A, 1000)
  const published = await savePlanVersion({
    ...draftInput(masterId, [line]),
    mode: "publish",
    campaignStatus: "draft",
    feeSnapshot: { feesearch: 10 },
  })
  assert.equal(published.published, true)

  await replaceBillingOverrideLine({
    versionId: published.versionId,
    mbaNumber: MBA,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "manual",
    months: [
      { month: "2026-06", amount: 1000 },
      { month: "2026-07", amount: 0 },
    ],
    dateBasis: "vc13-published-draft-mutable",
  })

  const db = getDb()
  const overrides = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, published.versionId))
  assert.equal(overrides.length, 1)
})

test("VC1-3: published + status 'planned' -> downloads allowed, docs generate, billing MUTABLE", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = baseLine(LINE_A, 1000)
  const published = await savePlanVersion({
    ...draftInput(masterId, [line]),
    mode: "publish",
    campaignStatus: "planned",
    feeSnapshot: { feesearch: 10 },
  })
  assert.equal(published.published, true)

  await replaceBillingOverrideLine({
    versionId: published.versionId,
    mbaNumber: MBA,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "manual",
    months: [
      { month: "2026-06", amount: 1000 },
      { month: "2026-07", amount: 0 },
    ],
    dateBasis: "vc13-published-planned-mutable",
  })

  const db = getDb()
  const overrides = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, published.versionId))
  assert.equal(overrides.length, 1)
})

test("VC1-3: published + status 'approved' -> downloads allowed, docs generate, billing IMMUTABLE", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = baseLine(LINE_A, 1000)
  await writeCampaignStatus(MBA, "approved")
  const published = await savePlanVersion({
    ...draftInput(masterId, [line]),
    mode: "publish",
    feeSnapshot: { feesearch: 10 },
  })
  assert.equal(published.published, true)

  await assert.rejects(
    () =>
      replaceBillingOverrideLine({
        versionId: published.versionId,
        mbaNumber: MBA,
        lineItemId: LINE_A,
        component: "media",
        mode: "manual",
        reason: "manual",
        months: [
          { month: "2026-06", amount: 1000 },
          { month: "2026-07", amount: 0 },
        ],
        dateBasis: "vc13-published-approved-immutable",
      }),
    (err: unknown) =>
      err instanceof BillingOverrideWriteError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE"
  )
})

test("VC1-3: unpublished (draft) -> downloads refused, docs skipped, billing MUTABLE, save OVERWRITES in place", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = baseLine(LINE_A, 1000)
  const draft = await savePlanVersion({
    ...draftInput(masterId, [line]),
    campaignStatus: "draft",
  })
  assert.equal(draft.published, false)

  await replaceBillingOverrideLine({
    versionId: draft.versionId,
    mbaNumber: MBA,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "manual",
    months: [
      { month: "2026-06", amount: 1000 },
      { month: "2026-07", amount: 0 },
    ],
    dateBasis: "vc13-unpublished-draft-mutable",
  })

  const db = getDb()
  const overrides = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, draft.versionId))
  assert.equal(overrides.length, 1)
})

test("MB-15c (iii): publish then attempt — refused; published version byte-identical", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const line = baseLine(LINE_A, 1000)
  // MB-22: override must ride the save payload (REPLACE-SET). An intermediate
  // draft/publish save with a bare line would wipe a DB-only override before
  // the immutability reject can run.
  const billingOverride = {
    mode: "manual" as const,
    reason: "prepayment" as const,
    dateBasis: "mb15c-before-publish",
    months: [
      { month: "2026-06", amount: 1000 },
      { month: "2026-07", amount: 0 },
    ],
  }
  const lineWithOverride = baseLine(LINE_A, 1000, { billingOverride })

  const draft = await savePlanVersion(draftInput(masterId, [line]))
  await replaceBillingOverrideLine({
    versionId: draft.versionId,
    mbaNumber: MBA,
    lineItemId: LINE_A,
    component: "media",
    mode: "manual",
    reason: "prepayment",
    months: billingOverride.months,
    dateBasis: billingOverride.dateBasis,
  })
  await savePlanVersion(draftInput(masterId, [lineWithOverride]))

  await writeCampaignStatus(MBA, "booked")
  const published = await savePlanVersion({
    ...draftInput(masterId, [lineWithOverride]),
    mode: "publish",
    feeSnapshot: { feesearch: 10 },
  })
  assert.equal(published.published, true)
  assert.equal(published.versionNumber, 2)

  const before = await snapshotBillingState(published.versionId)
  assert.ok(before.checksum.length >= 16)
  // Precondition: published version still carries the override — otherwise the
  // reject below would be vacuous (nothing left to illegally mutate).
  assert.notEqual(before.overridesJson, "[]")

  await assert.rejects(
    () =>
      replaceBillingOverrideLine({
        versionId: published.versionId,
        mbaNumber: MBA,
        lineItemId: LINE_A,
        component: "media",
        mode: "manual",
        reason: "manual",
        months: [
          { month: "2026-06", amount: 0 },
          { month: "2026-07", amount: 1000 },
        ],
        dateBasis: "mb15c-after-publish",
      }),
    (err: unknown) =>
      err instanceof BillingOverrideWriteError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE" &&
      /booked/i.test(err.message)
  )

  await assert.rejects(
    () =>
      resetBillingOverrideLine({
        versionId: published.versionId,
        mbaNumber: MBA,
        lineItemId: LINE_A,
      }),
    (err: unknown) =>
      err instanceof BillingOverrideWriteError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE"
  )

  const after = await snapshotBillingState(published.versionId)
  assert.equal(after.checksum, before.checksum, "snapshot_checksum unchanged")
  assert.equal(after.overridesJson, before.overridesJson, "billing_overrides unchanged")
  assert.equal(after.monthsJson, before.monthsJson, "schedule_months unchanged")
})

test("MB-15c close db pool", async () => {
  if (hasDb) await closeDb()
})
