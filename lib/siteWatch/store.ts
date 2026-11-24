/**
 * Site Watch database reads and writes (migration 0122). Only called with
 * the switch site_watch on, which needs the marker 0122_site_watch. Every
 * function takes the database so a local Postgres test can pass its own.
 */
import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"

import { schema, type Db } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"

import type { ChangeRow, RunRow, ScanStore, SiteRow, StoredPage } from "./scan"
import { sitesFromClients } from "./sites"

const { siteWatchSites: sites, siteWatchRuns: runs, siteWatchPages: pages, siteWatchChanges: changes } = schema

/** Runs (and their changes) older than this many days are deleted (Luke, Q9). */
const RETENTION_DAYS = 90
/** A run left `running` this long is taken back (the worker died mid-group). */
const STUCK_MINUTES = 10
const MAX_ATTEMPTS = 3
/** More than this many identical changes in one run are grouped (brief 5.5). */
const GROUP_OVER = 10

/** Adds a site for each client website no site has yet. Never changes an existing site. */
export async function syncSitesFromClients(db: Db): Promise<number> {
  const rows = await db
    .select({ id: schema.clients.id, name: schema.clients.mpClientName, website: schema.clients.website })
    .from(schema.clients)
    .where(eq(schema.clients.isTestClient, false))
  const fresh = sitesFromClients(rows)
  if (!fresh.length) return 0
  const inserted = await db.insert(sites).values(fresh).onConflictDoNothing().returning({ id: sites.id })
  return inserted.length
}

/**
 * A queued run from an earlier day never ran (the worker window was full).
 * It is failed, not kept, so the backlog cannot grow and two runs of one
 * site never compare against the same snapshot. Returns how many.
 */
export async function expireOldQueuedRuns(db: Db, scanDate: string): Promise<number> {
  const result = await db.execute(sql`
    UPDATE site_watch_runs
    SET status = 'failed', error = 'Not reached before the next day''s scan', finished_at = now()
    WHERE status = 'queued' AND scan_date < ${scanDate}::date
    RETURNING id
  `)
  return rowsOf(result).length
}

/** One queued run per enabled site for the Melbourne date; a second call adds none. */
export async function enqueueRuns(db: Db, scanDate: string): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO site_watch_runs (site_id, scan_date)
    SELECT id, ${scanDate}::date FROM site_watch_sites WHERE enabled
    ON CONFLICT (site_id, scan_date) DO NOTHING
    RETURNING id
  `)
  return rowsOf(result).length
}

/** Deletes runs from before the retention window; their changes go with them (cascade). */
export async function deleteOldRuns(db: Db, todayISO: string): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM site_watch_runs
    WHERE scan_date < ${todayISO}::date - ${RETENTION_DAYS}::int
    RETURNING id
  `)
  return rowsOf(result).length
}

export async function resetStuckRuns(db: Db): Promise<void> {
  await db.execute(sql`
    UPDATE site_watch_runs
    SET attempts = attempts + 1,
        status = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'queued' END,
        error = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'Stopped: the worker timed out three times' ELSE error END,
        finished_at = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN now() ELSE NULL END
    WHERE status = 'running' AND started_at < now() - make_interval(mins => ${STUCK_MINUTES})
  `)
}

