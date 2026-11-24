# Site Watch: Phase 0 discovery

Status: Discovery complete. D12 answered (rules in CLAUDE.md, brief and this file in docs/superpowers). D1 to D11 open. No build started.
Date: 24 Nov 2026
Brief: `docs/superpowers/BRIEF-site-watch-2026-11-24.md`. Prototype `watch.py` used for detection logic only.

## How this was done

- Read only. Repo at `e9d93108` (AVA20fix, file 84). Luke's `C:\Projects\avmediaplan` is on the same commit, branch `localhost`.
- Live Supabase: SELECT only (row counts, client websites, markers, database size). Nothing written.
- Live GTM containers: fetched in Luke's Chrome (the cloud container and the device shell both block outbound requests to client sites). Three sites checked, two of them run GTM, plus one that runs Adobe Launch only.
- Not checked: the Vercel plan name (API refused env and plan reads), and whether client sites block Vercel's IP ranges.

## 1. Where the brief clashes with the repo rules

Flagging these before anything else. Each needs Luke's word.

| # | Clash | Proposal | Confidence |
|---|---|---|---|
| X1 | Brief puts this file at repo root. CLAUDE.md says "Nothing new in the repo root" and time-bound plans go to `docs/superpowers/` with a `Status:` line. | File it as `docs/superpowers/SITE-WATCH-DISCOVERY-2026-11-24.md`. For now it sits in project files only. | 95% |
| X2 | Brief says commit on `localhost`. Project practice is that Claude never touches Luke's repo: it builds in the cloud on the chained tree and ships `.mbox` packs Luke applies with `git am`. | Keep the `.mbox` route. Commits are made on the chained tree, one logical change each, explicit `git add` paths, then packaged as file 101 onwards (numbering agreed with the expert grid thread). | 90% |
| X3 | Brief says "below 90 percent, stop and ask". CLAUDE.md says "say it out loud". | Follow the brief (stricter) for Site Watch. | 95% |

## 2. Answers to the ten discovery questions

### Q1. Cron pattern (confidence 90%)

- 29 crons in `vercel.json`, all `GET /api/cron/<name>`. Schedules are UTC.
- Auth: `assertCronSecret` (`lib/auth/assertCronSecret.ts`), `CRON_SECRET` as `x-cron-secret` or `Authorization: Bearer`. 401 otherwise.
- Every route sets `dynamic = "force-dynamic"`, `runtime = "nodejs"`, `maxDuration` (60 to 300) and most set `preferredRegion = ["syd1"]`.
- Switch first: `if (!(await isFeatureOn("<key>"))) return { skipped: "disabled" }`.
- Melbourne-time jobs run twice in UTC (for example `0 19,20 * * *`) and the route acts only in the right Melbourne hour (finance-run, codex-notifications).
- Time limit: the repo uses `maxDuration = 300` widely and in production. Hourly and five-minute crons exist, which Hobby does not allow, so the plan is Pro. Pro with Fluid compute allows up to 800 s, but I could not read the plan settings. I will design to 300 s, which is proven. (85% on the plan detail, 95% that 300 s is safe.)

### Q2. Fan-out (confidence 90%)

- The past 504 was C-143: one request composed every client and died on total time. Fix was a snapshot written by a cron.
- The proven queue pattern in the repo: an enqueue cron writes rows, a worker cron claims one row at a time with `FOR UPDATE SKIP LOCKED` and resets stuck rows (`reports-enqueue` / `reports-worker`, `on-demand-decks` every 5 minutes, `lib/reports/reportsWorkerStore.ts`).
- One site can exceed 300 s: 100 pages at 4 at a time with a 30 s timeout is up to 750 s in the worst case (typical 25 to 60 s).

Recommended pattern:

1. `site-watch-enqueue` cron at 6am Melbourne (`0 19,20 * * *`, Melbourne-hour gate) inserts one `site_watch_runs` row per enabled site, status `queued`. Idempotent per site per Melbourne date.
2. `site-watch-worker` cron every 5 minutes inside a window (`*/5 19-22 * * *`). Each call claims a run with `SKIP LOCKED`, works through its pages against a 240 s deadline, saves progress per page, and puts the run back to `queued` if pages remain. Then claims the next run while time remains. Stuck `running` rows older than 10 minutes go back to the queue.
3. A run is resumable because each page row records the run that last checked it.

Rough timing: 30 sites at about 40 s each is about 20 minutes of work, so 5 to 7 worker calls. Idle calls outside the morning return at once. No self-fetch fan-out.

### Q3. Supabase conventions (confidence 85%)

