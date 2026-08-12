/**
 * Codex campaign seed plumbing — due dates, Campaign profile, idempotency, past-due flags.
 * No route / UI / create-trigger. DB cases skip when DATABASE_URL unset.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, inArray } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import { listTaskActivity } from "../repo.js"
import {
  CAMPAIGN_PROFILE,
  expandSeedDueDates,
  seedTasksForCampaign,
  SEED_PAST_DUE_FLAG,
} from "../seedTasks.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MIXED = "Luke.Fitzpatrick@AssembledMedia.com.au"
const CLIENT_ID = 900_090_016
const RUN = `seed${Date.now().toString(36)}`
const MBA = `SEED${RUN.slice(-8)}`.toUpperCase()

const taskIds: number[] = []

async function wipe(): Promise<void> {
  if (!hasDb || taskIds.length === 0) return
  const database = getDb()
  await database
    .delete(schema.taskComments)
    .where(inArray(schema.taskComments.taskId, taskIds))
  await database
    .delete(schema.codexActivity)
    .where(
      and(
        eq(schema.codexActivity.entityType, "task"),
        inArray(schema.codexActivity.entityId, taskIds)
      )
    )
  await database.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds))
}

after(async () => {
  try {
    await wipe()
  } finally {
    if (hasDb) await closeDb().catch(() => undefined)
  }
})

describe("expandSeedDueDates — Campaign profile", () => {
  it("resolves start/end offsets in Sydney civil YMD", () => {
    const rows = expandSeedDueDates({
      profile: CAMPAIGN_PROFILE,
      campaignStart: "2026-09-01",
      campaignEnd: "2026-09-30",
    })
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.dueYmd]))
    assert.equal(byLabel["Confirm brief and objectives"], "2026-08-11")
    assert.equal(byLabel["Issue media briefs"], "2026-08-14")
    assert.equal(byLabel["Go-live check"], "2026-09-01")
    assert.equal(byLabel["PCA"], "2026-10-10")
    assert.equal(byLabel["Finance reconciliation"], "2026-10-14")
  })

  it("expands Monthly report to each month end in the flight", () => {
    const rows = expandSeedDueDates({
      profile: CAMPAIGN_PROFILE,
      campaignStart: "2026-03-15",
      campaignEnd: "2026-05-10",
    })
    const monthly = rows.filter((r) => r.label.startsWith("Monthly report"))
    assert.deepEqual(
      monthly.map((r) => ({ label: r.label, due: r.dueYmd })),
      [
        { label: "Monthly report — 2026-03", due: "2026-03-31" },
        { label: "Monthly report — 2026-04", due: "2026-04-30" },
        { label: "Monthly report — 2026-05", due: "2026-05-31" },
      ]
    )
  })

  it("stamps source as profile:<name>", () => {
    const rows = expandSeedDueDates({
      profile: CAMPAIGN_PROFILE,
      campaignStart: "2026-09-01",
      campaignEnd: "2026-09-30",
    })
    assert.ok(rows.every((r) => r.source === "profile:Campaign"))
  })
})

describe("seedTasksForCampaign", { skip: !hasDb }, () => {
  it("creates Campaign tasks once; second seed creates nothing new", async () => {
    const actor = { email: MIXED }
    const args = {
      mbaNumber: MBA,
      clientId: CLIENT_ID,
      campaignStart: "2026-09-01",
      campaignEnd: "2026-09-30",
      profile: CAMPAIGN_PROFILE,
      actor,
      now: new Date("2026-06-01T00:00:00.000Z"),
    }

    const first = await seedTasksForCampaign(args)
    for (const t of first.created) taskIds.push(Number(t.id))

    assert.ok(first.created.length >= 12, "expected full Campaign seed")
    assert.equal(first.skipped.length, 0)
    assert.ok(first.created.every((t) => t.source === "profile:Campaign"))
    assert.ok(first.created.every((t) => t.mba_number === MBA))

    const act = await listTaskActivity(Number(first.created[0]!.id))
    const createRow = act.find((a) => a.action === "create")
    assert.ok(createRow)
    assert.equal(createRow!.actor_kind, "system")

    const second = await seedTasksForCampaign(args)
    assert.equal(second.created.length, 0)
    assert.equal(second.skipped.length, first.created.length)
  })

  it("flags past-due seeds (never skips); reports how many", async () => {
    const mba = `${MBA}P`
    // Seed a week before start: today 2026-08-25, start 2026-09-01 → several start−Nd already past.
    const result = await seedTasksForCampaign({
      mbaNumber: mba,
      clientId: CLIENT_ID,
      campaignStart: "2026-09-01",
      campaignEnd: "2026-09-30",
      profile: CAMPAIGN_PROFILE,
      actor: { email: MIXED },
      now: new Date("2026-08-25T02:00:00.000Z"),
    })
    for (const t of result.created) taskIds.push(Number(t.id))

    assert.ok(result.flaggedPastDue.length >= 3)
    assert.equal(
      result.flaggedPastDue.length,
      result.created.filter((t) =>
        (t.description ?? "").includes(SEED_PAST_DUE_FLAG)
      ).length
    )
    for (const t of result.flaggedPastDue) {
      assert.ok((t.description ?? "").includes(SEED_PAST_DUE_FLAG))
    }
    // Still created — not skipped
    assert.ok(result.created.length > result.flaggedPastDue.length)
  })
})