/** Claims the oldest queued run (SKIP LOCKED). `started_at` is the latest claim, for the stuck rule. */
export async function claimNextRun(db: Db): Promise<{ site: SiteRow; run: RunRow } | null> {
  const claimed = await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      UPDATE site_watch_runs SET status = 'running', started_at = now()
      WHERE id = (
        SELECT id FROM site_watch_runs WHERE status = 'queued'
        ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `)
    return rowsOf<{ id: number | string }>(result)[0]
  })
  if (!claimed) return null
  const [run] = await db.select().from(runs).where(eq(runs.id, Number(claimed.id)))
  const [site] = run ? await db.select().from(sites).where(eq(sites.id, run.siteId)) : []
  if (!run || !site) return null
  return {
    site: {
      id: site.id,
      baseUrl: site.baseUrl,
      urlPrefix: site.urlPrefix,
      sitemapUrl: site.sitemapUrl,
      robotsUrl: site.robotsUrl,
      keyUrls: site.keyUrls,
      pageLimit: site.pageLimit,
      ignoreSelectors: site.ignoreSelectors,
      watchText: site.watchText,
      watchVisual: site.watchVisual,
      robotsTxt: site.robotsTxt,
      sitemapUrls: site.sitemapUrls,
    },
    run: {
      id: run.id,
      pageUrls: run.pageUrls,
      nextPage: run.nextPage,
      cssHashes: run.cssHashes,
      pagesChecked: run.pagesChecked,
      pagesChanged: run.pagesChanged,
      pagesFailed: run.pagesFailed,
      flags: run.flags,
    },
  }
}

function changeValues(siteId: number, runId: number, list: readonly ChangeRow[]) {
  return list.map((c) => ({
    siteId,
    runId,
    url: c.url,
    category: c.category,
    field: c.field,
    severity: c.severity,
    before: c.before ?? null,
    after: c.after ?? null,
    diff: c.diff ?? null,
  }))
}

function progressValues(run: RunRow) {
  return {
    pageUrls: run.pageUrls,
    nextPage: run.nextPage,
    cssHashes: run.cssHashes,
    pagesChecked: run.pagesChecked,
    pagesChanged: run.pagesChanged,
    pagesFailed: run.pagesFailed,
    flags: run.flags,
  }
}

export function scanStore(db: Db): ScanStore {
  return {
    async savePlan(site, run, plan) {
      await db.transaction(async (tx) => {
        if (plan.changes.length) await tx.insert(changes).values(changeValues(site.id, run.id, plan.changes))
        await tx
          .update(sites)
          .set({
            ...(plan.robotsTxt !== null ? { robotsTxt: plan.robotsTxt } : {}),
            ...(plan.sitemapUrls !== null ? { sitemapUrls: plan.sitemapUrls } : {}),
            updatedAt: sql`now()`,
          })
          .where(eq(sites.id, site.id))
        await tx.update(runs).set(progressValues(run)).where(eq(runs.id, run.id))
      })
    },

    async loadPages(siteId, urls) {
      const rows = urls.length
        ? await db.select().from(pages).where(and(eq(pages.siteId, siteId), inArray(pages.url, urls)))
        : []
      return new Map<string, StoredPage>(
        rows.map((r) => [
          r.url,
          {
            fields: r.fields as StoredPage["fields"],
            text: r.pageText ?? "",
            layout: r.layout ? r.layout.split("\n") : [],
            failError: r.failError,
          },
        ]),
      )
    },

    async savePage(site, run, url, page) {
      await db.transaction(async (tx) => {
        if (page.changes.length) await tx.insert(changes).values(changeValues(site.id, run.id, page.changes))
        const stamp = {
          failError: page.failError,
          lastRunId: run.id,
          lastCheckedAt: sql`now()`,
          ...(page.changes.length ? { lastChangedAt: sql`now()` } : {}),
        }
        if (!page.snapshot) {
          // A failed load never overwrites the last good snapshot.
          await tx.update(pages).set(stamp).where(and(eq(pages.siteId, site.id), eq(pages.url, url)))
          return
        }
        const snap = { fields: page.snapshot.fields, pageText: page.snapshot.text, layout: page.snapshot.layout.join("\n") }
        await tx
          .insert(pages)
          .values({ siteId: site.id, url, ...snap, ...stamp })
          .onConflictDoUpdate({ target: [pages.siteId, pages.url], set: { ...snap, ...stamp } })
      })
    },

    async saveProgress(run) {
      await db.update(runs).set(progressValues(run)).where(eq(runs.id, run.id))
    },
  }
}

/** Groups any change that hit more than ten pages in the run. */
async function groupChanges(tx: Pick<Db, "execute">, runId: number): Promise<void> {
  await tx.execute(sql`
      UPDATE site_watch_changes c SET group_key = g.key
      FROM (
        SELECT c2.field || ':' || md5(coalesce(c2.before::text, '') || '|' || coalesce(c2.after::text, '') || '|' || coalesce(c2.diff::text, '')) AS key,
               array_agg(c2.id) AS ids
        FROM site_watch_changes c2
        WHERE c2.run_id = ${runId} AND c2.url IS NOT NULL
        GROUP BY 1
        HAVING count(*) > ${GROUP_OVER}
      ) g
      WHERE c.id = ANY (g.ids)
    `)
}

/** Marks a run done and groups its changes. */
export async function finishRun(db: Db, runId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await groupChanges(tx, runId)
    await tx.update(runs).set({ status: "done", finishedAt: sql`now()`, error: null }).where(eq(runs.id, runId))
  })
}

/** Back to the queue: the run ran out of time and resumes on the next worker call. */
export async function requeueRun(db: Db, runId: number): Promise<void> {
  await db.update(runs).set({ status: "queued" }).where(eq(runs.id, runId))
}

/**
 * An error: queued again under three attempts, failed at three. Returns
 * true when the run is now failed; its saved changes are grouped then, so
 * its Critical ones can still be emailed.
 */
export async function failRun(db: Db, runId: number, error: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      UPDATE site_watch_runs
      SET attempts = attempts + 1,
          error = ${error.slice(0, 500)},
          status = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'queued' END,
          finished_at = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN now() ELSE NULL END
      WHERE id = ${runId}
      RETURNING status
    `)
    const failed = rowsOf<{ status: string }>(result)[0]?.status === "failed"
    if (failed) await groupChanges(tx, runId)
    return failed
  })
}

export type CriticalChange = { url: string | null; field: string; before: unknown; after: unknown; groupKey: string | null }

/** The run's site label, client name and Critical changes, unless its email went already. */
export async function criticalForEmail(
  db: Db,
  runId: number,
): Promise<{ label: string; clientName: string | null; baseUrl: string; changes: CriticalChange[] } | null> {
  const [head] = await db
    .select({ label: sites.label, baseUrl: sites.baseUrl, clientName: schema.clients.mpClientName, emailedAt: runs.emailedAt })
    .from(runs)
    .innerJoin(sites, eq(sites.id, runs.siteId))
    .leftJoin(schema.clients, eq(schema.clients.id, sites.clientId))
    .where(eq(runs.id, runId))
  if (!head || head.emailedAt) return null
  const list = await db
    .select({ url: changes.url, field: changes.field, before: changes.before, after: changes.after, groupKey: changes.groupKey })
    .from(changes)
    .where(and(eq(changes.runId, runId), eq(changes.severity, "critical")))
    .orderBy(changes.id)
  return list.length ? { label: head.label, clientName: head.clientName, baseUrl: head.baseUrl, changes: list } : null
}

export async function markEmailed(db: Db, runId: number): Promise<void> {
  await db.update(runs).set({ emailedAt: sql`now()` }).where(eq(runs.id, runId))
}