- Migrations: `db/migrations/NNNN_snake_name.sql`, AUTHOR ONLY, plus an applier copy in `sql/supabase/YYYY-MM-DD_NNNN_name_SUPABASE.sql`, a `migration_markers` row, a hand-synced mirror in `db/schema/*.ts`, a row in `db/README.md` and `DATA-MODEL.md`. Code does not read a new table until its marker exists (C-76).
- Next number: **0122**. Repo has 0119. The chain adds 0120 (file 94, client fee rates) and 0121 (file 99, above-plan reasons). Live markers stop at 0115, so 0116 to 0121 are not applied yet. Confirm with the expert grid thread before packaging, as it may claim more. (80%)
- RLS: every one of 118 public tables has RLS on (checked live). Staff-only tables use "RLS on, no policies, no `ava_readonly` grant". The app reaches them through the owner connection in server routes, which do their own auth. Site Watch tables follow that.
- `clients`: primary key `id` bigint identity. Tenant key `slug` (unique on `lower(trim(slug))`, 48 of 49 rows set). New tables should reference `clients.id` (FK) and show `slug` through joins, like `client_platform_accounts` and `web_kpis`. (90%)

### Q4. Where client website URLs live (confidence 95%)

- `clients.website` (text). Live: 49 clients, 46 not test, **35 with a website**, 11 without.
- Duplicates: `golf.com.au` is on 4 clients (Golf Australia, PGA Australia and both self-run), `penfolds.com/en-au/home` on 2. About 30 unique sites.
- `clients` has no active flag. "Active" needs a rule (see D4).
- Fireflies already parses a domain from it (`lib/fireflies/seedDomains.ts`, `domainFromWebsite`), which can be reused.

### Q5. Auth (confidence 90%)

- Roles are only `admin` and `client` (`lib/rbac.ts`). "Staff" means `admin`.
- Routes: `requireAdmin(req)` from `lib/requireRole.ts` (401 or 403). Pages: the internal nav manifest (`lib/nav/routeManifest.ts`, `NavRole "admin"`), same as `/pacing/admin`.
- Site Watch: admin only, with the 404-when-off guard first (Codex pattern, `codexFlagGuard`).

### Q6. Admin Features page (confidence 95%)

- One registry: `lib/features/registry.ts` (`FEATURE_DEFINITIONS`). Add an entry with `key: "site_watch"`, `area: "platform"`, `defaultOn: false`, `toggleRole: "admin"`, `source: "switch"`, `clientVisible` true (so nav can hide it), `owner: "Luke"`, and `requiresMarker: "0122_site_watch"` so it cannot be turned on before the migration is applied.
- Read with `isFeatureOn("site_watch")` (`lib/features/server.ts`). Set on `/admin/features`. No env var.

### Q7. Teams (confidence 85%)

- **No Teams posting exists in the app today.** No Workflows webhook, no `TEAMS_*` env, no Graph chat send. Codex notes "Teams messages after go-live". The Workflows webhook decision is not in the repo (it may live in the Codex plan outside the repo).
- So the brief's fallback (AV cron posts counts to a Teams Workflows webhook) is **not live**. It would be new: one secret env var holding the webhook URL. Internal email goes through SendGrid (`sendHtmlEmail`).
- "Patch Adams" is not in the repo. It is a scheduled Claude task on Luke's account, so its reads and writes are outside the codebase. I could not inspect it from here. The Microsoft 365 connector here does offer `teams_send_channel_message`.

### Q8. HTML parsing (confidence 85%)

- No HTML parser in production dependencies. `jsdom` is a dev dependency (tests only, too heavy for a function). `parse5` comes in only through jsdom. Playwright is not in the app; it stays out.
- Recommend adding **`cheerio`** (MIT). Reason: the per-site ignore selectors need real CSS selectors, and cheerio maps one to one onto the prototype's BeautifulSoup calls. Lighter option: `node-html-parser` (smaller, weaker selector support). Ponytail check: a new dependency is justified because regex HTML parsing would be fragile and unsafe here.
- Everything else uses built-ins: `fetch` with `AbortSignal.timeout`, `node:crypto` for hashes. Line diff is about 30 lines of our own code (LCS), so no `diff` package.

### Q9. Storage size (confidence 75%)

Assumptions: 30 sites, 100 pages, page text about 15 KB, outline about 4 KB, other fields about 2 KB.

| Store | Size | Growth |
|---|---|---|
| `site_watch_pages` (latest only) | 3,000 rows, about 60 MB raw, about 20 MB after TOAST compression | Flat. Updated in place (dead tuples cleared by autovacuum). |
| `site_watch_gtm_containers` | about 40 containers, 50 to 400 KB parsed each (RMIT has 514 tags), about 5 MB | Flat |
| `site_watch_changes` | steady state 50 to 300 rows a day at 1 to 5 KB (diffs capped at 40 lines) | under 1 MB a day, about 300 MB a year at the high end. First week noisier. |
| `site_watch_runs` | 30 rows a day | negligible |

