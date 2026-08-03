/**
 * X9 live create: PG sequence id + uniqueness + draft save without
 * MASTER_NOT_FOUND / ensureMaster insert. Mirror is best-effort.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { eq, sql } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import { SavePlanError, savePlanVersion } from "../savePlan"
import {
  createMediaPlanMasterPostgresFirst,
  findExistingMasterByMbaNumberPostgres,
  syncMediaPlanMastersIdSequence,
} from "../writeMediaPlanMasters"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())
const MBA = `x9seq${Date.now().toString(36).slice(-6)}`
const LINE = `${MBA.toUpperCase()}SEA001`

describe("X9 createMediaPlanMasterPostgresFirst", () => {
  let createdId: number | null = null

  after(async () => {
    if (!hasDb || createdId == null) return
    const db = getDb()
    await db
      .update(schema.mediaPlanMasters)
      .set({ publishedVersionId: null })
      .where(eq(schema.mediaPlanMasters.id, createdId))
    await db
      .delete(schema.mediaPlanVersions)
      .where(eq(schema.mediaPlanVersions.masterId, createdId))
    await db
      .delete(schema.mediaPlanMasters)
      .where(eq(schema.mediaPlanMasters.id, createdId))
  })

  it("allocates id from media_plan_masters_id_seq past max(id)", async (t) => {
    if (!hasDb) {
      t.skip("DATABASE_URL unset")
      return
    }
    const db = getDb()
    // Post-ETL only: advance if behind. Must not rewind when ahead (X9.1).
    await syncMediaPlanMastersIdSequence()
    const before = await db.execute(sql`
      SELECT
        (SELECT max(id)::bigint FROM media_plan_masters) AS max_id,
        (SELECT last_value FROM media_plan_masters_id_seq) AS seq_last
    `)
    const beforeRow = (before as unknown as { max_id: string; seq_last: string }[])[0]!
    const maxBefore = Number(beforeRow.max_id)

    const { master, mirror } = await createMediaPlanMasterPostgresFirst({
      mbaNumber: MBA,
      mpClientName: "X9 Seq Test Client",
      campaignName: "X9 Seq Campaign",
      campaignStatus: "Draft",
      campaignStartDate: "2026-07-01",
      campaignEndDate: "2026-08-31",
      campaignBudget: 1000,
    })

    createdId = Number(master.id)
    assert.ok(Number.isFinite(createdId) && createdId! > 0)
    assert.ok(
      createdId! > maxBefore,
      `expected sequence id > max(${maxBefore}), got ${createdId}`
    )
    assert.equal(master.mba_number, MBA)
    assert.equal(master.version_number, 1)
    assert.ok(mirror === "ok" || mirror === "failed")

    const found = await findExistingMasterByMbaNumberPostgres(MBA)
    assert.equal(found?.id, createdId)

    const [row] = await db
      .select()
      .from(schema.mediaPlanMasters)
      .where(eq(schema.mediaPlanMasters.id, createdId!))
      .limit(1)
    assert.ok(row)
    assert.equal(row!.mbaNumber, MBA)
  })

  it("pre-check finds the created MBA (case-insensitive)", async (t) => {
    if (!hasDb || createdId == null) {
      t.skip("DATABASE_URL unset or prior create failed")
      return
    }
    const hit = await findExistingMasterByMbaNumberPostgres(MBA.toUpperCase())
    assert.equal(hit?.id, createdId)
  })

  it("draft savePlanVersion against the new master (no MASTER_NOT_FOUND)", async (t) => {
    if (!hasDb || createdId == null) {
      t.skip("DATABASE_URL unset or prior create failed")
      return
    }
    try {
      const result = await savePlanVersion({
        masterId: createdId!,
        mbaNumber: MBA,
        versionNumber: 1,
        mode: "draft",
        campaignName: "X9 Seq Campaign",
        campaignStatus: "draft",
        campaignStartDate: "2026-07-01",
        campaignEndDate: "2026-08-31",
        campaignBudgetCents: 110_000,
        feeLoading: { feesearch: 10 },
        lineItems: [
          {
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
                startDate: "2026-07-01",
                endDate: "2026-07-31",
                budget: 1000,
                buyAmount: 1,
              },
            ],
            attrs: {},
          },
        ],
      })
      assert.ok(result.versionId > 0)
      assert.equal(result.versionNumber, 1)
      assert.ok(result.lineCount >= 1)
    } catch (err) {
      if (err instanceof SavePlanError) {
        assert.notEqual(err.code, "MASTER_NOT_FOUND", err.message)
      }
      throw err
    }
  })

  it("close db pool", async () => {
    if (hasDb) await closeDb()
  })
})
