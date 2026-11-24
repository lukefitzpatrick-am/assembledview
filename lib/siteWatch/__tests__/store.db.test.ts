/**
 * Roz (Site Watch) store against a real Postgres with migration 0122:
 * site sync, enqueue, claim, page saves, grouping, retry and retention.
 *
 * Skips unless SITE_WATCH_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_test`. It drops and rebuilds that database's public schema.
 * It never reads .env.local.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { after, before, describe, it } from "node:test"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "@/db/schema"
import type { Db } from "@/db"
import { classifyTestDatabaseUrl } from "../../testing/testDatabaseGuard"
import type { ChangeRow } from "../scan"
import {
  claimNextRun,
  deleteOldRuns,
  enqueueRuns,
  expireOldQueuedRuns,
  failRun,
  finishRun,
  requeueRun,
  scanStore,
  syncSitesFromClients,
} from "../store"

const RAW = process.env.SITE_WATCH_TEST_DATABASE_URL?.trim() ?? ""
const URL_ = RAW && classifyTestDatabaseUrl(RAW).ok && /_test$/.test(new URL(RAW).pathname) ? RAW : null
const skip = URL_ ? false : "set SITE_WATCH_TEST_DATABASE_URL to a local database named *_test"

const BASE_SQL = `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
DO $$ BEGIN CREATE ROLE ava_readonly; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.clients (id bigint primary key, mp_client_name text, website text, is_test_client boolean not null default false);
INSERT INTO public.clients VALUES
  (4, 'Golf Australia', 'https://golf.com.au/', false),
  (9, 'PGA Australia', 'https://golf.com.au/', false),
  (7, 'Jayco', 'https://www.jayco.com.au', false),
  (8, 'Test client', 'https://test.example/', true),
  (10, 'No site', null, false);
`

describe("site watch store (0122)", { skip }, () => {
  let sqlc: ReturnType<typeof postgres>
  let db: Db
  before(async () => {
    sqlc = postgres(URL_!, { max: 2, onnotice: () => {} })
    await sqlc.unsafe(BASE_SQL)
    await sqlc.unsafe(fs.readFileSync(path.join(process.cwd(), "db/migrations/0122_site_watch.sql"), "utf8"))
    db = drizzle(sqlc, { schema }) as unknown as Db
  })
  after(async () => {
    await sqlc?.end()
  })

  it("adds one site per website, owned by the lowest client id, and never twice", async () => {
    assert.equal(await syncSitesFromClients(db), 2)
    assert.equal(await syncSitesFromClients(db), 0)
    const rows = await sqlc`SELECT client_id, base_url FROM site_watch_sites ORDER BY client_id`
    assert.deepEqual(rows.map((r) => [Number(r.client_id), r.base_url]), [[4, "https://golf.com.au/"], [7, "https://www.jayco.com.au/"]])
  })

  it("queues one run per enabled site per date, claims it once, saves pages and groups wide changes", async () => {
    await sqlc`UPDATE site_watch_sites SET enabled = false WHERE client_id = 7`
    assert.equal(await enqueueRuns(db, "2026-11-25"), 1)
    assert.equal(await enqueueRuns(db, "2026-11-25"), 0)
    const claimed = await claimNextRun(db)
    assert.ok(claimed)
    assert.equal(await claimNextRun(db), null, "running runs are not claimed again")
    const { site, run } = claimed
    const store = scanStore(db)
    run.pageUrls = []
    await store.savePlan(site, run, { robotsTxt: "User-agent: *", sitemapUrls: ["https://golf.com.au/a"], changes: [] })
    const change = (url: string): ChangeRow => ({ url, category: "visual", field: "inline_css", before: "a", after: "b", severity: "low" })
    const snapshot = { fields: { title: "T" } as never, text: "copy", layout: ["main"] }
    for (let i = 0; i < 12; i++) {
      await store.savePage(site, run, `https://golf.com.au/p${i}`, { snapshot, failError: null, changes: [change(`https://golf.com.au/p${i}`)] })
    }
    await store.savePage(site, run, "https://golf.com.au/p0", { snapshot: null, failError: "timed out", changes: [] })
    const loaded = await store.loadPages(site.id, ["https://golf.com.au/p0", "https://golf.com.au/none"])
    assert.equal(loaded.size, 1)
    assert.equal(loaded.get("https://golf.com.au/p0")!.failError, "timed out")
    assert.deepEqual(loaded.get("https://golf.com.au/p0")!.layout, ["main"], "a failed load keeps the snapshot")
    run.nextPage = 12
    await store.saveProgress(run)
    await finishRun(db, run.id)
    const [r] = await sqlc`SELECT status, next_page, finished_at FROM site_watch_runs WHERE id = ${run.id}`
    assert.equal(r!.status, "done")
    assert.equal(r!.next_page, 12)
    const groups = await sqlc`SELECT count(DISTINCT group_key)::int AS g, count(*)::int AS n FROM site_watch_changes WHERE group_key IS NOT NULL`
    assert.deepEqual([groups[0]!.g, groups[0]!.n], [1, 12])
    const [s] = await sqlc`SELECT robots_txt, sitemap_urls FROM site_watch_sites WHERE id = ${site.id}`
    assert.equal(s!.robots_txt, "User-agent: *")
  })

  it("an error requeues under three attempts and fails at three; a requeued run resumes", async () => {
    assert.equal(await enqueueRuns(db, "2026-11-26"), 1)
    const c = await claimNextRun(db)
    await requeueRun(db, c!.run.id)
    for (let i = 0; i < 3; i++) {
      const again = await claimNextRun(db)
      assert.equal(again!.run.id, c!.run.id)
      assert.equal(await failRun(db, again!.run.id, "boom"), i === 2, "true only on the final failure")
    }
    const [r] = await sqlc`SELECT status, attempts, error FROM site_watch_runs WHERE id = ${c!.run.id}`
    assert.deepEqual([r!.status, r!.attempts, r!.error], ["failed", 3, "boom"])
    assert.equal(await claimNextRun(db), null)
  })

  it("a queued run from an earlier day is failed when the next day is enqueued", async () => {
    await sqlc`INSERT INTO site_watch_runs (site_id, scan_date) SELECT id, '2026-11-27' FROM site_watch_sites WHERE enabled`
    assert.equal(await expireOldQueuedRuns(db, "2026-11-27"), 0, "same day: kept")
    assert.equal(await expireOldQueuedRuns(db, "2026-11-28"), 1)
    const [r] = await sqlc`SELECT status FROM site_watch_runs WHERE scan_date = '2026-11-27'`
    assert.equal(r!.status, "failed")
    await sqlc`DELETE FROM site_watch_runs WHERE scan_date = '2026-11-27'`
  })

  it("retention deletes runs older than 90 days with their changes, and keeps pages", async () => {
    const pagesBefore = (await sqlc`SELECT count(*)::int AS n FROM site_watch_pages`)[0]!.n
    assert.equal(await deleteOldRuns(db, "2027-02-23"), 0, "25 Nov is exactly 90 days before 23 Feb: kept")
    assert.equal(await deleteOldRuns(db, "2027-02-24"), 1)
    const left = await sqlc`SELECT count(*)::int AS n FROM site_watch_changes`
    assert.equal(left[0]!.n, 0)
    assert.equal((await sqlc`SELECT count(*)::int AS n FROM site_watch_pages`)[0]!.n, pagesBefore)
  })
})