Live database is 125 MB. Recommend **Supabase jsonb and text** for everything (D6). Blob only if a page body exceeds a cap (for example 200 KB of text, stored truncated with a flag). Revisit if the change log passes 1 GB.

### Q10. GTM container format (confidence 90% on what was seen, 70% that it stays stable)

Checked: Jayco `GTM-TJQF7V9` (v74, 89 tags), legalsuper `GTM-MN9SVT` (v43, 71 tags), RMIT `GTM-5DJRNQ` (v765, 514 tags). Challenger has no GTM (Adobe Launch only). RMIT runs both GTM and Adobe Launch.

Holds as described:
- `gtm.js?id=` returns a script with `var data = {` near the top. Bracket-matched, it parses as plain JSON.
- `data.resource` has `version`, `macros`, `tags`, `predicates`, `rules`. `version` is a string.
- Tags have `function` plus `vtp_*` parameters (for example `vtp_conversionId`, `vtp_conversionLabel`, `vtp_eventName`, `vtp_measurementIdOverride`, `vtp_tagId`, `vtp_html`, `vtp_hotjar_site_id`).
- The script is CORS-open and plain HTTP, so no browser is needed.

Different from the brief (the design must handle these):
1. **Extra top-level keys**: `runtime`, `entities`, `blob`, `permissions`, `sandboxed_scripts`, `security_groups`, `productSettings`. Ignore them.
2. **`tag_id` is positional** and changes between publishes. Exclude from the fingerprint, with any index.
3. **Paused tags** show as `function: "__paused"` with only `vtp_originalTagType` (for example `"html"`). Their settings are hidden. RMIT has 43, Jayco 12. Label "Paused <type>". Pausing or unpausing is a change in its own right.
4. **Trigger listeners appear in `tags`**: `__cl` (click), `__lcl` (link click), `__fsl` (form submit), `__hl` (history), `__tl` (timer), `__evl` (element visibility), `__sdl` (scroll depth), `__ytl` (YouTube). RMIT has 290 of these. They are not tags. Store them as listeners, count them, and do not alert on them at High.
5. **Firing rules are positional**: `rules` are `[["if", predicateIdx...], ["add", tagIdx...]]` (also `unless` and `block`). "Has firing rules" means some rule's `add` lists the tag's array index. That index is not stable, so it is used only to derive a yes or no, never in the fingerprint.
6. **Consent**: no tag in the three containers carries a built-in `consent` key. One community template had `vtp_consent`. Record consent fields when present, but expect most to be empty.
7. **Unknown codes seen** (reported raw, as the brief says): `__awcc`, `__awud` (Google Ads helpers), `__qpx` (Quora pixel), `__cegg` (Crazy Egg), `__img`, `__cvt_<id>` community templates.

Size: Jayco's script is 524 KB. RMIT's is larger. Fetch each container once per run.

## 3. Proposed plan

Built in phases, each phase reviewed by an independent reviewer and sent to Luke before the next. Each phase ships as `.mbox` file(s) with a PowerShell run pack (no `&&`, `git --no-pager`, `git am --keep-cr`).

**Phase 1: scan engine and data model.** Migration 0122 (five tables, one view, marker, RLS on, no policies, no `ava_readonly` grant). Switch `site_watch`. Pure TypeScript in `lib/siteWatch/`: `patterns.ts` (tracking regexes, one file), `severity.ts` (rules, one file), `extract.ts` (fields from 5.3 with cheerio), `diff.ts`, `sitemap.ts`, `robots.ts`, `scanSite.ts` (resumable, deadline-aware), `store.ts`. Enqueue and worker crons. "Blocked" detection (403 or challenge page) and "near-empty body" flag. Tests with saved HTML fixtures. No UI yet; results checked by SELECT.

**Phase 2: GTM inspection.** `lib/siteWatch/gtm/parse.ts` (bracket matcher, loud failure), `labels.ts` (type map, listeners split out, paused handled), `fingerprint.ts`. Fixtures from the three containers above.

**Phase 3: UI.** `/site-watch` overview, client site page, Tracking tab, acknowledge (single and group), admin settings with Run now, client hub panel, read-only Ava tool. Built with `PageShell`, `PageHeader`, `Section`, `data-table`, `StatusPill` and `lib/design/status.ts`, checked against `/design-system`. Scanned content always rendered as escaped text. Luke smokes before any UI commit is packaged.

**Phase 4: Teams.** View and `teams_reported_at` land in Phase 1. Luke creates the scheduled task. Fallback webhook only if D8 says so.

Things I'll need confirmed during build: migration number with the other thread; the exact Melbourne-hour helper to reuse.

## 4. Decision gates

The brief's D1 to D9, plus three that discovery surfaced (D10 to D12).

