/**
 * S15 (review R1, R2): the pack job's claim, release and stale takeover on a
 * real Postgres. Skips unless BILLING_PARTNER_TEST_DATABASE_URL names a LOCAL
 * database whose name ends in _billing_partner_test. The suite creates
 * report_digest_sends (live shape: primary key kind, period_start) and drops
 * it after.
 */
import assert from "node:assert/strict"
import { after, before, beforeEach, describe, test } from "node:test"

import postgres from "postgres"

import { classifyTestDatabaseUrl } from "@/lib/testing/testDatabaseGuard"

const RAW_URL = process.env.BILLING_PARTNER_TEST_DATABASE_URL?.trim() ?? ""
const URL_ = (() => {
  if (!RAW_URL || !classifyTestDatabaseUrl(RAW_URL).ok) return null
  try {
    return new URL(RAW_URL).pathname.endsWith("_billing_partner_test") ? RAW_URL : null
  } catch {
    return null
  }
})()
const skip = URL_ ? false : "set BILLING_PARTNER_TEST_DATABASE_URL to a local database named *_billing_partner_test"

const MONTH = "2026-11-01"
const CRON_RUN = new Date("2026-11-17T06:00:00.000Z")

describe("billing partner pack job on Postgres", { skip }, () => {
  let sql: ReturnType<typeof postgres>
  let job: typeof import("@/lib/finance/billingPartner/packJob")
  let builds = 0
  let packs: { status: "draft" | "sent"; createdBy: string }[] = []

  const io = (over: { buildFails?: boolean } = {}) => ({
    now: CRON_RUN,
    switchOn: async () => true,
    listPacks: async () => packs,
    listDue: async () => [{ versionId: 11 }, { versionId: 22 }],
    build: async () => {
      if (over.buildFails) throw new Error("blob down")
      builds++
      return { packId: `pack-${builds}` }
    },
  })
  const rows = async () =>
    (await sql`SELECT kind, period_start::text AS month, run_count FROM report_digest_sends ORDER BY kind, period_start`).map((r) => ({ ...r }))

  before(async () => {
    process.env.DATABASE_URL = URL_!
    sql = postgres(URL_!, { max: 1, onnotice: () => {} })
    await sql.unsafe(`
      DROP TABLE IF EXISTS report_digest_sends;
      CREATE TABLE report_digest_sends (kind text not null, period_start date not null,
        sent_at timestamptz not null default now(), recipients text[] not null, run_count integer not null,
        CONSTRAINT report_digest_sends_pkey PRIMARY KEY (kind, period_start));
    `)
    job = await import("@/lib/finance/billingPartner/packJob")
  })

  beforeEach(async () => {
    builds = 0
    packs = []
    await sql`DELETE FROM report_digest_sends`
  })

  after(async () => {
    await sql?.unsafe(`DROP TABLE IF EXISTS report_digest_sends`)
    await sql?.end()
    const { closeDb } = await import("@/db")
    await closeDb()
  })

  test("the first run claims the month and builds; a second run builds nothing", async () => {
    assert.equal("status" in (await job.runBillingPartnerPackJob(io())), true)
    assert.deepEqual(await job.runBillingPartnerPackJob(io()), { skipped: "already built" })
    assert.equal(builds, 1)
    assert.deepEqual(await rows(), [{ kind: "billing_partner_pack_job", month: MONTH, run_count: 2 }])
  })

  test("two runs at once build one pack", async () => {
    const results = await Promise.all([job.runBillingPartnerPackJob(io()), job.runBillingPartnerPackJob(io())])
    assert.equal(builds, 1)
    assert.equal(results.filter((r) => "skipped" in r).length, 1)
  })

  test("a failed build releases only its own month and kind", async () => {
    await sql`INSERT INTO report_digest_sends (kind, period_start, recipients, run_count) VALUES
      ('billing_partner_pack_job', '2026-10-01', '{}', 3), ('billing_partner_reminder', ${MONTH}, '{}', 1)`
    await assert.rejects(job.runBillingPartnerPackJob(io({ buildFails: true })), /blob down/)
    assert.deepEqual(await rows(), [
      { kind: "billing_partner_pack_job", month: "2026-10-01", run_count: 3 },
      { kind: "billing_partner_reminder", month: MONTH, run_count: 1 },
    ])
    const retry = await job.runBillingPartnerPackJob(io())
    assert.equal("status" in retry && retry.status, "built")
  })

  test("a claim older than 10 minutes with no job pack is taken over", async () => {
    await sql`INSERT INTO report_digest_sends (kind, period_start, sent_at, recipients, run_count)
      VALUES ('billing_partner_pack_job', ${MONTH}, now() - interval '11 minutes', '{}', 1)`
    const result = await job.runBillingPartnerPackJob(io())
    assert.equal("status" in result && result.status, "built")
    const [row] = await sql`SELECT run_count, sent_at > now() - interval '1 minute' AS fresh FROM report_digest_sends`
    assert.equal(row!.run_count, 2)
    assert.equal(row!.fresh, true)
    assert.deepEqual(await job.runBillingPartnerPackJob(io()), { skipped: "already built" }, "taken over once")
  })

  test("a claim younger than 10 minutes is left alone", async () => {
    await sql`INSERT INTO report_digest_sends (kind, period_start, sent_at, recipients, run_count)
      VALUES ('billing_partner_pack_job', ${MONTH}, now() - interval '9 minutes', '{}', 1)`
    assert.deepEqual(await job.runBillingPartnerPackJob(io()), { skipped: "already built" })
    assert.equal(builds, 0)
  })

  test("a stale claim is not taken over when the job already sent a pack that month", async () => {
    packs = [{ status: "sent", createdBy: "billing-partner-pack-job" }]
    await sql`INSERT INTO report_digest_sends (kind, period_start, sent_at, recipients, run_count)
      VALUES ('billing_partner_pack_job', ${MONTH}, now() - interval '2 hours', '{}', 1)`
    assert.deepEqual(await job.runBillingPartnerPackJob(io()), { skipped: "already built" })
    assert.equal(builds, 0)
  })
})
