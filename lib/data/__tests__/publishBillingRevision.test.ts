/**
 * publishBillingRevision gates that need no database, plus DB integration
 * cases that only run against a scratch database.
 *
 * DB cases run only when BILLING_REVISIONS_IT_DATABASE_URL is set AND equals
 * DATABASE_URL (never production; .env.local is production). They are listed
 * for Luke; they were not run in this build.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { Db } from "@/db"

import { BillingRevisionWriteError, publishBillingRevision, type PublishBillingRevisionInput } from "../publishBillingRevision"

const input = (over: Partial<PublishBillingRevisionInput> = {}): PublishBillingRevisionInput => ({
  mbaNumber: "PENFOLD020",
  baseVersionId: 16999,
  expectedHash: "x",
  request: { mode: "bill_amount", intoMonth: "2026-10", amountCents: 10_000_000, strategy: "earliest_first" },
  options: { unlockApprovedMonths: ["2026-10"], includeProduction: false, feeMode: "follow", adservingMode: "keep" },
  reason: "Client asked to bill $100k in October",
  source: "ui",
  actor: { teamMemberId: 7, name: "Test", email: "test@example.com" },
  ...over,
})

const noDb = new Proxy({}, {
  get() {
    throw new Error("the database must not be touched")
  },
}) as unknown as Db

test("refuses with NOT_READY (409) until 0106 is applied, before any DB write", async () => {
  await assert.rejects(
    publishBillingRevision(input({ markerReader: async () => false }), noDb),
    (err: unknown) => err instanceof BillingRevisionWriteError && err.code === "NOT_READY" && err.status === 409,
  )
})

test("refuses an empty reason before any DB write", async () => {
  await assert.rejects(
    publishBillingRevision(input({ reason: "  ", markerReader: async () => true }), noDb),
    (err: unknown) => err instanceof BillingRevisionWriteError && err.status === 400,
  )
})

const itUrl = process.env.BILLING_REVISIONS_IT_DATABASE_URL
const runIt = Boolean(itUrl && itUrl.trim() && itUrl === process.env.DATABASE_URL)

test(
  "DB: publishes v(N+1), leaves vN untouched, copies KPIs, checksum set, overrides pass the sum law",
  { skip: runIt ? false : "scratch DB only (BILLING_REVISIONS_IT_DATABASE_URL)" },
  async () => {
    const { getDb } = await import("@/db")
    const { sql } = await import("drizzle-orm")
    const { buildRevisionInput, loadRevisionContext } = await import("@/lib/finance/revisions/loadRevisionContext")
    const { planBillingRevision } = await import("@/lib/finance/revisions/planBillingRevision")
    const mba = process.env.BILLING_REVISIONS_IT_MBA ?? "PENFOLD020"
    const db = getDb()
    const before = await db.execute(sql`
      SELECT v.id, v.snapshot_checksum, (SELECT count(*) FROM schedule_months s WHERE s.version_id = v.id) AS rows
      FROM media_plan_masters m JOIN media_plan_versions v ON v.id = m.published_version_id
      WHERE lower(m.mba_number) = lower(${mba})`)
    const base = (before as unknown as Array<{ id: number; snapshot_checksum: string; rows: number }>)[0]!
    const request = { mode: "bill_amount" as const, intoMonth: "2026-10", amountCents: 100, strategy: "earliest_first" as const }
    const ctx = await loadRevisionContext(db as never, { mbaNumber: mba, now: new Date() })
    const plan = planBillingRevision(buildRevisionInput(ctx, request, input().options))
    assert.ok(plan.ok)
    const res = await publishBillingRevision(
      input({ mbaNumber: mba, baseVersionId: base.id, expectedHash: plan.hash, request }),
      db,
    )
    assert.equal(res.status, "published")
    const after = await db.execute(sql`
      SELECT v.id, v.snapshot_checksum, (SELECT count(*) FROM schedule_months s WHERE s.version_id = v.id) AS rows
      FROM media_plan_versions v WHERE v.id = ${base.id}`)
    const same = (after as unknown as Array<{ snapshot_checksum: string; rows: number }>)[0]!
    assert.equal(same.snapshot_checksum, base.snapshot_checksum)
    assert.equal(Number(same.rows), Number(base.rows))
    await assert.rejects(
      publishBillingRevision(input({ mbaNumber: mba, baseVersionId: base.id, expectedHash: plan.hash, request }), db),
      (err: unknown) => err instanceof BillingRevisionWriteError && err.code === "STALE_BASE_VERSION",
    )
  },
)