| Gate | Options | Recommendation | Confidence |
|---|---|---|---|
| D1 Where the scan runs | A. Vercel crons: enqueue plus 5-minute worker (above). B. External worker (GitHub Actions). | **A.** Same pattern as reports and decks, no new infra. | 90% |
| D2 Time and frequency | A. Daily 6am Melbourne. B. Twice daily for key pages. | **A.** Start daily. Add a key-page pass later if needed. | 90% |
| D3 Visibility | A. Admin only. B. Client view later. | **A.** | 95% |
| D4 Sites and pages | A. Every non-test client with `clients.website`, 100 pages, one site row per unique URL, linked to one owning client. B. Same, but only clients with a live campaign. | **A**, with a decision on shared sites: golf.com.au (4 clients) and penfolds (2). Proposal: one site, owned by Golf Australia and Penfolds, others see it through the hub panel. Also 11 clients have no website. | 80% |
| D5 Rendered scan | Now, later, never. | **Later**, after two weeks of Phase 1 data show which sites are JS-rendered or blocked. | 85% |
| D6 Page text storage | A. Supabase. B. Vercel Blob. | **A** (section Q9). | 85% |
| D7 Technology fingerprints | A. Hand-kept list of about 30 (Shopify, WordPress, Webflow, Adobe Launch, Tealium, OneTrust, Cookiebot, HubSpot, Intercom, Optimizely and so on). B. Bundle an open Wappalyzer fork. | **A.** The open forks carry mixed licences (several GPL-3.0) and are large. Revisit if the list grows past 100. | 80% |
| D8 Teams target | Team, channel, one channel or per client, voice. | Needs Luke. Suggest one internal channel for all clients, the AV voice (Australian English, dot points), and **no webhook fallback** at first: missed days show in AV as unreported rows. | 70% |
| D9 Critical email | A. Yes, via SendGrid to Luke. B. No. | **A**, Critical only, one email per run. | 80% |
| D10 What the reporter task can see (new) | A. The view holds metadata only: client, site, URL, category, field, severity, counts and short capped before and after (for example 200 characters) for titles and IDs. No page copy or tag HTML. B. Full rows. | **A.** Scanned copy can be written by anyone who can edit a client site, so it is a prompt injection path into a task that holds a Supabase connector with full database rights and a Teams send. | 90% |
| D11 How the task stamps `teams_reported_at` (new) | A. A `site_watch_mark_reported(ids bigint[])` function the task calls, so its only write is a narrow function call. B. Plain UPDATE through the connector. | **A.** The Supabase connector uses Luke's personal access token and bypasses RLS, so the prompt is the only guard on writes either way. A function at least keeps the documented write narrow. | 80% |
| D12 Where this brief and its rules live in the repo (new) | See section 5. | **Answered 24 Nov: rules in CLAUDE.md, brief and discovery in docs/superpowers.** | |

## 5. "How we operate": adding the brief's rules to the repo

Most of section 3 of the brief is already law in `CLAUDE.md` and `BRANCHING.md` (localhost trunk, switches on the Admin Features page, Conventional Commits, verify schema, staff tenant checks). New or stricter items:

- A confidence percentage on every diagnosis and recommendation; below 90%, stop and ask.
- Decision gates presented with options and a recommendation; never accept a default for Luke.
- Discovery file before build; no build until approved.
- One phase review by an independent reviewer before the next phase.
- `npm run test:all` once at the end of each phase; small targeted tests per step.
- PowerShell only in anything handed to Luke (no `&&`, `grep`, `jq`).
- `git add` by explicit path only.
- No browser smoke by Claude; Luke smokes UI before it is committed.
- Reuse the shared signing secret (`APP_SIGNING_SECRET` with a new `SigningPurpose`) for machine-to-machine calls.

Recommendation: add these as a short "Working rules" block in `CLAUDE.md` (they apply to every feature, not just Site Watch), and file the brief itself as `docs/superpowers/BRIEF-site-watch-2026-11-24.md` with a `Status:` line. One small docs-only commit, shipped as its own `.mbox`. (85%)

## 6. Risks found

- **Bot protection is untested.** I could not fetch client sites from Vercel's network. Phase 1's first step is a dry probe of all ~30 sites (one fetch each, no writes) to list who returns 403 or a challenge page.
- **Adobe Launch sites** (Challenger, RMIT) only get presence detection. Their tags are invisible to this method.
- **Latest production deploy is in ERROR** (the known out-of-memory build from 23 Nov, `NODE_OPTIONS` fix pending). Not a Site Watch issue, but Site Watch cannot go live until deploys are healthy.
- **Migration backlog**: live is at 0115; 0116 to 0121 are queued. 0122 must be applied after them.
- **Section 5.3 visible-copy** on JS-rendered sites will be near empty. Flag, don't alert.
