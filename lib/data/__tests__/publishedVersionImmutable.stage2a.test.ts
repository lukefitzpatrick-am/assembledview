/**
 * VC Stage 2a — published versions immutable at the persistence layer.
 * Guards: savePlan draft overwrite + patchBillingScheduleOnPostgres.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { eq } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  assertVersionMutable,
  VersionImmutableError,
} from "@/lib/mediaplan/assertVersionMutable.js"
import {
  BillingScheduleWriteError,
  patchBillingScheduleOnPostgres,
} from "../writeBillingSchedule.js"
import {
  SavePlanError,
  savePlanVersion,
  type SavePlanLineItem,
  type SavePlanVersionInput,
} from "../savePlan.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MBA = `vc2a${Date.now().toString(36)}`
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

async function seedMaster(campaignName = "VC2a unpublished draft"): Promise<number> {
  const db = getDb()
  const [row] = await db
    .insert(schema.mediaPlanMasters)
    .values({
      mbaNumber: MBA,
      campaignName,
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
    campaignName: "VC2a unpublished draft",
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

async function snapshotVersionContents(versionId: number) {
  const db = getDb()
  const [version] = await db
    .select({
      id: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      campaignName: schema.mediaPlanVersions.campaignName,
      publishedAt: schema.mediaPlanVersions.publishedAt,
      snapshotChecksum: schema.mediaPlanVersions.snapshotChecksum,
      approvedSlice: schema.mediaPlanVersions.approvedSlice,
      legacySchedules: schema.mediaPlanVersions.legacySchedules,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
  const lines = await db
    .select({
      lineItemId: schema.lineItems.lineItemId,
      bursts: schema.lineItems.bursts,
    })
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, versionId))
  const months = await db
    .select({
      lineItemId: schema.scheduleMonths.lineItemId,
      component: schema.scheduleMonths.component,
      basis: schema.scheduleMonths.basis,
      month: schema.scheduleMonths.month,
      amountCents: schema.scheduleMonths.amountCents,
      source: schema.scheduleMonths.source,
    })
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, versionId))
  return {
    version,
    lineCount: lines.length,
    monthCount: months.length,
    linesJson: JSON.stringify(
      lines
        .map((r) => ({
          lineItemId: r.lineItemId,
          bursts: r.bursts,
        }))
        .sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
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
    checksum: String(version?.snapshotChecksum ?? ""),
    approvedSliceJson: JSON.stringify(version?.approvedSlice ?? null),
    legacyJson: JSON.stringify(version?.legacySchedules ?? null),
    campaignName: String(version?.campaignName ?? ""),
  }
}

test("VC2a: assertVersionMutable throws on published, passes on unpublished", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const draft = await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  await assertVersionMutable(draft.versionId)

  const published = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    campaignStatus: "booked",
    feeSnapshot: { feesearch: 10 },
  })
  await assert.rejects(
    () => assertVersionMutable(published.versionId),
    (err: unknown) =>
      err instanceof VersionImmutableError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE" &&
      err.message.includes(String(published.versionId)) &&
      err.message.includes(`v${published.versionNumber}`)
  )
})
test("VC2a: published → draft overwrite throws; line_items/schedule/checksum unchanged", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const published = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    campaignStatus: "booked",
    feeSnapshot: { feesearch: 10 },
  })
  const before = await snapshotVersionContents(published.versionId)
  assert.ok(before.checksum.length >= 16)
  assert.ok(before.lineCount > 0)
  assert.ok(before.monthCount > 0)

  await assert.rejects(
    () =>
      savePlanVersion(
        draftInput(masterId, [baseLine(LINE_A, 9999)], {
          versionNumber: published.versionNumber,
          campaignName: "MUST NOT LAND",
        })
      ),
    (err: unknown) =>
      err instanceof SavePlanError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE"
  )

  const after = await snapshotVersionContents(published.versionId)
  assert.equal(after.checksum, before.checksum)
  assert.equal(after.linesJson, before.linesJson)
  assert.equal(after.monthsJson, before.monthsJson)
  assert.equal(after.approvedSliceJson, before.approvedSliceJson)
  assert.equal(after.legacyJson, before.legacyJson)
  assert.equal(after.campaignName, before.campaignName)
  assert.equal(after.lineCount, before.lineCount)
  assert.equal(after.monthCount, before.monthCount)
})

test("VC2a: published → patchBillingSchedule throws; months/legacy unchanged", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const published = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    campaignStatus: "booked",
    feeSnapshot: { feesearch: 10 },
  })
  const before = await snapshotVersionContents(published.versionId)
  const billingSchedule = (
    before.version?.legacySchedules as { billingSchedule?: unknown } | null
  )?.billingSchedule
  assert.ok(billingSchedule)

  await assert.rejects(
    () =>
      patchBillingScheduleOnPostgres({
        versionId: published.versionId,
        billingSchedule,
      }),
    (err: unknown) =>
      err instanceof BillingScheduleWriteError &&
      err.code === "VERSION_PUBLISHED_IMMUTABLE" &&
      err.message.includes(String(published.versionId))
  )

  const after = await snapshotVersionContents(published.versionId)
  assert.equal(after.monthsJson, before.monthsJson)
  assert.equal(after.legacyJson, before.legacyJson)
  assert.equal(after.checksum, before.checksum)
})

test("VC2a: unpublished draft (mirrors live unpublished tips) stays fully writable", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  // Mirrors the ~145 unpublished draft tips: published_at null, status Draft,
  // in-place overwrite of version 1 must succeed (save-mode still routes here).
  const masterId = await seedMaster("Unpublished draft tip fixture")
  t.after(async () => {
    await wipeMba()
  })

  const first = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1000)], {
      campaignName: "Unpublished draft tip fixture",
    })
  )
  assert.equal(first.published, false)
  const mid = await snapshotVersionContents(first.versionId)
  assert.equal(mid.version?.publishedAt, null)

  const second = await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1500)], {
      campaignName: "Unpublished draft tip — re-save",
      versionNumber: 1,
    })
  )
  assert.equal(second.versionId, first.versionId)
  assert.equal(second.published, false)

  const afterDraft = await snapshotVersionContents(first.versionId)
  assert.equal(afterDraft.campaignName, "Unpublished draft tip — re-save")
  assert.equal(afterDraft.version?.publishedAt, null)
  assert.ok(afterDraft.lineCount > 0)
  assert.ok(afterDraft.monthCount > 0)
  assert.notEqual(afterDraft.linesJson, mid.linesJson)

  const patched = await patchBillingScheduleOnPostgres({
    versionId: first.versionId,
    billingSchedule: (
      afterDraft.version?.legacySchedules as { billingSchedule?: unknown }
    )?.billingSchedule,
  })
  assert.equal(patched.ok, true)
  assert.equal(patched.versionId, first.versionId)
})

test("VC2a close db pool", async () => {
  if (hasDb) await closeDb()
})
