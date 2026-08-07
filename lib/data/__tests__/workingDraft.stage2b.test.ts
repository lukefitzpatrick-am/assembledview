/**
 * VC Stage 2b — save on published tip writes working draft; unpublished tip
 * still overwrites in place; publish cuts + clears draft.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { eq, sql } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  savePlanVersion,
  type SavePlanLineItem,
  type SavePlanVersionInput,
} from "../savePlan.js"
import {
  deleteWorkingDraft,
  getWorkingDraft,
  upsertWorkingDraft,
} from "@/lib/mediaplan/drafts/serverStore.js"
import { summarizeDraftOffer } from "@/lib/mediaplan/drafts/pill.js"
import { resolvePostgresSaveMode } from "@/lib/mediaplan/resolvePostgresSaveMode.js"
import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MBA = `vc2b${Date.now().toString(36)}`
const LINE_A = `${MBA.toUpperCase()}SEA001`
const USER = `vc2b-user@example.com`

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
      campaignName: "VC2b working draft",
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
    await db.execute(sql`
      DELETE FROM plan_working_drafts WHERE master_id = ${m.id}
    `).catch(() => undefined)
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
    campaignName: "VC2b working draft",
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

function sampleDraftState(masterId: number, versionId: number): PlanDraftStateV1 {
  return {
    v: 1,
    mbaNumber: MBA,
    masterId,
    baseVersionId: versionId,
    formValues: { mp_campaignname: "edited in draft", mp_campaignbudget: 9999 },
    channels: {
      search: [{ line_item_id: LINE_A, lineItemId: LINE_A }],
    },
    meta: {
      lineCount: 1,
      budgetCents: 999_900,
      tipBudgetCents: 110_000,
      tipLineIds: [LINE_A],
    },
  }
}

async function versionFingerprint(versionId: number) {
  const db = getDb()
  const [version] = await db
    .select({
      campaignName: schema.mediaPlanVersions.campaignName,
      snapshotChecksum: schema.mediaPlanVersions.snapshotChecksum,
      publishedAt: schema.mediaPlanVersions.publishedAt,
      versionNumber: schema.mediaPlanVersions.versionNumber,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
  const lines = await db
    .select({ lineItemId: schema.lineItems.lineItemId })
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, versionId))
  return {
    campaignName: String(version?.campaignName ?? ""),
    checksum: String(version?.snapshotChecksum ?? ""),
    publishedAt: version?.publishedAt ? String(version.publishedAt) : null,
    versionNumber: Number(version?.versionNumber ?? 0),
    lineIds: lines.map((l) => l.lineItemId).sort().join(","),
  }
}

async function countVersions(masterId: number): Promise<number> {
  const db = getDb()
  const rows = await db
    .select({ id: schema.mediaPlanVersions.id })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterId))
  return rows.length
}

test("VC2b resolver: published save → working_draft; unpublished → overwrite; publish intent → increment", () => {
  assert.deepEqual(
    resolvePostgresSaveMode({
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-01-01T00:00:00.000Z",
    }),
    { mode: null, versionNumber: 1, uiMode: "working_draft" }
  )
  assert.deepEqual(
    resolvePostgresSaveMode({
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: null,
    }),
    { mode: "draft", versionNumber: 1, uiMode: "overwrite" }
  )
  assert.deepEqual(
    resolvePostgresSaveMode({
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-01-01T00:00:00.000Z",
      intent: "publish",
    }),
    { mode: "publish", versionNumber: 2, uiMode: "increment" }
  )
})

test("VC2b: save on published → working draft row; version checksum byte-identical; no new version", async (t) => {
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
  const before = await versionFingerprint(published.versionId)
  assert.ok(before.checksum.length >= 16)
  const versionsBefore = await countVersions(masterId)

  const mode = resolvePostgresSaveMode({
    forceIncrement: false,
    publishedVersionNumber: published.versionNumber,
    versionRowCount: versionsBefore,
    tipPublishedAt: before.publishedAt,
  })
  assert.equal(mode.uiMode, "working_draft")

  const row = await upsertWorkingDraft({
    masterId,
    userId: USER,
    userLabel: "VC2b",
    baseVersionId: published.versionId,
    state: sampleDraftState(masterId, published.versionId),
  })
  assert.ok(row)

  const after = await versionFingerprint(published.versionId)
  assert.equal(after.checksum, before.checksum)
  assert.equal(after.campaignName, before.campaignName)
  assert.equal(after.lineIds, before.lineIds)
  assert.equal(after.publishedAt, before.publishedAt)
  assert.equal(await countVersions(masterId), versionsBefore)

  const stored = await getWorkingDraft({ masterId, userId: USER })
  assert.ok(stored)
  assert.equal(stored!.masterId, masterId)
  assert.equal(
    (stored!.draftStateJson.formValues as { mp_campaignname?: string }).mp_campaignname,
    "edited in draft"
  )
})

test("VC2b: save on unpublished tip → overwrite in place; no draft row; no new version", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const tip = await savePlanVersion(draftInput(masterId, [baseLine(LINE_A, 1000)]))
  const versionsBefore = await countVersions(masterId)
  assert.equal(
    resolvePostgresSaveMode({
      forceIncrement: false,
      publishedVersionNumber: tip.versionNumber,
      versionRowCount: versionsBefore,
      tipPublishedAt: null,
    }).uiMode,
    "overwrite"
  )

  await savePlanVersion(
    draftInput(masterId, [baseLine(LINE_A, 1500)], {
      versionNumber: tip.versionNumber,
      campaignName: "VC2b overwritten tip",
    })
  )

  const after = await versionFingerprint(tip.versionId)
  assert.equal(after.campaignName, "VC2b overwritten tip")
  assert.equal(await countVersions(masterId), versionsBefore)
  assert.equal(await getWorkingDraft({ masterId, userId: USER }), null)
})

test("VC2b: publish → version cut, published_at stamped, working draft deleted", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set")
    return
  }
  await wipeMba()
  const masterId = await seedMaster()
  t.after(async () => {
    await wipeMba()
  })

  const v1 = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1000)]),
    mode: "publish",
    campaignStatus: "booked",
    feeSnapshot: { feesearch: 10 },
  })
  await upsertWorkingDraft({
    masterId,
    userId: USER,
    userLabel: "VC2b",
    baseVersionId: v1.versionId,
    state: sampleDraftState(masterId, v1.versionId),
  })
  assert.ok(await getWorkingDraft({ masterId, userId: USER }))

  const v2 = await savePlanVersion({
    ...draftInput(masterId, [baseLine(LINE_A, 1200)]),
    mode: "publish",
    campaignStatus: "booked",
    feeSnapshot: { feesearch: 10 },
  })
  assert.equal(v2.versionNumber, v1.versionNumber + 1)
  const fp = await versionFingerprint(v2.versionId)
  assert.ok(fp.publishedAt)
  assert.ok(fp.checksum.length >= 16)

  // Reuse the same deleteWorkingDraft path the save route calls after publish.
  await deleteWorkingDraft({ masterId, userId: USER })
  assert.equal(await getWorkingDraft({ masterId, userId: USER }), null)
})

test("VC2b: load with working draft → offer returned, nothing auto-applied", async (t) => {
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
  const before = await versionFingerprint(published.versionId)
  const stored = await upsertWorkingDraft({
    masterId,
    userId: USER,
    userLabel: "VC2b",
    baseVersionId: published.versionId,
    state: sampleDraftState(masterId, published.versionId),
  })
  assert.ok(stored)

  const offer = summarizeDraftOffer({
    updatedAt: stored!.updatedAt,
    linesChanged: 1,
    budgetDeltaDollars: 8899,
  })
  assert.match(offer, /Draft from/)
  assert.match(offer, /Resume · Compare · Discard/)

  // Offer only — tip unchanged (nothing auto-applied).
  const after = await versionFingerprint(published.versionId)
  assert.equal(after.checksum, before.checksum)
  assert.equal(after.campaignName, before.campaignName)
})

test("VC2b: discard → draft row gone, version row untouched", async (t) => {
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
  const before = await versionFingerprint(published.versionId)
  await upsertWorkingDraft({
    masterId,
    userId: USER,
    userLabel: "VC2b",
    baseVersionId: published.versionId,
    state: sampleDraftState(masterId, published.versionId),
  })
  await deleteWorkingDraft({ masterId, userId: USER })
  assert.equal(await getWorkingDraft({ masterId, userId: USER }), null)

  const after = await versionFingerprint(published.versionId)
  assert.equal(after.checksum, before.checksum)
  assert.equal(after.campaignName, before.campaignName)
  assert.equal(after.lineIds, before.lineIds)
})

test("VC2b close db pool", async () => {
  if (hasDb) await closeDb()
})
