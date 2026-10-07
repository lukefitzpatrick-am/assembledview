/**
 * expireStaleProposals against Postgres. Skips when DATABASE_URL is unset.
 * The update matches every stale proposed row, so the test runs inside a
 * transaction and rolls it back — including any live rows the statement touches.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { inArray, sql } from "drizzle-orm"

import { closeDb, getDb, schema, type Db } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import { expireStaleProposals } from "../proposalRepo.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())
const RUN = `expire21-${Date.now().toString(36)}`

after(async () => {
  if (hasDb) await closeDb()
})
const NOW = new Date("2026-10-06T00:00:00.000Z")

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe("expireStaleProposals", { skip: !hasDb }, () => {
  it("expires old meetings and orphan proposals, and leaves recent and accepted rows", async () => {
    const database = getDb()
    let assertionError: unknown = null

    try {
      await database.transaction(async (tx) => {
        try {
          const [oldNote] = await tx
            .insert(schema.clientNotes)
            .values({
              title: `${RUN} old`,
              source: "fireflies",
              meetingDate: daysAgo(30),
              firefliesMeetingId: `${RUN}-old`,
              isInternal: false,
            })
            .returning({ id: schema.clientNotes.id })
          const [recentNote] = await tx
            .insert(schema.clientNotes)
            .values({
              title: `${RUN} recent`,
              source: "fireflies",
              meetingDate: daysAgo(5),
              firefliesMeetingId: `${RUN}-recent`,
              isInternal: false,
            })
            .returning({ id: schema.clientNotes.id })

          const inserted = await tx
            .insert(schema.avaTaskProposals)
            .values([
              {
                sourceNoteId: oldNote!.id,
                proposedTitle: `${RUN} from old meeting`,
                status: "proposed",
                createdAt: daysAgo(1),
              },
              {
                sourceNoteId: recentNote!.id,
                proposedTitle: `${RUN} from recent meeting`,
                status: "proposed",
                createdAt: daysAgo(40),
              },
              {
                sourceNoteId: null,
                proposedTitle: `${RUN} no note`,
                status: "proposed",
                createdAt: daysAgo(25),
              },
              {
                sourceNoteId: null,
                proposedTitle: `${RUN} accepted`,
                status: "accepted",
                createdAt: daysAgo(60),
                decidedByEmail: "keep@example.com",
                decidedAt: daysAgo(59),
                decisionDiff: { action: "accept" },
              },
            ])
            .returning({ id: schema.avaTaskProposals.id })

          const ids = inserted.map((row) => row.id)
          const expired = await expireStaleProposals(
            { now: NOW },
            tx as unknown as Db
          )
          assert.ok(expired >= 2)

          const rows = await tx
            .select()
            .from(schema.avaTaskProposals)
            .where(inArray(schema.avaTaskProposals.id, ids))
          const byTitle = new Map(rows.map((row) => [row.proposedTitle, row]))

          const fromOld = byTitle.get(`${RUN} from old meeting`)
          assert.equal(fromOld?.status, "expired")
          assert.equal(fromOld?.decidedByEmail, null)
          assert.ok(fromOld?.decidedAt)
          const oldDiff = fromOld?.decisionDiff as { reason?: string } | null
          assert.equal(oldDiff?.reason, "expired_21d")

          const fromRecent = byTitle.get(`${RUN} from recent meeting`)
          assert.equal(fromRecent?.status, "proposed")
          assert.equal(fromRecent?.decidedAt, null)

          const orphan = byTitle.get(`${RUN} no note`)
          assert.equal(orphan?.status, "expired")
          assert.equal(orphan?.decidedByEmail, null)
          const orphanDiff = orphan?.decisionDiff as { reason?: string } | null
          assert.equal(orphanDiff?.reason, "expired_21d")

          const accepted = byTitle.get(`${RUN} accepted`)
          assert.equal(accepted?.status, "accepted")
          assert.equal(accepted?.decidedByEmail, "keep@example.com")
          const acceptedDiff = accepted?.decisionDiff as { action?: string } | null
          assert.equal(acceptedDiff?.action, "accept")

          assert.equal(rows.length, 4)
        } catch (error) {
          assertionError = error
        }
        throw new Error("__rollback__")
      })
    } catch (error) {
      const rolledBack =
        error instanceof Error && error.message === "__rollback__"
      if (!rolledBack) throw error
    }

    if (assertionError) throw assertionError

    const leaked = await database.execute(sql`
      SELECT id
      FROM ava_task_proposals
      WHERE proposed_title LIKE ${`${RUN}%`}
    `)
    const leakedNotes = await database.execute(sql`
      SELECT id
      FROM client_notes
      WHERE fireflies_meeting_id LIKE ${`${RUN}%`}
    `)
    const leakedRows = Array.isArray(leaked)
      ? leaked
      : ((leaked as { rows?: unknown[] }).rows ?? [])
    const leakedNoteRows = Array.isArray(leakedNotes)
      ? leakedNotes
      : ((leakedNotes as { rows?: unknown[] }).rows ?? [])
    assert.equal(leakedRows.length, 0)
    assert.equal(leakedNoteRows.length, 0)

    const stamped = await database.execute(sql`
      SELECT count(*)::int AS n
      FROM ava_task_proposals
      WHERE status = 'expired'
        AND decision_diff->>'reason' = 'expired_21d'
        AND decided_at = ${NOW.toISOString()}::timestamptz
    `)
    const stampedRows = Array.isArray(stamped)
      ? stamped
      : ((stamped as { rows?: Array<{ n: number }> }).rows ?? [])
    const stampedCount = Number(
      (stampedRows[0] as { n?: number } | undefined)?.n ?? 0
    )
    assert.equal(stampedCount, 0)
  })
})
