# Module: Roz (Site Watch)

Roz is the tool name for Site Watch: a daily scan of each client website that records what changed. Brief and discovery: `docs/superpowers/BRIEF-site-watch-2026-11-24.md`, `docs/superpowers/DISCOVERY-site-watch-2026-11-24.md`. Phase 1 (this page) is the engine; GTM container inspection (phase 2), the staff UI and Ava tool (phase 3) and the Teams reporter (phase 4, paused) come later.

## Switch and data

- Switch `site_watch` ("Roz (Site Watch)", Admin > Features), off. `requiresMarker: "0122_site_watch"`: off and can't be turned on until migration 0122 runs. Off: both crons return `skipped: disabled`.
- Tables (0122, RLS on, no policies, no ava grant): `site_watch_sites`, `site_watch_runs`, `site_watch_pages`, `site_watch_changes`. See `DATA-MODEL.md`.
- All reads and writes: `lib/siteWatch/store.ts` (server-only). Every function takes the `Db`, so `store.db.test.ts` runs it on a local Postgres (`SITE_WATCH_TEST_DATABASE_URL`, a local `*_test` database).

## Crons

| Route | Schedule (UTC) | Does |
|---|---|---|
| `/api/cron/site-watch-enqueue` | `0 19,20 * * *`, acts in the Melbourne 06:00 hour (`MELBOURNE_CRONS`) | `syncSitesFromClients` (one site per `clients.website`, non-test clients, owned by the lowest client id that has the URL, label `mp_client_name`, `url_prefix` from the path, `sites.ts`); `enqueueRuns` (one run per enabled site per Melbourne date, idempotent); `expireOldQueuedRuns` (a queued run from an earlier day is failed and logged, so the backlog never grows); `deleteOldRuns` (scan_date older than 90 days, changes cascade) |
| `/api/cron/site-watch-worker` | `*/5 19-22 * * *` | `resetStuckRuns` (running over 10 minutes: back to queued, failed at 3 attempts), then claims runs one at a time (SKIP LOCKED) and calls `advanceRun` until 240 s are used. Unfinished: `requeueRun`. Finished: `finishRun` (groups changes) then the Critical email. An error: `failRun` (queued under 3 attempts; on the final failure it groups the saved changes and the Critical email still goes) |

## The scan (`lib/siteWatch/scan.ts`)

1. Plan once per run: robots.txt (`robots_url` or origin), diff against the stored copy; sitemap (`sitemap_url`, else every robots `Sitemap:` line up to 10, else `/sitemap.xml`), index files two levels, nested files on the site's own host only, at most 50 files and 5,000 URLs, kept only under `origin + url_prefix`. An unreadable, empty or out-of-time sitemap (any file) is no answer, never "all removed". A `Disallow: /` added anywhere in robots.txt is Critical (counted on the whole file, not the capped diff). Page list: base URL, key URLs, then sitemap URLs, up to `page_limit`, fixed in `page_urls`.
2. Pages four at a time (`fetchPage.ts`: browser-like agent with `AssembledSiteWatch/1.0`, 30 s timeout, redirects followed; public addresses only (`isPublicUrl`, literal hosts, no DNS check); text bodies only, cut at 5 MB, NUL removed). The pages of a group, and their stylesheet fetches, run side by side; sitemap reading stops before the deadline. A group starts only with 40 s left before the deadline; `next_page` and `css_hashes` are saved after each group.
3. Each page: `extract.ts` (cheerio) gives the fields, visible copy and layout outline; stylesheets are hashed once per run (at most 20 per page). `compare.ts` diffs against the stored snapshot; `severity.ts` rates each change; `store.savePage` writes the changes and the new snapshot in one transaction.
4. First check of a page: baseline, no change. A non-HTML response (a PDF or image in the sitemap) is skipped and not counted. Network failure, HTTP 4xx/5xx, or an error while reading or saving the page: one `page_failed` change (`after` is the error, such as `HTTP 500`), snapshot kept (`fail_error` set), one `page_recovered` change when it loads again. Bot protection (`looksBlocked`: 401/403/429/503 with `cf-mitigated: challenge`, a DataDome header or a challenge page body; an edge header such as `cf-ray` alone is a real outage): no change, run flag `blocked`; on the base URL the run ends there. Base URL with under 200 characters of text: flag `thin_html` (likely JavaScript-rendered).
5. `finishRun` sets `group_key` on any page change repeated on more than 10 pages in the run (same field, before, after and diff).

## Severity (`severity.ts`)

Critical: noindex added (meta `robots` or `googlebot` in any case, or header), robots.txt gains `Disallow: /`, a key page (base URL and `key_urls`) returns 4xx/5xx or fails to load, a GTM ID leaves a page, the canonical moves to another host. High: other tracking IDs removed or swapped, title or H1 on a key page, the final URL (redirect target). Medium: other technical fields, key page copy, sitemap added/removed, script hosts, a tracking ID only added. Low: layout, stylesheets, inline CSS, images, copy on other pages, a page recovering.

## Critical email (`email.ts`, gate D9)

One email per run with Critical changes, to `getOpsEmailRecipients()` (`OPS_EMAIL_TO`, Luke by default), `emailed_at` stamped. Written in Roz's voice (a dry, by-the-book desk clerk on her monster-hunting morning rounds; subject "Roz found N critical changes lurking on …"): our own wording, no film quotes, character art or logos. Grouped changes are one line with a page count. Every scanned value is escaped. A send failure is logged and not retried; the changes stay in the database.

## Not built yet

GTM container fetch and tag diff (phase 2), technology profile (hand-kept list of about 30, gate D7), `/site-watch` UI, acknowledge, settings, client hub panel and Ava tool (phase 3), the `site_watch_unreported_changes` view and the Teams reporter (phase 4, paused; `teams_reported_at` has no writer). Rendered scan: after two weeks of data (D5).

## Known limits

- Plain HTTP sees server HTML only. Sites behind bot protection show `blocked`; Vercel egress has not been tested against client sites yet.
- C-414 (stale page snapshots), C-415 (counters after a crash), C-416 (a run killed three times is not emailed).
