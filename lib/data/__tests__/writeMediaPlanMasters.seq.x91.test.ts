/**
 * X9.1 — sequence sync must advance, never rewind.
 * When last_value is ahead of MAX(id), sync must leave the sequence alone;
 * deleting the newest row must not make the next insert reuse that id.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { eq, sql } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  createMediaPlanMasterPostgresFirst,
  syncMediaPlanMastersIdSequence,
} from "../writeMediaPlanMasters"
import { syncClientsIdSequence } from "../writeClients"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

async function readMastersSeqState(): Promise<{ maxId: number; lastValue: number }> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT
      COALESCE((SELECT MAX(id)::bigint FROM media_plan_masters), 0) AS max_id,
      (SELECT last_value FROM media_plan_masters_id_seq) AS seq_last
  `)
  const row = (rows as unknown as { max_id: string; seq_last: string }[])[0]!
  return { maxId: Number(row.max_id), lastValue: Number(row.seq_last) }
}

async function readClientsSeqState(): Promise<{ maxId: number; lastValue: number }> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT
      COALESCE((SELECT MAX(id)::bigint FROM clients), 0) AS max_id,
      (SELECT last_value FROM clients_id_seq) AS seq_last
  `)
  const row = (rows as unknown as { max_id: string; seq_last: string }[])[0]!
  return { maxId: Number(row.max_id), lastValue: Number(row.seq_last) }
}

describe("X9.1 sequence sync never rewinds", () => {
  const createdMasterIds: number[] = []

  after(async () => {
    if (!hasDb) return
    const db = getDb()
    for (const id of createdMasterIds) {
      await db
        .update(schema.mediaPlanMasters)
        .set({ publishedVersionId: null })
        .where(eq(schema.mediaPlanMasters.id, id))
      await db
        .delete(schema.mediaPlanVersions)
        .where(eq(schema.mediaPlanVersions.masterId, id))
      await db.delete(schema.mediaPlanMasters).where(eq(schema.mediaPlanMasters.id, id))
    }
    await closeDb()
  })

  it("syncMediaPlanMastersIdSequence does not move when seq is ahead of MAX(id)", async (t) => {
    if (!hasDb) {
      t.skip("DATABASE_URL unset")
      return
    }
    const db = getDb()
    const before = await readMastersSeqState()
    const restoreTo = Math.max(before.lastValue, before.maxId)
    // Force a gap: sequence ahead of max(id) (the rewind hazard X9.1 fixes).
    const ahead = restoreTo + 500
    await db.execute(sql`
      SELECT setval('media_plan_masters_id_seq', ${ahead}, true)
    `)
    const bumped = await readMastersSeqState()
    assert.equal(bumped.lastValue, ahead)
    assert.ok(bumped.lastValue > bumped.maxId)

    try {
      await syncMediaPlanMastersIdSequence()

      const after = await readMastersSeqState()
      assert.equal(
        after.lastValue,
        bumped.lastValue,
        `X9.1: sync must not rewind seq (was ${bumped.lastValue}, now ${after.lastValue}, max=${after.maxId})`
      )
    } finally {
      // Undo test bump only — do not invent a new high-water mark for Luke.
      await db.execute(sql`
        SELECT setval('media_plan_masters_id_seq', ${restoreTo}, true)
      `)
    }
  })

  it("syncClientsIdSequence does not move when seq is ahead of MAX(id)", async (t) => {
    if (!hasDb) {
      t.skip("DATABASE_URL unset")
      return
    }
    const db = getDb()
    const before = await readClientsSeqState()
    const restoreTo = Math.max(before.lastValue, before.maxId)
    const ahead = restoreTo + 500
    await db.execute(sql`
      SELECT setval('clients_id_seq', ${ahead}, true)
    `)
    const bumped = await readClientsSeqState()
    assert.equal(bumped.lastValue, ahead)

    try {
      await syncClientsIdSequence()

      const after = await readClientsSeqState()
      assert.equal(
        after.lastValue,
        bumped.lastValue,
        `X9.1: clients sync must not rewind (was ${bumped.lastValue}, now ${after.lastValue})`
      )
    } finally {
      await db.execute(sql`
        SELECT setval('clients_id_seq', ${restoreTo}, true)
      `)
    }
  })

  it("after deleting newest master, next create does not reuse that id", async (t) => {
    if (!hasDb) {
      t.skip("DATABASE_URL unset")
      return
    }
    const mbaA = `x91a${Date.now().toString(36).slice(-6)}`
    const mbaB = `x91b${Date.now().toString(36).slice(-6)}`

    const first = await createMediaPlanMasterPostgresFirst({
      mbaNumber: mbaA,
      mpClientName: "X9.1 Seq Client",
      campaignName: "X9.1 First",
      campaignStatus: "Draft",
    })
    const firstId = Number(first.master.id)
    createdMasterIds.push(firstId)
    assert.ok(firstId > 0)

    const db = getDb()
    await db
      .update(schema.mediaPlanMasters)
      .set({ publishedVersionId: null })
      .where(eq(schema.mediaPlanMasters.id, firstId))
    await db
      .delete(schema.mediaPlanVersions)
      .where(eq(schema.mediaPlanVersions.masterId, firstId))
    await db.delete(schema.mediaPlanMasters).where(eq(schema.mediaPlanMasters.id, firstId))
    createdMasterIds.splice(createdMasterIds.indexOf(firstId), 1)

    const second = await createMediaPlanMasterPostgresFirst({
      mbaNumber: mbaB,
      mpClientName: "X9.1 Seq Client",
      campaignName: "X9.1 Second",
      campaignStatus: "Draft",
    })
    const secondId = Number(second.master.id)
    createdMasterIds.push(secondId)

    assert.notEqual(
      secondId,
      firstId,
      `X9.1: must not reuse deleted id ${firstId}; got ${secondId}`
    )
    assert.ok(
      secondId > firstId,
      `expected next id > deleted ${firstId}, got ${secondId}`
    )
  })
})
