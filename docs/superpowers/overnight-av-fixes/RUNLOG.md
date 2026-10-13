# AV overnight, Night 2

## Morning summary (AV-Z, 9 Oct 2026, Australia/Sydney)

HEAD before this commit is f7ee22fc. Nothing pushed. Night 2 AV-00 parked with a dirty tree and ran no baseline, so these checks are compared with the Night 1 AV-Z result (121/124, three named suites). The Night 1 summary below still says Night 2 was not started. That line is the Night 1 record. This section is the Night 2 record.

| ID | Result | Hash |
|---|---|---|
| AV-X4 | DONE | no commit |
| AV-M10f | DONE | 989070a8 |
| AV-00 | PARKED | no commit |
| AV-I1 | DONE | a45ad177 |
| AV-I2 | DONE | da3756bf |
| AV-I3 | DONE | 75d8d20e |
| AV-I4 | DONE | 88574499 |
| AV-I5 | DONE | 8cd6d64a |
| AV-I6 | DONE | 55ec0a1c |
| AV-A1 | DONE | 9e70ccd8 |
| AV-A2 | DONE | 9130d5d1 |
| AV-A3 | DONE | 7ac409f1 |
| AV-A4 | DONE | fa62e7c2 |
| AV-A5 | DONE | 7bcc686f |
| AV-A6 | DONE | d8ac482f |
| AV-A7 | DONE | 221b2760 |
| AV-A8 | DONE | 9de9916f |
| AV-A9 | PARKED | no commit |
| AV-R1 | DONE | fe9ae287 |
| AV-R2 | DONE | 92e61793 |
| AV-R3 | DONE | 73f47fd9 |
| AV-R4 | DONE | d2cadb08 |
| AV-R5 | DONE | b63eea91 |
| AV-R6 | DONE | de83957c |
| AV-R7 | DONE | 7ef667c6 |
| AV-G2 | DONE | 23735bb5 |
| AV-G3 | DONE | f7ee22fc |
| AV-Z | DONE | this commit |

F4, F5, F6a, F6b, M10a to M10e and the X3 series were already DONE before the Night 2 preflight. They are in the log under the Night 1 summary. They are not repeated in this table.

Parked patches: none. AV-00 changed no product files (dirty tree, baseline not run). AV-A9 changed no files (KPI gap, do not un-park).

Decisions waiting for Luke:

- AV-A9 / C-153. Do not switch `generate_performance_report` onto the v5 deck until this gap is accepted or dropped: CPM, CPC, snapshot CTR, 3-second video views, and the spend-pace percent box. The token template stays.
- Apply these by hand in the SQL editor. Do not apply the Drizzle snapshot files named beside them.
  - `db/migrations/0093_overdue_digest_sends.sql`. Not `db/drizzle/0010_gifted_ben_parker.sql`.
  - `db/migrations/0094_campaign_insights_action_outcome.sql`. Not `db/drizzle/0011_acoustic_shinko_yamashiro.sql`.
  - `db/migrations/0095_report_runs.sql`. Not `db/drizzle/0012_wild_firelord.sql`.
  - Night 1 `db/migrations/0092_revoke_published_pointer_fn_execute.sql` is applied (8 Oct 2026, Claude). Supabase migration history checked 9 Oct 2026.
- The Night 1 money questions are already in the code. C-155: full-scope Total Ex GST includes client-pays net media. Billing months exclude it. The agency still bills the fee. C-156 (`c1e7d75c`): cinema Avg. Rate is gross divided by screens. Biddable CPM still multiplies by 1000.
- `test:mba-live-dates` is a new failure on HEAD. See the checks below. It was not fixed in this wrap-up.

Migrations authored tonight: `0093_overdue_digest_sends.sql`, `0094_campaign_insights_action_outcome.sql`, `0095_report_runs.sql`. All three applied 9 Oct 2026 (Claude, Supabase MCP). `0090` and `0091` are applied. Supabase migration history checked 9 Oct 2026. They were not part of tonight's prompt list.

Env vars introduced, and their defaults:

- `CLIENT_INVOICES_ENABLED`. Unset is off. `on`, `1` or `true` turns client-role invoice access on. Admins are unaffected.
- `OVERDUE_DIGEST_ENABLED`. Must be exactly `true` or the digest does not send.
- `AUTO_REPORTS_ENABLED`. Must be exactly `true` or enqueue and the worker return skipped.
- `REPORTS_EMAIL_TO`. Optional. Unset uses the ops recipient list.
- `REPORTS_WORKER_BATCH`. Default 3.

`vercel.json` crons added:

- `/api/cron/overdue-digest` at `30 1 * * 1-5` (01:30 UTC, weekdays, plus a Sydney Saturday and Sunday skip in the route).
- `/api/cron/reports-enqueue` at `5 20 3,4 * *` (Sydney 4th and 5th).
- `/api/cron/reports-worker` at `20 * 3-5 * *`.

Do not run either report cron, and do not send the overdue digest, until the matching migration is applied and the flag is exactly `true`.

Wrap-up checks. Night 2 AV-00 ran none of these.

- `npm run typecheck` exit 0.
- `npm run lint` exit 0. Same pre-existing warning set.
- `npm run check:client-server-only` exit 0.
- `npm run test:all` exit 1, about 945s, 123/124 suites.
  - Fixed versus the Night 1 baseline: `test:finance-sections` (route manifest is clean, so the `/design-system` exclusion is on HEAD).
  - Fixed only in the dirty working tree, not on HEAD: `test:campaign-dashboard-range` (`SpendChartsRow.test.tsx.snap` is modified and uncommitted) and `test:social-delivery` (`channelMediaTypeColour.test.ts` is modified and uncommitted). A clean checkout of HEAD would still be expected to fail those two colour suites.
  - New failure: `test:mba-live-dates`. It passed in the Night 1 AV-00 log. Two source pins fail. Edit save-time upload must call `generateMbaPdfBlob({ planVersion: planVersionForDocs })`. Create must contain that same call and must not contain `liveCampaignDates`. Edit Generate now calls `generateMbaPdfBlob({ liveScope: true })`. Create `handleGenerateMBA` calls `generateMbaPdfBlob()` with no arguments. Those two pages are clean versus HEAD, so the failure is committed. 19 of 21 tests in the file still pass.
- `npm run build` exit 0, about 419s. Next.js 15.5.24. Compiled with the existing Auth0 dpop and jose Edge warnings. `/admin/reports` is in the route table.

Morning smoke, in run order. None of this was exercised in the browser tonight. Do not send email from here.

1. Create and edit a plan. Every container renders and saves. Naming conventions still downloads. The draft media plan still downloads. (AV-X4)
2. A TV line set to bonus with a budget: the investment chart shows $0. A normal radio line: the chart total equals the entered budget (gross-in) or budget plus fee (net-in). (AV-M10f)
3. `/finance/xero` as admin: unlinked contacts, link one, coverage rises. A non-admin call to the link API is 403. (AV-I1)
4. Admin download of any invoice PDF from Owed still works. (AV-I2)
5. Admin `GET /api/dashboard/<slug>/invoices` for a linked client returns rows. A client user with the flag off gets 404. (AV-I3)
6. Admin on `/dashboard/<linked client>`: Invoices section with PDFs. The slide-over shows outstanding. Check light and dark. (AV-I4)
7. Admin on a client with an overdue invoice: read the banner copy. (AV-I5)
8. After 0093 is applied and `OVERDUE_DIGEST_ENABLED=true`: trigger the cron with the secret on a preview. One email. A second call is already sent. (AV-I6)
9. AVA "Write commentary" on a campaign: summary, then Insight, Action, Outcome. (AV-A1)
10. AVA review-and-report style chat: those labels, no old colours. (AV-A2)
11. AVA "how is this campaign going?": the three labels. (AV-A3)
12. After 0094 is applied: `/insights` loads. Tags are sky, forest and lime. Old insights are unchanged. (AV-A4, AV-A5)
13. Open the v5 pptx. Review and Report on a live campaign: v5 look, then the commentary not-generated line, then two campaigns with 2 to 4 traceable items and new `/insights` rows. (AV-A6, AV-A7, AV-A8)
14. Do not expect a performance-review download to be the v5 deck. AV-A9 is parked. (AV-A9)
15. After 0095 is applied: Review and Report still downloads the same deck. Do not run enqueue or the worker until 0095 is applied. (AV-R1, AV-R2, AV-R4, AV-R5, AV-R6)
16. After 0095 is applied: `/admin/reports` for last month, Generate now on one live MBA, then download. The page will fail until 0095 is applied. Generate now does not send email. (AV-R7)

`git log --oneline -40` at HEAD f7ee22fc, before this commit:

```
f7ee22fc docs(brain): record the AV pack: money, workbook, invoices, AVA and reports
23735bb5 chore(gate): ratchet inline money maths outside lib/money
7ef667c6 feat(reports): admin reports page with download and generate now
de83957c feat(reports): monthly digest email of generated campaign reports
b63eea91 feat(reports): hourly worker generates queued campaign reports on the 4th and 5th
d2cadb08 feat(reports): monthly enqueue of campaign reports for live MBAs
73f47fd9 feat(email): attachments and reply-to in the SendGrid helper
92e61793 feat(reports): headless campaign report generator with server-resolved inputs
fe9ae287 feat(reports): report_runs and report_digest_sends tables
9de9916f feat(reports): AVA writes Insight, Action, Outcome commentary for campaign reports
221b2760 feat(reports): campaign report deck on the 05b v5 template
d8ac482f chore(reports): add the 05b v5 deck template and its layout map
7bcc686f feat(insights): cards show Insight, Action and Outcome tags
fa62e7c2 feat(insights): store action, owner and outcome with each insight
7ac409f1 feat(ava): voice rule for Insight, Action, Outcome
9130d5d1 feat(ava): report, presentation and campaign read skills on I/A/O and the 05b brand
9e70ccd8 feat(ava): insight commentary skill 1.2.0 writes Insight, Action, Outcome
55ec0a1c feat(finance): weekday overdue invoices digest email to ops
8cd6d64a feat(dashboard): factual overdue notice for clients with overdue invoices
88574499 feat(dashboard): invoices section on the client dashboard
75d8d20e feat(finance): client invoices API scoped to the client, FY26 onwards
da3756bf fix(finance): one invoice client resolver, strict for client access
a45ad177 feat(finance): unlinked Xero contacts panel to link contacts to clients
989070a8 fix(plans): legacy container investment charts use the shared money helper
f796ad23 docs: record the AV-M10e commit hash in the overnight runlog
b0667199 fix(plans): search and prog investment charts honour gross-in budgets
8de60459 docs: record the AV-M10d commit hash in the overnight runlog
f1fad989 refactor(plans): offline container summaries and header use canonical totals
7708a053 docs: record the AV-M10c commit hash in the overnight runlog
56df1206 refactor(plans): digital container summaries and header use canonical totals
9ad17f43 docs: record the AV-M10b commit hash in the overnight runlog
7a23d821 refactor(plans): card cells and titles show canonical line totals
115ee130 docs: record the AV-M10a commit hash in the overnight runlog
3758226c refactor(plans): expert grid footer totals in cents from lineTotals
b7992d51 docs: record the AV-F6b commit hash in the overnight runlog
54daea77 fix(excel): blank burst dates use the campaign dates with a note, never today
5e031a93 docs: record the AV-F6a commit hash in the overnight runlog
5d33c03e feat(plans): publishing needs a start and end date on every burst
7754a910 docs: record the AV-F5 commit hash in the overnight runlog
ff0853f8 test(money): F8 production fixture matches the saved production shape
```

# AV overnight — Night 1

## Morning summary (AV-Z, 2026-10-07 23:54 Australia/Sydney)

HEAD e951dfd1. Nothing pushed. Night 2 was not started.

| ID | Result | Hash |
|---|---|---|
| AV-00 | DONE | no commit |
| AV-E1 | DONE | 03d3a750 |
| AV-E2 | DONE | 0e272c83 |
| AV-E3 | DONE | 7445ad2b |
| AV-E4 | DONE | 11497c9c |
| AV-E5 | DONE | 7040f766 |
| AV-M1 | DONE | 3bcbc4b1 |
| AV-M2 | DONE | 8624789a |
| AV-M3 | DONE | 6ec337fd |
| AV-M4 | DONE | 3d150b67 |
| AV-M5 | DONE | 74bd964b |
| AV-M6 | DONE | 859d02d3 |
| AV-M7 | DONE | 1f6d8900 |
| AV-M8 | DONE | a5e8daf0 |
| AV-M9 | DONE | 23331ea5 |
| AV-M10 | PARKED | no patch |
| AV-M11 | DONE | 25cd9641 |
| AV-M12 | DONE | 822c31dd |
| AV-M13 | DONE | 0e83f101 |
| AV-X1 | DONE | d5884586 |
| AV-X2 | DONE | 8bfdd2e3 |
| AV-X3 | PARKED | no patch |
| AV-X4 | not started | needs AV-X3 |
| AV-X5 | DONE | 5caeea75 |
| AV-X6 | DONE | 8ab298c4 |
| AV-X7 | DONE | 9136e468 |
| AV-G1 | DONE | e951dfd1 |
| AV-Z | DONE | no commit |

Parked patches: none. AV-M10 and AV-X3 changed no files.

Decisions for Luke:

- Full-scope Total Ex GST includes client-pays net media (delivery media). Billing months use media amount, which is 0 for those lines. See AV-X6 and the F3 golden todo.
- Cinema Avg. Rate is (gross media / screens) times 1000. A cost per screen would drop the times 1000. See AV-X7.
- F8 golden todos: production sits in lineTotals media but outside gross media; the workbook Total row months are $2,000 short of Total Ex GST on the production fixture; ad serving on two 100,000 CPM lines at $2.50 is $5,000 in financials and $500 from computeAdServingCost.
- Burst dates that fail the YYYY-MM-DD parser still fall back to today inside the gantt. Header campaign dates no longer do. See AV-X7.
- AV-M8 left lib/generateBillingSchedulePDF.ts because a sample-export script still imports it.
- AV-M10: container display totals were not switched to lineTotals. Display and save maths could not be separated at 90%.
- AV-X3: the wizard Published Media Plan button still builds the workbook in the browser. AV-X4 stays blocked.

Migrations authored, not applied:

- db/migrations/0092_revoke_published_pointer_fn_execute.sql

Env vars introduced: none.

Wrap-up checks against the AV-00 baseline:

- typecheck exit 0.
- lint exit 0. Same warning set.
- check:client-server-only exit 0. Fixed (was exit 1).
- test:all exit 1, about 514s, 121/124 suites. Failed: test:campaign-dashboard-range, test:social-delivery, test:finance-sections. Fixed versus baseline: test:client-server-only. finance-sections still fails only because /design-system is uncovered (privacy and data-deletion are now exclusions). The two colour snapshot failures are unchanged. No new failing suite. Suite count grew because new scripts were added.
- npm run build exit 0.

Morning smoke, in run order:

1. Signed out: /privacy and /data-deletion load. Signed in: sidebar unchanged.
2. Create a plan: publisher, channel and site dropdowns populate. Edit a plan: the same.
3. Next 08:00 AEDT pacing-portfolio run finishes under 240s and logs per-source timing. /pacing overview loads today's snapshot.
4. After 0092 is applied: publish a plan version and confirm it still stamps.
5. Save and publish an unchanged plan: the MBA PDF total matches, unless a line sits on an exact half cent.
6. Finance: a negative invoice or credit stays negative. Billing schedule: typing -100 saves -100.
7. A live social, search and programmatic campaign: CPM, CPC and CTR match yesterday, CTR shown as a percent once. Zero impressions shows a dash.
8. A campaign that started mid-month: the strip planned total equals the plan media total. Expected to date is close to budget times the elapsed share.
9. A live plan with a fee: "behind by" is smaller by about the fee share. The total investment tile is unchanged.
10. Finance forecasting for the current FY: plans with schedules stay put. Note any client that moves by more than 1% on the fallback.
11. An old search or social plan with no saved fee total: the fee shown equals the MBA fee.
12. Create a plan with TV, digital display and search: containers render and totals show.
13. Draft and published media plans for the same unchanged plan, compared side by side.
14. Regenerate documents for a published plan with ad serving. Excel Ad Serving equals the MBA PDF.
15. Draft media plan with production: Total row months add up to Total Ex GST.
16. AA media plan with a client-pays line: section totals equal the AA MBA block. Then decide the Total Ex GST question.
17. Download any media plan before 11am: Plan Date is today.
18. Read the AV-G1 todos. Do not treat them as fixed.

```
e951dfd1 test(money): golden fixtures that every money surface must agree on
9136e468 fix(excel): Sydney plan date, single budget format and AA GST via addGst
8ab298c4 fix(excel): client-pays rows show net media and AA rows match AA totals
5caeea75 fix(excel): totals row months include production and every burst month
8bfdd2e3 fix(docs): published media plan carries the persisted ad serving
d5884586 feat(docs): one media plan workbook builder for draft and published files
0e83f101 fix(finance): campaign financial totals sum per-line cents
822c31dd fix(billing): ad serving rounds per month and month totals sum their parts
25cd9641 fix(plans): create builds the line fee snapshot like edit
23331ea5 feat(money): lineTotals and campaignTotals on the canonical burst maths
a5e8daf0 chore(money): delete dead burst closures, billing schedule PDF and day helpers
1f6d8900 fix(plans): legacy fee estimate on edit follows the gross fee rule
859d02d3 fix(finance): forecast fallback uses canonical burst amounts and proration
74bd964b fix(spend): compare delivered spend with expected media only
3d150b67 fix(spend): prorate partial months once in the monthly plan calendar
6ec337fd feat(money): one rate module for CPM, CPC, CPV, CTR and CPA
8624789a feat(money): one sign-safe money parser for lib and API code
3bcbc4b1 feat(money): one cents module with half-up rounding for runtime code
7040f766 chore(db): revoke API execute on the published-pointer trigger function
11497c9c fix(pacing): bound the portfolio cron with a time budget and per-source timeouts
7445ad2b test: skip c1 full-scope drift cases without DATABASE_URL
0e272c83 fix(client-graph): keep referenceTables out of the plan editor bundle
03d3a750 fix(nav): list the public legal pages as manifest exclusions
6628cf39 docs(design): overnight DS-6 to DS-10 run log
09ae59b7 chore(ui): retire dead design code, legacy palettes and old brand assets (DS-9)
8a16677a feat(charts): one chart theme, restyled system charts, charts in /design-system (DS-10)
f631910c feat(exports): brand fonts, colours and logo in PDF, Excel and email (DS-E)
12202faf feat(ui): status debt, tables and flat utilities (DS-8d)
a5cda8b6 feat(ui): page passes - remaining routes (DS-8c)
ddf90cb1 feat(ui): page passes - plans, pacing and finance (DS-8b)
f528a067 feat(ui): page passes - heroes and dashboards (DS-8a)
cba5538f feat(ui): brand shell, sidebar lime pill, logo, favicon, sign-in page and loading states (DS-7)
e9215699 feat(ui): client and publisher colour only on their mark (DS-6)
eaee04fb feat(ui): seven channel families, neutral media pills, brand chart palette (DS-5)
a11b31e2 feat(ui): every status map reads lib/design/status (DS-4b)
082b500c feat(ui): one status tone system - tokens, badge tones, status module (DS-4a)
8e2630b3 feat(ui): DataTable with sort, sticky header and CSV; one header style (DS-3c.1)
64d1f68c style(ui): visible card hover border (DS-3b.1)
712f0fcb feat(ui): page header, section, shell and nav chip patterns (DS-3b)
bccfe70b style(ui): remove card hover lift and shadow (DS-3a.1)
6473a4a8 style(ui): 05b primitives - pill buttons, flat cards, table header (DS-3a)
bcb1ab51 feat(brand): single brand source, parity test and colour lint guard (DS-2)
6768f434 style(brand): 05b token values and fonts (DS-1)
662bf99b chore(gate): drop main-only Xano lists now severance is on main
3341ada7 fix(files): plan downloads go through servePlanFile, not Xano
b1ed1cf5 test(codex): import the flag-auth help constant as repo.js
4456c35d docs(brain): codex recurring and help rules
2662e3ea docs(brain): mark 0078 help columns applied
70b44d66 feat(codex): tasks search, filters, board, inbox, and recurring
a793d9d4 test(codex): export HELP_ON_DONE_MESSAGE from the flag-auth repo mock
bf0661c8 feat(migration): XS-3 copy vault plan files to Blob
096e54d8 chore(gate): block unscoped version reads and runtime Xano crawls
5bba3333 perf(pacing): read only the version columns pacing uses
82b0bdd9 feat(legal): public data deletion instructions page
f060ff52 chore(xano): drop ops-health Xano check and dead plan crawls
849eb81d feat(legal): public privacy policy at /privacy
99167aca fix(dashboard): delivered tile reports partial sources instead of short totals
```

Date: 2026-10-07. Started 22:26 Australia/Sydney.
Branch: localhost.
HEAD: 6628cf39d8a29b01b8dd7be241d4f34ac9b5b7c8
Node: v24.14.1

DS overnight gate: `docs/superpowers/overnight-2026-10-08/RUNLOG.md` summary shows DS-6, DS-7, DS-8, DS-E, DS-10 and DS-9 all DONE, none parked, wrap-up present. Working tree had no modified tracked files (untracked discovery files only).

## AV-00 baseline

- `npm run typecheck` PASS, exit 0.
- `npm run lint` PASS, exit 0. Same warning set as the DS wrap-up (react-hooks/exhaustive-deps, unused eslint-disable, AppSidebar img).
- `npm run check:client-server-only` FAIL, exit 1. Sink `lib/data/referenceTables.ts` reached from `app/mediaplans/create/page.tsx` via `lib/api.ts` dynamic-webpackIgnore.
- `npm run test:all` FAIL, exit 1, 117/121. Elapsed about 485s.

Known on 7 Oct that did not fail tonight: `test:c1-fullscope-drift` PASS (exit 0, 22392ms). `DATABASE_URL` is set through `.env.local`, so the script ran instead of exiting on the missing-URL message.

Failures (baseline, do not treat as new):

- `test:client-server-only` — same sink as `check:client-server-only`.
- `test:campaign-dashboard-range` — `SpendChartsRow` snapshot (`components/dashboard/campaign/__tests__/SpendChartsRow.test.tsx`).
- `test:social-delivery` — distinct media-type hexes (family colours collide).
- `test:finance-sections` — `routeManifest.test.ts` uncovered `/design-system`, `/data-deletion`, `/privacy`.

```
suite                                 result  exit  ms
test:billing-line-id-match            PASS       0      2030
test:client-server-only               FAIL       1      1581
test:brand                            PASS       0       891
test:status                           PASS       0       798
test:media-families                   PASS       0       762
test:charts-registry                  PASS       0      2289
test:format-money                     PASS       0      1212
test:planned-to-date                  PASS       0      2279
test:client-dashboard-range           PASS       0      3543
test:campaign-read                    PASS       0      4541
test:ava-skills                       PASS       0       977
test:campaign-dashboard-range         FAIL       1      5947
test:delivery-ui                      PASS       0      2817
test:search-delivery-tiles            PASS       0       999
test:social-delivery                  FAIL       1      1444
test:programmatic-delivery            PASS       0      1716
test:solver                           PASS       0       793
test:utm                              PASS       0       719
test:weekly-gantt                     PASS       0      2670
test:week-starts-on                   PASS       0      2258
test:expert-mappings                  PASS       0      1965
test:expert-goldens                   PASS       0      2229
test:expert-paste                     PASS       0      1394
test:expert-grid-selection            PASS       0      3661
test:spreadsheet                      PASS       0       727
test:finance-forecast                 PASS       0      2159
test:retained-commission              PASS       0       761
test:deliverable-budget               PASS       0       802
test:editor-line-inputs               PASS       0      2861
test:finance-filters                  PASS       0       857
test:finance-derive                   PASS       0      5559
test:billing-divergence               PASS       0      2459
test:billing-seed-fees                PASS       0      1867
test:billing-fee-drift                PASS       0      2853
test:kpi-resolve                      PASS       0       814
test:kpi-percent-units                PASS       0       971
test:kpi-writes                       PASS       0      1467
test:kpi-review                       PASS       0      2709
test:kpi-backfill                     PASS       0       833
test:pacing-maths                     PASS       0       907
test:pacing-portfolio                 PASS       0      5296
test:pacing-channel                   PASS       0      4763
test:pacing-detail                    PASS       0      4480
test:pacing-scenario                  PASS       0      3699
test:pacing-relabel                   PASS       0      6449
test:pacing-plan-lines                PASS       0       783
test:unmapped-placements              PASS       0       837
test:partner-ingest                   PASS       0      2205
test:ava-tools                        PASS       0      7950
test:ava-chat-ui                      PASS       0      2491
test:ava-autopopulate                 PASS       0      2254
test:ava-detect-goldens               PASS       0      1991
test:db-drift                         PASS       0       725
test:forecast-targets                 PASS       0      2389
test:write-kpi                        PASS       0      1734
test:line-item-snapshot-parity        PASS       0      1776
test:xero                             PASS       0      6560
test:finance-periods-flag             PASS       0       865
test:inline-schedule-amount           PASS       0      2958
test:line-item-attrs                  PASS       0      1555
test:shadow-diff                      PASS       0       789
test:mba-plan-detail                  PASS       0      2095
test:mba-number-alloc                 PASS       0      2052
test:channel-line-item-routes         PASS       0      1140
test:tenant-isolation                 PASS       0      3718
test:match-text                       PASS       0       781
test:approvals                        PASS       0      3324
test:write-clients                    PASS       0      1657
test:write-reference                  PASS       0      1730
test:mba-header-date                  PASS       0      3501
test:mba-scope                        PASS       0      3340
test:mba-media-breakdown              PASS       0      2902
test:derive-approved-slice            PASS       0      2825
test:live-mba-scope                   PASS       0       733
test:mba-live-dates                   PASS       0      3432
test:finance-schedule                 PASS       0      2991
test:finance-sections                 FAIL       1      7144
test:approved-slice                   PASS       0      2368
test:c1-fullscope-drift               PASS       0     22392
test:save-plan                        PASS       0     69655
test:write-billing-overrides          PASS       0     10857
test:write-finance                    PASS       0     10338
test:mb13-fee-override-publish        PASS       0      9733
test:mb15c-published-immutable        PASS       0     14790
test:vc2a-published-immutable         PASS       0      9568
test:vc2b-working-draft               PASS       0     11275
test:dirty-controller                 PASS       0      2352
test:write-media-plan-masters         PASS       0      4731
test:xano-mirror                      PASS       0      1011
test:campaign-documents               PASS       0      8441
test:media-plan-excel                 PASS       0      2508
test:campaign-row-actions             PASS       0      2845
test:postgres-save-mode               PASS       0      4182
test:session-expiry                   PASS       0      3580
test:plan-drafts                      PASS       0      5540
test:codex-flag-auth                  PASS       0      2659
test:codex-stage0-guarantees          PASS       0      8601
test:codex-stage1-detail              PASS       0     11326
test:codex-task-detail-ui             PASS       0      2022
test:codex-stage1-scope               PASS       0     10055
test:codex-stage1-templates           PASS       0     11203
test:codex-auth0-roster               PASS       0       905
test:dashboard-vc15-tip               PASS       0      1037
test:clients-fail-soft                PASS       0       809
test:m365-site-url                    PASS       0       742
test:m365-graph                       PASS       0       766
test:m365-reconciliation              PASS       0       747
test:myhours                          PASS       0      1237
test:fireflies                        PASS       0      3807
test:performance-report-insights      PASS       0      1621
test:insights-library                 PASS       0      2231
test:empty-channel-defaults           PASS       0       709
test:line-item-panels                 PASS       0      2086
test:line-item-panel-flights          PASS       0      2594
test:publisher-profiles               PASS       0      2202
test:ingest-propose                   PASS       0      2774
test:ingest-review                    PASS       0     21502
test:ingest-eval                      PASS       0      2998
test:ooh-expert-gate                  PASS       0       765
test:ooh-standard-bench               PASS       0      1790
test:specs                            PASS       0      2125
```

## AV-00 DONE (no commit)

Gate passed. Night 1 continues at AV-E1.

## Tonight, in order

| ID | Needs |
|---|---|
| AV-00 | nothing |
| AV-E1 | AV-00 |
| AV-E2 | AV-00 |
| AV-E3 | AV-00 |
| AV-E4 | AV-00 |
| AV-E5 | AV-00 |
| AV-M1 | AV-00 |
| AV-M2 | AV-M1 |
| AV-M3 | AV-M1 |
| AV-M4 | AV-00 |
| AV-M5 | AV-M4 |
| AV-M6 | AV-M1 |
| AV-M7 | AV-M1 |
| AV-M8 | AV-00 |
| AV-M9 | AV-M1 |
| AV-M10 | AV-M9, AV-M8 |
| AV-M11 | AV-M9 |
| AV-M12 | AV-M1 |
| AV-M13 | AV-M1, AV-M12 |
| AV-X1 | AV-M1 |
| AV-X2 | AV-X1 |
| AV-X3 | AV-X1, AV-X2 |
| AV-X4 | AV-X3 |
| AV-X5 | AV-X1 |
| AV-X6 | AV-X1 |
| AV-X7 | AV-X1 |
| AV-G1 | AV-M4, AV-M5, AV-M9, AV-M12, AV-M13, AV-X1, AV-X2, AV-X5, AV-X6 |
| AV-Z | end of night |

## AV-E1 DONE

- Commit: 03d3a750 fix(nav): list the public legal pages as manifest exclusions
- Files: lib/nav/routeManifest.ts
- Tests: typecheck 0, lint 0, routeManifest + test:finance-sections exit 1
- The finance-sections failure is the AV-00 baseline narrowed to one page: /design-system. /privacy and /data-deletion are covered. Admin sidebar tests passed. Not added to any menu.
- Confidence: 95%. Public error pages sit in the manifest; legal pages are exclusions, matching the prompt's reason and the exclusion comment.
- Morning smoke: signed out, /privacy and /data-deletion load. Signed in, sidebar unchanged.

## AV-E2 DONE

- Commit: 0e272c83 fix(client-graph): keep referenceTables out of the plan editor bundle
- Files: lib/api.ts
- fetchMediaDetail now checks the browser-safe isReferenceTablePath, then dynamically imports the already-allowlisted readReferenceMediaDetail and returns body. The "No Postgres media-details handler" error is unchanged. Create and edit both reach this only through lib/api.ts.
- Tests: typecheck 0, lint 0, check:client-server-only 0, test:client-server-only (same script) 0, test:postgres-save-mode 0 (238 pass, 20 skip), test:plan-drafts 0.
- Confidence: 95%. The allowlist already named readReferenceMediaDetail; the leak was the unlisted referenceTables import.
- Morning smoke: create a plan, reference dropdowns populate. Edit a plan, same.

## AV-E3 DONE

- Commit: 7445ad2b test: skip c1 full-scope drift cases without DATABASE_URL
- Files: scripts/c1-fullscope-drift.ts
- When DATABASE_URL is empty the script prints "SKIP: DATABASE_URL not set" and exits 0. There are no pure checks that run before the database loop; csvEscape, isSlice and toLineInputs only run inside it.
- With DATABASE_URL set (loaded from .env.local) the script still runs the report and exits 0. Verified the skip by spawning node with an explicit empty DATABASE_URL, because PowerShell drops empty env vars before npm.
- Tests: typecheck 0, lint 0, test:c1-fullscope-drift 0 (full run and skip run).
- Confidence: 95%.
- Morning smoke: none.

## AV-E4 DONE

- Commit: 11497c9c fix(pacing): bound the portfolio cron with a time budget and per-source timeouts
- Files: app/api/cron/pacing-portfolio/route.ts, lib/pacing/portfolio/loadPortfolioChannelSources.ts, buildCampaignPacingRows.ts, buildAndStorePortfolioSnapshot.ts, servePortfolioSnapshot.ts, lib/pacing/portfolio/__tests__/composeChannelSources.test.ts
- Step map: cron GET (maxDuration 300, schedule 0 21 * * * UTC) -> buildAndStorePortfolioSnapshot -> Promise.all of loadPortfolioChannelSources (search, social, programmatic, ad serving, direct, each getCached* then a Snowflake fetch) and readPublishedOrLivePlanVersions (Postgres) -> assembleCampaignPacingRows -> upsert. Snowflake statements already time out at 60s (lib/snowflake/pool.ts STATEMENT_TIMEOUT_IN_SECONDS). There was no request-level ceiling, so pool wait, a warehouse resume, or several statements in one source could run to the 300s wall.
- Guard: 240s from request start, 90s per source. A timed-out channel contributes no rows and is logged. Connecting is a display state for a loaded channel with no facts, not a fetch-partial flag, so it was not reused. A timed-out versions read throws and stores nothing, because empty schedules would change expected spend. One log line: event pacing_portfolio_source_timing.
- Weekends: no weekday check in lib/pacing or the cron. The schedule is every day. The 26-28 Sep and 3-4 Oct gaps are not an intentional skip. Not changed.
- Root cause of the 7 Oct 300s run is under 90%. Guard only.
- Tests: typecheck 0, lint 0, test:pacing-portfolio 0 (24 + 7).
- Confidence on the guard: 90%.
- Morning smoke: next 08:00 AEDT run finishes under 240s and shows the per-source timing line. /pacing overview loads today's snapshot.

## AV-E5 DONE

- Commit: 7040f766 chore(db): revoke API execute on the published-pointer trigger function
- Files: db/migrations/0092_revoke_published_pointer_fn_execute.sql, docs/brain/DATA-MODEL.md
- Function is RETURNS trigger (0069). No app or lib caller. No Drizzle change.
- Tests: typecheck 0, lint 0. check:drizzle-snapshot exits 1 on pre-existing snapshot drift (finance_clearance_sends, export_blob_path, xero_match_resolution, xero_expected_source). That drift is not this migration. The generated 0010 snapshot was deleted and not committed.
- Confidence: 90%.
- Morning smoke: after the migration is applied, publish a plan version and confirm the version still stamps.

## AV-M1 DONE

- Commit: 3bcbc4b1 feat(money): one cents module with half-up rounding for runtime code
- Files: lib/money/cents.ts, lib/money/index.ts, lib/money/__tests__/cents.test.ts, package.json, docs/brain/INVARIANTS.md, and runtime callers (approvedSlice, savePlan, writeBillingSchedule, writeBillingOverrides, xero/money, invoicingFunnel, retainerEligibility, shadowDiff, moneyRules.roundCents, forecastPresentationIdentity.roundMoney2, format/money.roundMoney2, balancer). scripts/migration/_shared toCents left half-even.
- Tests: typecheck 0, lint 0, test:money, test:billing-fee-drift, test:billing-seed-fees, test:billing-divergence, test:finance-derive, test:retained-commission, test:postgres-save-mode, test:write-media-plan-masters, test:xero. Xero helper assertion updated from banker's 100 to half-up 101. No stored-amount test moved by a cent.
- Left for later: inline Math.round(x * 100) in other lib files (listed by the search, not named converters). format/money.roundMoney2 still returns 0 for non-finite so display callers do not throw.
- Confidence: 90% on the required cases. Under 90% that every remaining Math.round site is display-only rather than a second converter. Morning smoke may show a 1c move on an exact half-cent line.
- Morning smoke: save and publish an existing plan without changes. The MBA PDF total should match. A 1c change is only acceptable on an exact half-cent line.

## AV-M2 DONE

- Commit: 8624789a feat(money): one sign-safe money parser for lib and API code
- Files: lib/money/parse.ts, index re-export, parse.test.ts, parseMoneyInput now calls parseMoney. Local parsers in computeCampaignFinancials, monthlyPlanCalendar, billingScheduleExpectedToDate, mbaGetAssemble, accrual.parseMoneyToNumber, dashboard shared parseMoney (still returns 0 via ?? 0), searchCore, dateFilter, dashboardMonthlySpend, parseMoneyCell, advertisingAssociatesExcel money fields, parsePersistedBillingScheduleToMonths, useMediaChannelContainer budget reads.
- Left: deliverable counts (deliverables, buyAmount) and lib/mediaplan/deliverableBudget.ts parseLoadedDeliverableValue (unsure whether the loaded value is money or a unit). components/** and lib/xano/** untouched.
- Tests: typecheck 0, lint 0, test:money, test:finance-derive, test:billing-fee-drift, test:ingest-review, test:kpi-writes. test:finance-sections still fails only on /design-system (AV-00 baseline).
- Confidence: 90% on the parser. Under 90% that every remaining [^0-9.] site is a count.
- Morning smoke: finance shows a negative invoice or credit as negative. Billing schedule edit: typing "-100" saves -100.

## AV-M3 DONE

- Commit: 6ec337fd feat(money): one rate module for CPM, CPC, CPV, CTR and CPA
- Files: lib/money/rates.ts, rates.test.ts, index re-export. Call sites: loadDeliverySnapshot, programmaticCompute, socialChannelCompute, ava summaries, pacing campaign and programmatic aggregates, line card CPM, kpiReview ratio and CPM. CTR and VTR are decimals. Social, programmatic and direct-digital tiles multiply by 100 only when formatting. CPV with no views is null, shown as a dash.
- CVR stays in percentage points because the social and programmatic tiles still compare it on that scale.
- div0 and searchCore.safeDiv stay. They still have callers that want 0.
- Tests: typecheck 0, lint 0, test:money, test:kpi-percent-units, test:kpi-review, test:programmatic-delivery, test:search-delivery-tiles, test:delivery-ui, test:pacing-portfolio, test:campaign-read. test:social-delivery and test:campaign-dashboard-range still fail only on the AV-00 colour snapshot (5 hexes, SpendChartsRow). test:finance-sections not re-run; it still stops on the /design-system baseline before any rate code.
- Confidence: 90% on the decimal CTR change for the three adapters. Under 90% that every other CTR display in the app multiplies by 100.
- Morning smoke: campaign page for a live social, search and programmatic campaign. CPM, CPC and CTR match yesterday, CTR shown as a percent once. A line with zero impressions shows a dash, not $0.00.

## AV-M4 DONE

- Commit: 3d150b67 fix(spend): prorate partial months once in the monthly plan calendar
- Files: lib/spend/monthlyPlanCalendar.ts, lib/spend/__tests__/monthlyPlanCalendar.test.ts, package.json, docs/brain/KNOWN-ISSUES.md (C-152)
- Delivery-schedule and billing month buckets are already day-prorated. Planned total is now the bucket itself. Expected-to-date is the bucket times elapsed campaign-window days over campaign-window days in that month. Optional asOfISO defaults to Melbourne today. Fees row unchanged.
- Known answers: $74,000 from 17 Jan to 31 Mar plans to 74,000; 20 Jan expects 4,000; 10 Feb expects 25,000; 31 Mar expects 74,000; 16 Jan expects 0. April 5-6 2026 (DST) counts two inclusive civil days.
- Tests: typecheck 0, lint 0, test:monthly-plan-calendar 11 pass, test:planned-to-date 0, test:client-dashboard-range 0, test:campaign-read 0. test:campaign-dashboard-range node tests 72 pass; vitest still fails only on the AV-00 SpendChartsRow colour snapshot.
- Confidence: 90%. The only number that moves is a partial month.
- Morning smoke: a campaign that started mid-month. The strip's planned total equals the plan's media total. Expected to date is close to budget times elapsed share.

## AV-M5 DONE

- Commit: 74bd964b fix(spend): compare delivered spend with expected media only
- Basis parameter `media` | `all_in` on the monthly calendar and both resolvers. Default remains all_in.

| Consumer | Class | Basis |
|---|---|---|
| Campaign strip expected, behindBy (page + attachStripExpected) | (a) vs delivered | media |
| Pacing portfolio expectedForCampaign | (a) pace vs delivered | media |
| AVA delivery snapshot and campaign read | (a) they copy the strip | media via the strip |
| Client dashboard expectedSpendToDate and planned-to-date | (a) planned to date vs delivered | media |
| mbaGetAssemble metrics.expectedSpendToDate | (a) fallback for the strip | media |
| resolveCampaignTotalPlannedSpend on the campaign page | (b) plan total | all_in (default) |
| Media mix charts | (b) already drop Fees in the chart | unchanged |
| Billing-schedule fallback inside the expected resolver | kept | all_in even when the caller asked for media. Under 90% that a billing-only plan should go to zero. |
| KPI review | does not call this resolver | unchanged |

- A 20% fee fixture: media expected 10,000, all_in 12,000, behindBy uses 10,000.
- Labels: strip, campaign details, pacing card and the client dashboard planned tile say "Expected media to date". No separate fees line on those tiles. Logged for a later design pass.
- Tests: typecheck 0, lint 0, test:campaign-read 0, test:planned-to-date 0, test:client-dashboard-range 0, test:pacing-portfolio 0, test:kpi-review 0, CampaignStatusStrip 6 pass. test:campaign-dashboard-range not re-run in full; the SpendChartsRow colour snapshot is still the AV-00 baseline. The strip test inside it passed on its own.
- Confidence: 90% on the delivery-schedule Fees row. Under 90% on the billing-schedule fallback.
- Morning smoke: campaign strip on a live plan with a fee. Behind by shrinks by about the fee share. The total investment tile is unchanged.

## AV-M6 DONE

- Commit: 859d02d3 fix(finance): forecast fallback uses canonical burst amounts and proration
- Basis: billed media only. resolveMonthlyMediaForFySlot uses this when billing and delivery schedules have no media. Fee stays inside computeBurstAmounts and is not returned.
- Client-pays and bonus media are 0. Gross-in and net-in both return net media.
- Day counting is prorateAcrossMonths over every month the burst spans, then the selected month's share, summed in cents. A 31 Mar to 6 Apr 2026 burst of $700 splits 100 / 600 and sums to 700.
- Extra bursts with no feePct are treated as fee 0, so a fee-inclusive budget is billed in full. Logged for Luke.
- Files: lib/finance/utils.ts, tests/finance/calculateMonthlyAmountFromBursts.test.ts, package.json (test:finance-forecast).
- Tests: typecheck 0, lint 0, test:finance-forecast 35 pass, test:finance-derive 20 pass, test:money 12 pass.
- Confidence: 90% on the media basis. Under 90% that extra.bursts always carry feePct.
- Morning smoke: finance forecasting for the current FY. Totals for plans with schedules stay put. Only plans that hit the burst fallback move. Note any client that moves by more than 1%.

## AV-M7 DONE

- Commit: 1f6d8900 fix(plans): legacy fee estimate on edit follows the gross fee rule
- The estimate runs only when a saved month has no feeTotal. Line amounts are treated as net media. Search and social only, because the saved payload only carries those two fee rates. Create has no twin of this block.
- A $10,000 net month at 20% now estimates a $2,500 fee.
- Files: lib/mediaplan/legacyMonthFeeEstimate.ts, lib/mediaplan/__tests__/legacyMonthFeeEstimate.test.ts, app/mediaplans/mba/[mba_number]/edit/page.tsx, package.json.
- Tests: typecheck 0, lint 0, test:editor-line-inputs 24 pass, test:billing-fee-drift 32 pass, test:plan-drafts pass, test:dirty-controller pass.
- Confidence: 90% that the month line amounts are net. Under 90% only if an old schedule stored gross in those line amounts.
- Morning smoke: open an old plan whose search or social lines have no saved fee total. The fee shown equals the MBA fee.

## AV-M8 DONE

- Commit: a5e8daf0 chore(money): delete dead burst closures, billing schedule PDF and day helpers
- Deleted 13 unused local getBursts closures (12 containers plus useMediaChannelContainer) and the unused calculateTimeElapsed / calculateDayMetrics helpers on the MBA route. mbaGetAssemble keeps its own copies, which are called.
- Left lib/generateBillingSchedulePDF.ts. scripts/brand/render-sample-exports.ts still imports it.
- Tests: typecheck 0, lint 0, test:expert-goldens 9, test:expert-mappings 17, test:media-plan-excel 6, test:campaign-documents pass, test:billing-fee-drift 32.
- Morning smoke: create a plan with TV, digital display and search lines. Containers render and totals show.

## AV-M9 DONE

- Commit: 23331ea5 feat(money): lineTotals and campaignTotals on the canonical burst maths
- No callers. Gross-in and net-in at 15%, client-pays, bonus, package_inclusions, and a 100% fee (finite, fee 0 on a net budget) are tested. Several bursts sum in cents.
- Files: lib/money/burst.ts, lib/money/__tests__/burst.test.ts, lib/money/index.ts.
- Tests: typecheck 0, lint 0, test:money 18 pass, test:deliverable-budget 16 pass.
- Morning smoke: none (library only).

## AV-M10 PARKED

- Display totals and the burst maths that is saved sit in the same functions across the legacy containers, useMediaChannelContainer and ExpertCard. Replacing every `(100 - fee)` site would change stored burst amounts, not only the cards. Separating those in one pass is under 90%.
- No files changed. AV-M11, AV-M12 and AV-G1 do not need this prompt. AV-G2 does.

## AV-M11 DONE

- Commit: 25cd9641 fix(plans): create builds the line fee snapshot like edit
- Create's manual billing snapshot fee now comes from generateBillingLineItems (the same engine edit uses), so bonus is 0 and gross-in, net-in and client-pays each keep a $2,500 fee on the fixture. The lines attached to the editor are unchanged. Edit has no twin of this snapshot.
- Files: lib/billing/billingSnapshotFeeTotals.ts, lib/billing/__tests__/billingSnapshotFeeTotals.test.ts, app/mediaplans/create/page.tsx, package.json.
- Tests: typecheck 0, lint 0, test:billing-fee-drift 33, test:editor-line-inputs 24, test:plan-drafts pass, test:postgres-save-mode 238 pass.
- Morning smoke: create a new plan with search and social lines, open manual billing. The fee totals match the MBA preview.

## AV-M12 DONE

- Commit: 822c31dd fix(billing): ad serving rounds per month and month totals sum their parts
- Ad serving is costed on the whole deliverable, then split with prorateAcrossMonths, so the months sum to the line. Each month total is the cent sum of media, fee, ad serving and production.
- Files: lib/billing/computeSchedule.ts, lib/billing/__tests__/adServingMonthRounding.test.ts, package.json.
- Tests: typecheck 0, lint 0, test:billing-fee-drift 34, test:billing-seed-fees 11, test:billing-divergence 22, test:campaign-documents pass, test:money 18.
- Morning smoke: billing schedule for a plan with ad serving. Each month total equals the media, fee and ad serving shown.

## AV-M13 DONE

- Commit: 0e83f101 fix(finance): campaign financial totals sum per-line cents
- mbaScopeTotals now sum each line in cents. GST still goes through addGst on that ex-GST total. A freeze against buildMbaFromPersisted was not simulated (no database in the test). The new test compares the live total with the cents-sum of the same lines.
- Files: lib/finance/computeCampaignFinancials.ts, lib/finance/__tests__/computeCampaignFinancials.test.ts.
- Tests: typecheck 0, lint 0, financials suite 10, test:finance-derive 20, test:campaign-documents pass, test:money 18, test:editor-line-inputs 24. No existing expectation moved.
- Morning smoke: draft MBA PDF versus the published MBA PDF of the same unchanged plan. Totals match to the cent.

## AV-X1 DONE

- Commit: d5884586 feat(docs): one media plan workbook builder for draft and published files
- buildMediaPlanWorkbook owns the filename, generateMediaPlan, the draft stamp and the KPI sheet (standard only, and only when rows exist). Row building stays with the caller: explode on draft, the persisted adapter on publish, including the legacy billing-blob fee fallback. That is thinner than the prompt's full pipeline inside the function. Moving explode in would have risked the published bytes. Confidence on the split: 85%.
- Filenames: published `{client}-MediaPlan_{campaign}-v{n}.xlsx`, AA prefixed `AA - `, drafts `DRAFT-MediaPlan_{campaign}_not-for-client.xlsx` and `DRAFT-AA-MediaPlan_...`.
- Files: lib/docs/mediaPlanWorkbook.ts, lib/docs/renderDraftDocuments.ts, lib/docs/renderPlanVersionDocuments.ts, lib/docs/__tests__/mediaPlanWorkbook.test.ts, docs/brain/BLAST-RADIUS.md, docs/brain/modules/media-plans.md, package.json.
- Tests: typecheck 0, lint 0, test:media-plan-excel 8, test:campaign-documents pass, test:plan-drafts pass, test:kpi-writes 39, test:money 18.
- Morning smoke: download a draft media plan and the published one for the same unchanged plan and compare them.

## AV-X2 DONE

- Commit: 8bfdd2e3 fix(docs): published media plan carries the persisted ad serving
- The published MBA reads ad serving from approved_slice.lines.adservingCents (schedule_months.component = adserving is the live-overlay path). The workbook now sums those same per-line cents onto the MBA block. Fee snapshots still hold percentages only. Versions with no adserving fields on the slice keep the legacy billing blob. Media and fee billing_overrides for the version are attached before the financials run. An adserving override row is not reattached as media; the slice already froze it.
- The Excel sheet has one Ad Serving & Tech total, not a per-channel cell. The test checks that total.
- Files: lib/docs/buildMediaItemsFromPersisted.ts, lib/docs/__tests__/buildMediaItemsFromPersisted.test.ts.
- Tests: typecheck 0, lint 0, test:media-plan-excel 8, test:campaign-documents pass (11 persisted cases).
- Morning smoke: regenerate documents for a published plan with ad serving. Excel Ad Serving equals the MBA PDF.

## AV-X3 PARKED

- The published Media Plan button still builds the workbook in the browser (`generateMediaPlanXlsxBlob` on create and edit). Switching it to the stored file needs the master's `published_version_id`, which the edit page does not keep (it keeps the working version id). The publish-and-zip path also builds the zip from that client function, and characterisation tests match the source text of both pages. Separating the stored download, the draft button and the dead upload blocks in one pass is under 90%.
- No files changed. AV-X4 needs this prompt. AV-X5, AV-X6, AV-X7 and AV-G1 do not.

## AV-X5 DONE 5caeea75

- Billing months include production, so the Total row months do too (standard and AA). Months now span the earliest burst start and the latest burst end. A month outside the campaign dates is labelled "Outside campaign dates" on the month header. This ExcelJS build has no cell-note field, so the label is on the header value.
- Files: lib/generateMediaPlan.ts, lib/__tests__/generateMediaPlan.totalsMonths.test.ts, package.json.
- Tests: typecheck, lint, test:media-plan-excel, test:campaign-documents, test:money. All passed.
- Morning smoke: draft media plan for a plan with production. The Total row months add up to Total Ex GST.

## AV-X6 DONE 8ab298c4

- Standard client-pays rows show deliveryMediaAmount (net media the client pays the publisher), labelled on the buy type. They never fall back to the fee-inclusive budget.
- AA client-pays lines are excluded from AA rows. A $0 row would otherwise merge into an agency line that shares buy type, and the AA block already treats gross media "0" as excluded. That is what makes AA section totals equal the AA MBA block.
- explodeExcelLineItems now sets deliveryMediaAmount on every channel. Influencer line ids were already present; a scope test locks that an influencers line survives a partial filter.
- Client-pays in Total Ex GST, not changed. Full-scope computeCampaignFinancials adds deliveryMediaAmount into per-line media, so gross media and nett ex GST include client-pays net media. The month-scoped path and billing schedule months use mediaAmount, which is 0 for client-pays. Delivery schedule months use deliveryMediaAmount. Domain rule: the agency bills only its fee on client-pays lines. Luke decides whether full-scope Total Ex GST should keep that delivery media.
- Files: lib/generateMediaPlan.ts, lib/docs/explodeExcelLineItems.ts, lib/__tests__/generateMediaPlan.totalsMonths.test.ts, lib/docs/__tests__/filterMediaItemsForMbaScope.test.ts.
- Tests: typecheck, lint, test:media-plan-excel (11), test:campaign-documents, test:mba-scope (8). All passed.
- Morning smoke: AA media plan for a plan with a client-pays line. Section totals equal the AA MBA block. Read the note above and decide.

## AV-X7 DONE 9136e468

- Plan Date is the Australia/Sydney civil date, written as an Excel date. 2026-10-07T22:30Z renders 8 Oct.
- An invalid campaign start or end leaves the cell blank and logs a warning. It no longer substitutes today. Burst dates that fail the YYYY-MM-DD parser still fall back to today inside the gantt helpers. Changing every gantt caller to accept null was wider than this prompt, so that fallback stays.
- The budget header uses campaignBudgetCents when it is set, otherwise one parse of the budget string.
- AA inc GST is addGst on the cents total.
- Cinema Avg. Rate is still (gross media / screens) times 1000. A cost per screen would be gross divided by screens, with no times 1000. Not changed.
- Files: lib/generateMediaPlan.ts, lib/mediaplan/advertisingAssociatesExcel.ts, lib/__tests__/generateMediaPlan.totalsMonths.test.ts.
- Tests: typecheck, lint, test:media-plan-excel (13), test:campaign-documents, test:mba-header-date (12). All passed.
- Morning smoke: download any media plan before 11am. Plan Date is today.

## AV-G1 DONE e951dfd1

- Eight fixtures in lib/money/__tests__/fixtures/plans.ts. lib/money/__tests__/golden.test.ts compares lineTotals, computeCampaignFinancials, billing month parts, the workbook Total row, and the F6 monthly calendar. A disagreement is a todo. The suite exits 0.
- Agreed: F1, F2, F4, F5, F6 and F7 media and fee. F6 planned media is 74000.00. Expected media is 4000 on 20 Jan, 25000 on 10 Feb, 74000 on 31 Mar, and 0 on 16 Jan. F3 fee includes the client-pays fee.
- Todos, not fixed:
  - F3 media: lineTotals 850000 cents, mbaScopeTotals.grossMedia 1700000 cents. Full-scope gross media includes the client-pays delivery media. Same question as AV-X6.
  - F8 media: lineTotals 400000 cents (includes the production line), grossMedia 200000 cents. Production is its own component, not inside gross media. lineTotals has no production bucket.
  - F8 workbook: Total row months sum to 700000 cents, Total Ex GST is 900000 cents. The production 200000 cents is in column N and missing from the month sum on this fixture.
  - F8 ad serving: financials 500000 cents, computeAdServingCost 50000 cents, for two 100,000 CPM lines at 2.50. Ten times. Not investigated further.
  - buildMbaFromPersisted was not compared. It needs a persisted version and a database.
- Files: lib/money/__tests__/golden.test.ts, lib/money/__tests__/fixtures/plans.ts, package.json (test:money-golden).
- Tests: typecheck, lint, test:money (61 pass, 5 todo), test:money-golden.
- Morning smoke: none. Read the todos above.

## AV-Z DONE

- No commit. typecheck 0, lint 0, check:client-server-only 0, test:all 121/124 (the three remaining failures are the AV-00 colour snapshots and /design-system), build 0. Morning summary is at the top of this file. git log --oneline -60 is in that summary. Night 2 was not started.

## AV-F1 DONE 350a5f7c

- F8 CPM lines use rate 10. A $1,000 budget at $10 CPM is 100,000 impressions, so ad serving matches computeAdServingCost ($500 for the two lines). Production buy type is `production`. ProductionContainer writes that string, and resolveBuyTypeForChannel returns it for a blank production line. It is not "fixed cost" or "fixed_cost".
- The workbook harness now follows renderDraftDocuments: MEDIA_PLAN_WORKBOOK_MEDIA_TYPES, a form flag for each schedule media type on the fixture (production included), and campaignFinancialsMediaByKey summed from per-line media.
- lineTotals.productionCents holds production media, chosen by media type the same way computeCampaignFinancials does. mediaCents no longer includes it. campaignTotals sums the bucket. Full-scope gross media equals mediaCents plus clientPaysMediaCents. The fee on client-pays lines still matches.
- F8 Total row months still miss production: 250000 cents against Total Ex GST 450000 cents. The gap is the $2,000 production line. generateMediaPlan already adds monthlyByChannel production into the Total row. AV-X5 covers that path: test:media-plan-excel still passes when a production row has grossMedia 2000. This golden explode sets production grossMedia to cost times amount. The fixture burst only has budget 2000, so the row is $0 before generateMediaPlan sees it. Not changed in generateMediaPlan. A change there would invent dollars the row does not carry.
- docs/brain/modules/media-plans.md has no AV-X6 note that full-scope client-pays gross media is undecided. Not edited. INVARIANTS now states the AV-D9 rule. The older sentence that client-paid media never appears in MBA gross media is removed, so the page does not contradict itself.
- Todos still open: F8 workbook Total row months; buildMbaFromPersisted (needs a database).
- Files: lib/money/__tests__/fixtures/plans.ts, lib/money/__tests__/golden.test.ts, lib/money/burst.ts, lib/money/__tests__/burst.test.ts, docs/brain/INVARIANTS.md.
- Tests: typecheck 0, lint 0 (same warning set), test:money 73 pass and 2 todo, test:money-golden 54 pass and 2 todo, test:media-plan-excel 13 pass, test:campaign-documents pass.
- Under 90%: productionCents uses billed media (what used to sit in mediaCents). For a client-pays production line that would be 0, while computeCampaignFinancials production uses delivery media. F8 is not client-pays, so both are $2,000. Not changed.
- Morning smoke: none. Read this note. The F8 workbook month todo and buildMbaFromPersisted are still open.

## AV-F2 DONE c1e7d75c

- Cinema Avg. Rate in the media plan workbook is gross divided by screens. Ten screens and $50,000 gross write 5000, which the rate format shows as 5,000.00. Zero screens and missing screens write a blank cell, not 0 and not Infinity.
- Screens in that cell are the summed deliverables already labelled Screens on the cinema row. The optional LineItem.screens field is not the denominator.
- Other cinema rate displays, left unchanged because none label this same Avg. Rate:
  - Biddable CPM Avg. Rate in generateMediaPlan still multiplies by 1000. That is CPM, not cinema.
  - Expert grid cinema stores the entered unit rate in buyAmount. It is not a computed average.
  - deliverableBudget screens is net budget divided by the entered unit rate, already without times 1000.
  - expertChannelMappings and solveMediaMath multiply by 1000 only for CPM deliverables.
  - CinemaContainer "screens" is a buy-type label.
  - generateMBA and the explode cinema branch do not compute an average rate.
- Files: lib/generateMediaPlan.ts, lib/__tests__/generateMediaPlan.totalsMonths.test.ts.
- Tests: typecheck 0, lint 0 (same warning set), test:media-plan-excel 14 pass, test:campaign-documents pass (41, 14 and 20).
- Morning smoke: draft a media plan for a plan with cinema. Avg. Rate equals gross divided by screens.

## AV-F3 PARKED

- Stopped before any edit. The YYYY-MM-DD parser is also the date source for monthly money, so changing it to null would change the Total row months. The prompt says to stop when a money path reads these helpers.
- Helper: `parseDateStringYYYYMMDD` in lib/generateMediaPlan.ts (about line 240). A string that is not YYYY-MM-DD warns and returns UTC today. It is not exported. `parseDateStringDDMMYYYY` is the header parser and already returns null. `mergeBurstCells` draws the bar and does not parse dates.
- Callers, all inside generateMediaPlan:
  - groupLineItems (about lines 470 and 473) compares burst start and end when widening a group's dates.
  - The timeline loop (about lines 560 and 564) extends the date columns. It only calls the parser after a YYYY-MM-DD regex check.
  - distributeBurstToMonths (about lines 745 and 746) parses both dates, then passes them to prorateAcrossMonths. That fills monthlyByChannel and the Total row months. This is the money path.
  - drawSection writes the Start Date and End Date cells from the same parser (Television, Press, Radio, Cinema, OOH, Biddable, and the other data-row branches around lines 947 to 1073).
  - Each channel then sorts bursts and draws the gantt from the same parser: Television, Radio, Newspaper, Magazines, OOH, Cinema, Digital Display, Digital Audio, Digital Video, BVOD, Search, Social Media, Programmatic Display, Programmatic Video, Programmatic BVOD, Programmatic Audio, Programmatic OOH, Integration, Influencers, Production.
- A burst dated "31/02/2026" fails the YYYY-MM-DD check, so today it becomes the download date for both the bar and the month split.
- No files changed. No patch. Tests not run.
- Morning smoke: none.

## AV-X3a DONE 5cf902f8

- Edit keeps `publishedVersionId` from the load response's `published_version_id` (`publishedVersionPointerIdFromMaster`). A successful postgres publish sets it from `PlansSaveResponse.versionId`, and only when the mode is `publish` and `published` is true. A draft save does not set it. A successful publish retry sets the same id that the save response already returned.
- Create does the same after a successful postgres publish, and on publish retry. Create has no load of a published pointer.
- `downloadStoredPlanFile` fetches `/api/mediaplans/{versionId}/download?kind=`. The file name is Content-Disposition `filename*` when present, otherwise the quoted `filename` (the server's stored name). A missing name throws. 422 is `NotApprovedError`. 404 with code `NOT_SAVED` is `NotSavedError`. No button changes.
- The older MBA PUT save path does not set this state. The live save is `POST /api/plans/save`.
- Files: app/mediaplans/create/page.tsx, app/mediaplans/mba/[mba_number]/edit/page.tsx, lib/docs/downloadStoredPlanFile.ts, lib/docs/__tests__/downloadStoredPlanFile.test.ts, docs/brain/modules/media-plans.md.
- Tests: typecheck 0, lint 0 (same warning set), test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:dirty-controller pass (30 + 40), check:client-server-only OK, downloadStoredPlanFile tests 4 pass.
- Morning smoke: none.

## AV-X3b DONE c0610cea

- Edit "Published Media Plan" and "Published Media Plan (AA)" download the stored file when the selected version is published, `publishedVersionId` is a positive number, and the form is clean. Clean means the bottom bar dirty signal is false: no working draft and no unsaved changes. Otherwise those buttons call `handleDraftMediaPlan` and `handleDraftAa`. They do not call `generateMediaPlanXlsxBlob`. The zip and the create page still do.
- `fromPublish` still suppresses the success toast and the generic error toast. The draft fallback takes `{ quiet: true }` so a publish-and-download does not also toast the draft title. `NotSavedError` still toasts "File not ready. Regenerate documents from the plan list." `NotApprovedError` falls back to the draft handler.
- Changed assertions in `lib/mediaplan/__tests__/planWizardSaveBar.test.ts`, test "edit handleGenerateMBA / handleDownloadMediaPlan no longer toast-and-return on unpublished":
  - Kept: MBA handler does not match `if (!isPublished)`.
  - Kept: media plan handler does not match `if (!opts?.fromPublish && !isPublished)`.
  - Added on the media plan handler: matches `downloadStoredPlanFile(`, `kind: "media_plan"`, `handleDraftMediaPlan(`, `hasUnsavedChanges`, `NotSavedError`, `Regenerate documents from the plan list`, `NotApprovedError`, and `fromPublish`. Does not match `generateMediaPlanXlsxBlob`.
  - Added on the AA handler (through `handleDownloadNamingConventions`): matches `kind: "aa_media_plan"`, `handleDraftAa(`, `NotSavedError`, and `NotApprovedError`. Does not match `generateMediaPlanXlsxBlob`.
- Files: app/mediaplans/mba/[mba_number]/edit/page.tsx, lib/mediaplan/__tests__/planWizardSaveBar.test.ts, docs/brain/modules/media-plans.md.
- Tests: typecheck 0, lint 0 (same warning set), planWizardSaveBar 34 pass, test:dirty-controller pass (30 + 40), test:campaign-row-actions 28 pass, test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:campaign-documents pass (41 + 14 + 20).
- Under 90%: a publish-and-download calls the handler in the same turn as `clearDirtyOnSaveSuccess`, so it still sees the pre-clear dirty flag and takes the quiet draft path. The stored file is used from the button once the next render is clean. The `NotSavedError` toast is shown even when `fromPublish` is set.
- Morning smoke: edit a published plan without changes. "Published Media Plan (vN)" is the same file as the plan list row menu. Make an unsaved change: it downloads the draft file. Not exercised in the browser here.

## AV-X3c DONE 60b8644f

- Create had no AA draft handler. The draft route is the same admin POST create already uses for the media plan, so `handleDraftAa` was added. It posts `buildCreateDraftDocumentsBody("aa_media_plan")`. The create bar still hides AA (`showDraftAa` is false while `isCreate` is true). The button was not hidden further.
- Create keeps `isPublished` false. A publish in this session is `publishedVersionId`. When that id is set and the form is clean (no working draft and no unsaved changes), Media Plan and AA download the stored file. Otherwise they call the draft handlers. `fromPublish` stays quiet on the success toast and the generic error toast. `NotSavedError` toasts "File not ready. Regenerate documents from the plan list." `NotApprovedError` falls back to the draft handler. `generateMediaPlanXlsxBlob` stays for the zip.
- No existing create assertion pinned the old browser generate. Added test "create handleDownloadMediaPlan serves the stored file or the draft":
  - Media plan handler matches `downloadStoredPlanFile(`, `kind: "media_plan"`, `handleDraftMediaPlan(`, `publishedVersionId`, `hasUnsavedChanges`, `NotSavedError`, `Regenerate documents from the plan list`, `NotApprovedError`, and `fromPublish`. Does not match `generateMediaPlanXlsxBlob`.
  - AA handler (through `transformedMediaTypes`) matches `kind: "aa_media_plan"`, `handleDraftAa(`, `NotSavedError`, and `NotApprovedError`. Does not match `generateMediaPlanXlsxBlob`.
  - `handleDraftAa` matches `buildCreateDraftDocumentsBody("aa_media_plan")`.
- Files: app/mediaplans/create/page.tsx, lib/mediaplan/__tests__/planWizardSaveBar.test.ts, docs/brain/modules/media-plans.md.
- Tests: typecheck 0, lint 0 (same warning set), planWizardSaveBar 35 pass, test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:dirty-controller pass (30 + 40).
- Under 90%: the publish download runs in the same turn as `clearDirtyOnSaveSuccess`, so it still sees the pre-clear dirty flag and a null `publishedVersionId` on the first publish, and takes the quiet draft path. Create then opens the edit page. The stored file is the later download once that page is clean.
- Morning smoke: create a plan and download before publishing (draft file). Publish, then download again (clean stored file). Not exercised in the browser here.

## AV-X3d DONE 0299a7d6

- Publish and download all zips the stored media plan and MBA for the version just published. The naming workbook and the KPI workbook are still built as before. The zip does not call `generateMbaPdfBlob` or `generateMediaPlanXlsxBlob`.
- If the save response documents status is error, the zip does not run. The save modal already has that document error. On create, the redirect to edit is also skipped so the modal stays up.
- `NotSavedError` retries the stored fetch once after 2 seconds, then toasts "File not ready. Regenerate documents from the plan list." An already-published edit uses `publishedVersionId` when there is no new save.
- Changed assertions in `lib/mediaplan/__tests__/planWizardSaveBar.test.ts`:
  - "create zip runs after publish, never before" still requires the zip call before the edit redirect. Added: handleSaveAll matches `documentsStatus === "error"`. The create zip function matches `downloadStoredPlanFile(`, `fetchStored("mba_pdf")`, `fetchStored("media_plan")`, `generateNamingConventionsXlsxBlob`, `buildKpiWorkbookBlob`, `NotSavedError`, `setTimeout(resolve, 2000)`, and `Regenerate documents from the plan list`. It does not match `generateMbaPdfBlob` or `generateMediaPlanXlsxBlob`.
  - "edit unpublished zip publishes first" still requires publish first and no `draftBlocksDownloadMessage`. Added: the published path matches `zipPublishedEditDocuments(publishedVersionId)`. The edit zip function matches the same stored-file, naming, KPI, retry, and file-not-ready strings, and does not match `generateMbaPdfBlob`, `generateMediaPlanXlsxBlob`, or `liveScope`. handleSaveAll matches `documentsStatus !== "error"` and `zipPublishedEditDocuments(args.versionId)`.
- Files: app/mediaplans/create/page.tsx, app/mediaplans/mba/[mba_number]/edit/page.tsx, lib/mediaplan/__tests__/planWizardSaveBar.test.ts, docs/brain/modules/media-plans.md.
- Tests: typecheck 0, lint 0 (same warning set), planWizardSaveBar 35 pass, test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:campaign-documents pass (41 + 14 + 20).
- Under 90%: skipping the create redirect when documents fail is so the save modal stays visible. A documents error on edit already keeps the modal open because the step is an error.
- Morning smoke: publish with "Publish & download all". The zip's media plan and MBA are the same files as the row menu downloads. Not exercised in the browser here.

## AV-X3e DONE c93d74d9

- Both pages' remaining `generateMediaPlanXlsxBlob` calls were the function itself and the two calls inside the Xano document upload that sits after the postgres `return`. The default write backend is postgres, so that return runs and the upload does not. The functions, the upload blocks, and the imports only those blocks used are gone. `generateMbaPdfBlob` stays for the MBA button.
- Invariant added. Nothing in INVARIANTS already said the workbook is only `lib/docs/mediaPlanWorkbook.ts`.
- Changed assertions:
  - `planWizardSaveBar.test.ts` "create draft MBA posts the save body" re-anchored `genEnd` from `const generateMediaPlanXlsxBlob` to `const buildCreateDraftDocumentsBody`. The slice is still the MBA blob builder, and it still must not match `campaign_status`.
  - `postgresSavePayload.integration.test.ts` dropped `filterMediaItemsForMbaScope` on the page source. Both pages still match `buildMbaScopeForSaveBody` for the save body. The client workbook was the only page caller of that filter. Persisted and draft document render still filter.
- Files: app/mediaplans/create/page.tsx, app/mediaplans/mba/[mba_number]/edit/page.tsx, docs/brain/INVARIANTS.md, lib/mediaplan/__tests__/planWizardSaveBar.test.ts, lib/mediaplan/__tests__/postgresSavePayload.integration.test.ts.
- Tests: typecheck 0, lint 0 (same warning set), planWizardSaveBar 35 pass, test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:dirty-controller pass (30 + 40), test:postgres-save-mode pass (239, 20 skipped), test:media-plan-excel 14 pass, check:client-server-only OK, npm run build 0.
- Under 90%: explicit `WRITE_BACKEND=xano` is still a legal value and was the only path into the deleted upload. The default is postgres, which is the path that returns first. The invariant says no other code calls `generateMediaPlan`. The production caller is `lib/docs/mediaPlanWorkbook.ts`. The engine's own tests still call `generateMediaPlan` directly.
- Morning smoke: create and edit pages load, save and publish. Every download works. Not exercised in the browser here.

## AV-M10D DONE (no commit)

- Discovery only. Written to `CONTAINER_TOTALS_DISCOVERY.md` at the repo root. Untracked. Not staged.
- The inline fee split is display (card, summary, header, investment chart) except one assignment: `totalMedia` on the media-line-items snapshot. That value is `enteredAmount` only when no burst states a budget. Saved burst media and fee still come from `computeBurstAmounts` inside `serializeBurstsJson`.
- No code changes. No tests run.
- Under 90%: whether any live non-production line has bursts with no stated budget, which is the only case where swapping the snapshot `totalMedia` would change a stored dollar. Card and header numbers will change for bonus, client pays, and a 100% fee if those displays move to `lineTotals`. That product change is in the doc for approval. Confidence on the commit plan is in the doc (90, 90, 90, 80, 70).
- Morning smoke: none. Discovery.

## AV-F4 DONE 7d4760f0

- Publish downloads on create and edit no longer read the dirty flag or `publishedVersionId` state. `handleSaveAll` passes the save response version id into `handleDownloadMediaPlan({ fromPublish: true, versionId })`. That id is the same value stored as `publishedVersionId` after a successful publish. The button downloads still use the stored file when the form is clean and the draft file when it is dirty.
- A documents error on that save downloads nothing. The existing "Plan saved without documents" toast stays. On create, the redirect to edit is also skipped so the save modal stays up. `NotSavedError` retries the stored fetch once after 2 seconds, then toasts "File not ready. Regenerate documents from the plan list."
- Changed assertions in `lib/mediaplan/__tests__/planWizardSaveBar.test.ts`:
  - "create zip runs after publish, never before" also matches `download: false` and `fromPublish: true` with `zipCtx.versionId`.
  - "create handleDownloadMediaPlan serves the stored file or the draft" slices the `fromPublish` branch. It matches `downloadStoredPlanFile(`, `opts.versionId`, `kind: "media_plan"`, `setTimeout(resolve, 2000)`, and `NotSavedError`. It does not match `hasUnsavedChanges` or `handleDraftMediaPlan`.
  - "edit handleGenerateMBA / handleDownloadMediaPlan no longer toast-and-return on unpublished" uses the same `fromPublish` slice.
  - "edit unpublished zip publishes first" also matches `documentsStatus === "error"`, `download: false`, and `fromPublish: true` with `versionId: args.versionId`. The zip condition `documentsStatus !== "error"` stays.
- Files: app/mediaplans/create/page.tsx, app/mediaplans/mba/[mba_number]/edit/page.tsx, lib/mediaplan/__tests__/planWizardSaveBar.test.ts, docs/brain/modules/media-plans.md, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set), test:postgres-save-mode pass (239, 20 skipped), test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:dirty-controller pass (30 + 40), test:campaign-documents pass (41 + 14 + 20).
- Under 90%: a documents error on create now skips the redirect even when the user did not ask for the zip, so the save modal stays visible. The Xano save tail still calls `afterSuccessfulSave` without a version id. That path is after the postgres return. A publish download there toasts file not ready instead of building a draft.
- Morning smoke: Publish a plan with download on: the file has no DRAFT stamp and matches the row-menu download. Do this on create and on edit. Not exercised in the browser here.

## AV-F5 DONE ff0853f8

- The F8 production burst now matches `formatProductionBurstForPersist`: cost 2000, quantity 1, budget "2000", buyAmount "1", calculatedValue 1. `explodeExcelLineItems` sets production gross media to cost times amount, so the workbook row is $2,000.
- "F8 workbook Total row months sum to Total Ex GST" is now a passing assertion. Both sides are 450,000 cents. The previous gap was the missing $2,000 (250,000 cents of months against 450,000 cents of Total Ex GST).
- Files: lib/money/__tests__/fixtures/plans.ts, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set), test:money-golden pass (55, 1 todo for buildMbaFromPersisted), test:money pass (74, same todo), test:media-plan-excel pass (14).
- Under 90%: none. Cost 2000 and quantity 1 is the container's Cost and Quantity fields. Any pair that multiplies to 2,000 would feed the same gross.
- Morning smoke: none.

## AV-F6a DONE 5d33c03e

- Publishing is refused until every burst on every included line has a valid start and end, and start is on or before end. Draft and new_version still save. The save route returns 422 `MISSING_BURST_DATES`, the same code family as the buy type gate, with "Add start and end dates to every burst before publishing." and the line ids (up to five, then "and N more").
- Included means the line is not approval `excluded`. Partial MBA scope is not used, because a blank date still has no honest month split on lines outside the MBA document.
- Production bursts carry startDate and endDate (`formatProductionBurstForPersist`), so they follow the same rule. They are not excluded the way the buy type gate excludes them.
- Create and edit clear the highlight at the start of a save, then toast "Burst dates required" and mark the Issues panel the same way as a missing buy type.
- Files: lib/mediaplan/missingBurstDatesGate.ts, lib/mediaplan/__tests__/missingBurstDatesGate.test.ts, app/api/plans/save/route.ts, app/mediaplans/create/page.tsx, app/mediaplans/mba/[mba_number]/edit/page.tsx, package.json, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/brain/BLAST-RADIUS.md, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set), test:postgres-save-mode pass (249, 20 skipped), test:plan-drafts pass (59 + 12 + 68, 6 skipped).
- Under 90%: "included" is approval not equal to excluded. The buy type gate does not filter approval. The toast title "Burst dates required" follows "Buy type required". The specified sentence is the description.
- Morning smoke: Blank one burst's end date on a test plan: draft save works, publish is refused with the line named. Not exercised in the browser here.

## AV-F6b DONE 54daea77

- `computeCampaignFinancials` already treats a blank burst date as the campaign start or end (`toDate` falls back to those bounds). If neither campaign date is passed and no burst has a finite date, that fallback is the current month. A published MBA does not re-prorate bursts. `buildMbaFromPersisted` uses the frozen schedule months and the approved slice, so filling workbook dates does not change an MBA total.
- There is no single builder that feeds both the workbook rows and that money path. `explodeExcelLineItems` builds the workbook. `buildEditorLineItemInputs` builds the money inputs, and the editor also uses it for live totals. Filling only in explode keeps the MBA total where it is. Draft and published workbook callers pass the campaign dates into explode.
- A blank start becomes the campaign start. A blank end becomes the campaign end. Both are Sydney civil YYYY-MM-DD. The burst is flagged `dateFilled` `start`, `end`, or `both`. The row market cell shows "Date missing, campaign dates used" on a new line, the same approach as the "Outside campaign dates" month header. This ExcelJS build has no cell notes.
- `parseDateStringYYYYMMDD` throws `Invalid start date: blank. Expected YYYY-MM-DD.` (or the matching field). It no longer uses today. The gantt and the month split both use that parser.
- Files: lib/docs/explodeExcelLineItems.ts, lib/docs/buildMediaItemsFromPersisted.ts, lib/docs/renderDraftDocuments.ts, lib/generateMediaPlan.ts, lib/__tests__/generateMediaPlan.totalsMonths.test.ts, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/brain/BLAST-RADIUS.md, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set), test:media-plan-excel pass (17), test:campaign-documents pass (41 + 14 + 20), test:money-golden pass (55, 1 todo for buildMbaFromPersisted), test:weekly-gantt pass (8).
- Under 90%: the note sits on the market cell so the start and end stay real dates. A date cell cannot carry the sentence and the date format together.
- Morning smoke: Download the published media plan for golf021 (v517): the ML1 row shows the note, and its months fall inside the campaign. Not exercised in the browser here.

## AV-M10a DONE 3758226c

- Discovery still matches. `containerTotals` is at 3355 and still summed `expertRowCostSplit` in floats. Net media, fees and total with fees render at 5783, 5791 and 5806. The weekly totals net cell is 5696. Apply does not read those sums.
- The footer and that weekly net cell now come from `campaignTotals` in cents. Each row is one line with one burst whose budget is `expertRowGrossCost`. `formatAUD` still formats dollars at the edge via `fromCents`. Quantity and per-week counts are unchanged. No `setValue`.
- Files: components/media-containers/ExpertGrid.tsx, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/brain/BLAST-RADIUS.md, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set), test:expert-goldens pass (9), test:expert-grid-selection pass (14 + 5), test:money pass (74, 1 todo for buildMbaFromPersisted).
- Under 90%: a normal single line should match the old footer to the cent, because both paths call `computeBurstAmounts` and the cent round is at the burst. Several rows can move by a cent where the old footer summed floats first. Channel virtualisation tests still mirror the old float sum locally. They were not in this prompt's checks.
- Morning smoke: Open an expert grid: footer totals unchanged (to the cent) for a normal line. Not exercised in the browser here.

## AV-M10b DONE 7a23d821

- Discovery still matches. ExpertCard media and fee cells are still the inline split (was 575 to 582). Television burst readouts are still BurstReadonlyMetric (now 1581 and 1589). defaultTotalDisplay was the shared card-title gross-up. The fat-container titles were the same gross-up, a few lines off the 7 Oct numbers. The four unused helpers had no callers and are deleted. Snapshot totalMedia assignments were left as they were. No setValue, getXBursts, handleValueChange, or deliverable calculated fields were touched.
- Cells and titles now use displayLineTotals, which is lineTotals in cents. Bonus and package inclusions show $0. Client-pays shows planned media plus the fee, with "Client paid" under the media cell and under the card total. A 100% fee on a net budget shows fee $0 and a warning. Package is not zeroed. A gross-in line of 1,000 at 15% shows $850.00 and $150.00, and the title is $1,000.00.
- Files: ExpertCard.tsx, CanonicalBurstMoney.tsx, BurstRowLayout.tsx, MediaChannelContainer.tsx, the 13 fat containers, cardTitleFromLine.ts, lib/money/burst.ts, lib/money/index.ts, displayLineTotals.test.ts, CanonicalBurstMoney.test.tsx, vitest.config.ts, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set), test:expert-goldens pass (9), test:empty-channel-defaults pass (3), test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:dirty-controller pass (30 + 40), test:money pass (79, 1 todo for buildMbaFromPersisted), CanonicalBurstMoney render tests pass (4).
- Under 90%: a collapsed card still shows "Client paid" on the title, and the open media cell shows it again. A line that mixes client-pays and billed bursts shows billed media plus planned media together, with one line-level mark.
- Morning smoke: Edit a plan with a bonus line, a client-pays line and a normal line: cards match the MBA preview. Then save, and the saved amounts are unchanged (compare the MBA before and after). Not exercised in the browser here.

## AV-M10c DONE 56df1206

- Discovery still matches. The hook overallTotals split was at 584 to 590 and handleLineItemValueChange at 643 to 649. The same two functions in BVOD, Social, Digital Display, Digital Video, Digital Audio and Integration still used the inline float split. Social's header handler still sits above the snapshot. Snapshot totalMedia assignments were left as they were (hook 544, and one in each of those six containers). Investment charts, offline containers, handleValueChange and setValue were not touched.
- Those functions now call channelSummaryTotals. That is campaignTotals and lineTotals in cents. Shown media is billed media plus client-pays media, so the header matches Total Ex GST. Fee stays the agency fee. Bonus and package inclusions are $0. Package is not zeroed. onTotalMediaChange still receives media and fee in dollars, converted with fromCents. Deliverable counts stay on the bursts.
- A mixed plan (gross-in, net-in, client-pays, bonus, package inclusions, package) has a header total equal, in cents, to computeCampaignFinancials gross media plus fee for the same lines.
- Files: lib/money/burst.ts, lib/money/index.ts, lib/money/__tests__/channelSummaryTotals.test.ts, lib/mediaplan/useMediaChannelContainer.ts, BVODContainer.tsx, SocialMediaContainer.tsx, DigitalDisplayContainer.tsx, DigitalVideoContainer.tsx, DigitalAudioContainer.tsx, IntegrationContainer.tsx, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set; Digital Display mbaNumber warning is now line 1152 because the split was removed), test:money pass (80, 1 todo for buildMbaFromPersisted), test:money-golden pass (55, 1 todo), test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:dirty-controller pass (30 + 40), test:expert-goldens pass (9).
- Under 90%: adding the two dollar figures the header receives can sit a float ulp off the single cent total. The check compares them in cents. Each summary burst amount is converted on its own, so a multi-burst line's burst dollars can sit a fraction of a cent off the line total.
- Morning smoke: Campaign header total equals the MBA preview total on a digital-only plan. Not exercised in the browser here.

## AV-M10d DONE f1fad989

- Same pattern as AV-M10c (`channelSummaryTotals`). Television, Radio, Cinema, Newspaper, Magazines, OOH and Influencers still had the inline float split in overallTotals and handleLineItemValueChange. Television's header recalc stays above the snapshot (handler at 680, snapshot totalMedia at 1054). Snapshot totalMedia assignments were left as they were. Television deliverable counts still come from TARPs. Cinema deliverable counts still come from cinemaBurstDeliverables.
- Files: TelevisionContainer.tsx, RadioContainer.tsx, CinemaContainer.tsx, NewspaperContainer.tsx, MagazinesContainer.tsx, OOHContainer.tsx, InfluencersContainer.tsx, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set; the mbaNumber warnings on Television, Newspaper, Magazines and Influencers moved one line because of the new import), test:money pass (80, 1 todo for buildMbaFromPersisted), test:money-golden pass (55, 1 todo), test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:dirty-controller pass (30 + 40), test:expert-goldens pass (9).
- Under 90%: the same float ulp as AV-M10c when the header adds the two dollar figures. The cent comparison is the one that matches the MBA gross media plus fee.
- Morning smoke: A plan with TV, radio and OOH: the header total equals the MBA preview. Not exercised in the browser here.

## AV-M10e DONE b0667199

- Discovery still matches. `calculateChannelInvestmentPerMonth` was at 147 and always grossed the entered budget up. Search and the programmatic containers call that function. The fat containers' `calculateInvestmentPerMonth` still honours `budgetIncludesFees` and was not changed.
- Each month is now `lineTotals` media plus fee (client-pays planned media included, bonus and package inclusions zero), converted with `fromCents`, then `prorateAcrossMonths` through `aggregateInvestmentDisplayRows`. `onInvestmentChange` still receives the display rows. Bursts are not written.
- A gross-in $1,000 at 15% across January and February 2026 sums to $1,000.00. A net-in $1,000 at 15% sums to $1,176.47.
- Legacy month comparison (same formula as BVOD and Television, pinned against all 13 fat containers). The container modules were not imported: they load the API client, which throws without Xano environment variables.
  - Gross-in, net-in, and client-pays (gross-in and net-in) match the legacy months to the cent on that two-month fixture, including a "$1,000.00" budget string. Client-pays matches because the legacy formula never drops planned media.
  - Bonus and package inclusions: the new chart is empty. The legacy chart still shows the grossed-up budget ($1,176.47).
  - A 100% fee on a net budget: the new chart is the entered $1,000 (fee $0). The legacy amount is not finite (divide by zero).
- Files: lib/mediaplan/channelInvestment.ts, lib/mediaplan/useMediaChannelContainer.ts, lib/money/__tests__/channelInvestment.test.ts, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set), test:money pass (87, 1 todo for buildMbaFromPersisted), test:plan-drafts pass (59 + 12 + 68, 6 skipped).
- Under 90%: another fee rate or amount can still move one month by a cent where the legacy float and `toCents` disagree before proration. The locked $1,000 at 15% cases matched.
- Morning smoke: A gross-in search line: the investment chart total equals the entered budget. Not exercised in the browser here.

## AV-M10f DONE 989070a8

- `channelInvestmentByMonth` from AV-M10e was already in `lib/mediaplan/channelInvestment.ts`, so it stayed there. The 13 legacy `calculateInvestmentPerMonth` functions now return that helper and keep their form field key and fee argument. `onInvestmentChange` still receives the same month rows. Nothing is written.
- Bonus and package inclusions chart $0. Package is not zeroed. A 100% fee on a $1,000 net budget charts $1,000 media and $0 fee. Gross-in $1,000 at 15% sums to $1,000.00. Net-in sums to $1,176.47.
- Files: lib/mediaplan/channelInvestment.ts, the 13 legacy containers (BVOD, Cinema, Digital Audio, Digital Display, Digital Video, Influencers, Integration, Magazines, Newspaper, OOH, Radio, Social, Television), lib/money/__tests__/channelInvestment.test.ts, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md.
- Tests: typecheck 0, lint 0 (same warning set), test:money pass (91, 1 todo for buildMbaFromPersisted), test:money-golden pass (55, 1 todo), test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:dirty-controller pass (30 + 40), test:expert-goldens pass (9).
- Under 90%: none. The digital and offline checks read the wrapper source rather than importing the containers, because those modules load the API client.
- Morning smoke: A TV line set to bonus with a budget: the investment chart shows $0 for it. A normal radio line: the chart total equals the entered budget (gross-in) or budget plus fee (net-in). Not exercised in the browser here.

## AV-X4 DONE no commit

The client workbook builder is gone (AV-X3e, c93d74d9). The container mappers that used to feed it are still the only writers of the `LineItem[]` state on create and edit. That state still has readers, so every mapper stays whole. No props, callbacks or page state were removed. `lib/generateMediaPlan.ts` was not touched.

KEEP (reader: file:line). The same export arrays are read on the edit page at the twin call sites (naming 9719, KPI pairs from 2910, save pairs 8266 and 8582, container callbacks from 12730).

- `useMediaChannelContainer` export builder (795), used by Search and the five programmatic containers through `MediaChannelContainer`. KEEP: naming `create/page.tsx:6965`, KPI `create/page.tsx:1265` via `pickKpiLineItems` (`lib/kpi/lineItemsForFanOut.ts:23`), KPI save `create/page.tsx:5465`, Advertising Associates `create/page.tsx:1196`.
- TelevisionContainer 967. KEEP: `create/page.tsx:1209` and `create/page.tsx:1277`.
- RadioContainer 992. KEEP: `create/page.tsx:1210` and `create/page.tsx:1278`.
- NewspaperContainer 1034. KEEP: `create/page.tsx:1207` and `create/page.tsx:1279`.
- MagazinesContainer 1037. KEEP: `create/page.tsx:1208` and `create/page.tsx:1280`.
- OOHContainer 895. KEEP: `create/page.tsx:1211` and `create/page.tsx:1281`.
- CinemaContainer 904. KEEP: `create/page.tsx:1212` and `create/page.tsx:1282`.
- ProductionContainer `mapLineItemsForExport` (207, called at 600). KEEP: `create/page.tsx:1215` and `create/page.tsx:1284`.
- InfluencersContainer 783. KEEP: `create/page.tsx:1214` and `create/page.tsx:1283`.
- BVODContainer 958. KEEP: naming `create/page.tsx:6970` and KPI `create/page.tsx:1275`.
- DigitalDisplayContainer 1076. KEEP: naming `create/page.tsx:6968` and KPI `create/page.tsx:1272`.
- DigitalAudioContainer 950. KEEP: naming `create/page.tsx:6967` and KPI `create/page.tsx:1273`.
- DigitalVideoContainer 906. KEEP: naming `create/page.tsx:6969` and KPI `create/page.tsx:1274`.
- SocialMediaContainer 841. KEEP: naming `create/page.tsx:6966` and KPI `create/page.tsx:1266`.
- IntegrationContainer 837. KEEP: naming `create/page.tsx:6971` and KPI `create/page.tsx:1276`.

Not container Excel row mappers, left alone:

- `formatBuyTypeForExport` (`lib/mediaplan/buyTypeLabels.ts:64`). KEEP: `lib/generateMediaPlan.ts:273`.
- `monthsForExport` on create (5001) and edit (5069). KEEP: billing schedule blob at create 5034 and edit 5103.
- `onTelevisionLineItemsChange` and `onMediaLineItemsChange` pass form rows, not Excel rows.

DELETE: none.

- Files changed: none in the product. This log only.
- Tests: not run. No product file changed.
- Under 90%: KPI prefers the media rows and only falls back to the export rows when the media array is empty (`lineItemsForFanOut.ts:23`). Naming and the Advertising Associates check read the export arrays directly. That is enough to keep them.
- Morning smoke: Create and edit pages load. Every container renders and saves. "Naming conventions" still downloads. The draft media plan still downloads. Not exercised in the browser here.

## AV-00 PARKED no commit

Night 2 stopped at the pre-flight. Branch is localhost. The required log entries are present: AV-F4, AV-F5, AV-F6a, AV-F6b, AV-M10a, AV-M10b, AV-M10c, AV-M10d, AV-M10e, AV-M10f and AV-X4 are all DONE.

Git status shows modified tracked files other than this log. Untracked discovery files were ignored. The working tree was left as it is. No baseline was run. No Night 2 header was written. Tonight's prompts were not started.

Modified tracked files:

- app/globals.css
- app/scopes-of-work/[id]/edit/page.tsx
- app/scopes-of-work/create/page.tsx
- components/charts/system/domain-charts.tsx
- components/creative/CreativeAdminLanding.tsx
- components/dashboard/campaign/__tests__/__snapshots__/SpendChartsRow.test.tsx.snap
- components/dashboard/delivery/channels/__tests__/channelMediaTypeColour.test.ts
- components/ingest/ParseReviewScreen.tsx
- components/mediaplans/PlanWizardShell.tsx
- components/ui/ProgressBar.tsx
- components/ui/alert-dialog.tsx
- components/ui/badge.tsx
- components/ui/chart.tsx
- components/ui/command.tsx
- components/ui/dialog.tsx
- components/ui/dropdown-menu.tsx
- components/ui/popover.tsx
- components/ui/select.tsx
- components/ui/sheet.tsx
- components/ui/toast.tsx
- components/ui/tooltip.tsx
- docs/brain/BLAST-RADIUS.md
- docs/brain/INVARIANTS.md
- docs/brain/KNOWN-ISSUES.md
- docs/client-dashboard/README.md
- lib/brand/__tests__/parity.test.ts
- lib/chart-theme.ts
- lib/finance/accrualExcel.ts
- lib/finance/excelFinanceExport.ts
- lib/finance/forecast/exportFinanceForecast.ts
- lib/finance/forecast/exportTargetVsActual.ts
- lib/generateBillingSchedulePDF.ts
- lib/generateMBA.ts
- lib/generateScopeOfWork.ts
- lib/naming/bestPractice.ts
- lib/naming/exportNamingWorkbook.ts
- lib/naming/exportTraffickingWorkbook.ts
- lib/nav/routeManifest.ts
- lib/ops/digest/email.ts
- lib/ops/health/email.ts
- lib/pacing/status.ts
- lib/pdf/brandPdf.ts
- lib/specs/buildMiWorkbook.ts
- lib/utils.ts
- package.json
- scripts/brand/render-sample-exports.ts
- styles/chart-tokens.css
- tailwind.config.cjs

- Files changed by this prompt: this log only.
- Tests: not run.
- Under 90%: none. The dirty files match the uncommitted design-system follow-up that was left in the tree.
- Morning smoke: none. The night did not start.

## AV-I1 DONE a45ad177

No equivalent panel. The exceptions queue assigns a client on a billing row and learns a link as a side effect. It does not list unlinked contacts.

`/finance/xero` now has an Unlinked contacts section above the exceptions queue. GET and POST use `requireFinanceAdmin`. POST checks the client exists and writes one `xero_contact_links` row through `upsertXeroContactLink` with `learned_from` `manual_link`. Suggestions are not saved until Link. The row is removed optimistically and restored with a toast if the write fails.

- Files: lib/xero/contactLinks.ts, lib/xero/normalizeContact.ts, lib/xero/unlinkedContacts.ts, lib/xero/__tests__/unlinkedContacts.test.ts, app/api/finance/xero/contact-links/route.ts, app/api/finance/xero/contact-links/unlinked/route.ts, app/api/finance/xero/contact-links/__tests__/route.test.ts, components/finance/sections/xero/XeroUnlinkedContacts.tsx, components/finance/sections/xero/XeroPageClient.tsx, docs/brain/modules/finance-billing.md, docs/brain/BLAST-RADIUS.md (the panel sentence only; the design-system lines in that file stayed unstaged).
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:finance-sections pass (231 + 5 + 28 vitest), unlinkedContacts tests pass, contactLinks `applyContactLinkUpsert` pass, route tests pass (non-admin 403, one insert with `manual_link`). The contactLinks postgres case was not run. `DATABASE_URL` is the Sydney Supabase pooler, and that case writes a row.
- Under 90%: `fuzzy` is the resolver's unique normalised-name match (suffix strip), not a distance score. `mba` is the existing master-client prefix check (`mbaNumberMatchesClientIdentifier`), used only when the name and alias steps do not resolve. The hidden-invoice count also includes FY26 invoices with no contact id. The list does not filter invoice status.
- Morning smoke: `/finance/xero` as admin: about 34 unlinked contacts with suggestions. Link one. It disappears and the coverage goes up. As a non-admin the API returns 403. Not exercised in the browser here.

## AV-I2 DONE da3756bf

Client-role invoice PDF access now goes through `resolveInvoiceClient` in strict mode (contact link, alias, or MBA). A unique name match is never enough for a client download. Admins still skip resolution and stream the blob. Unresolved stays 403. Owed and draft-match still call `resolveClientFromContact` and were left as they are: they do not run the MBA step.

`best_effort` keeps the existing order: stored link, unique normalised name, alias, then MBA. An ambiguous name still skips the alias and can still take the MBA. The prompt's why-clause listed alias before the name match; the code did not, so the order was not rearranged.

- Files: lib/finance/invoices/resolveInvoiceClient.ts, lib/finance/invoices/invoicePdf.ts, lib/finance/invoices/__tests__/invoicePdf.test.ts, docs/brain/INVARIANTS.md, docs/brain/modules/finance-billing.md, docs/brain/BLAST-RADIUS.md (the invoice-PDF sentence only; the design-system lines in INVARIANTS and BLAST-RADIUS stayed unstaged).
- Tests: typecheck 0, lint 0 (same warning set), test:finance-sections pass (236 + 5 + 28 vitest). The invoice PDF suite is inside that script (21 tests, including the new resolver cases).
- Under 90%: if two `media_plan_masters` rows share an MBA number and both pass the prefix check, the resolver returns null. The old SQL used LIMIT 1. I did not check live data for that collision.
- Morning smoke: As admin, download any invoice PDF from Owed: still works. Not exercised in the browser here.

## AV-I3 DONE 75d8d20e

`GET /api/dashboard/[slug]/invoices` lists FY26 `AUTHORISED` and `PAID` Xero invoices for that client. Resolution is `resolveInvoiceClients` in strict mode, so a name-only match is absent. Admins may read any slug. A client must pass the dashboard slug gate and `assertClientAccess`. `CLIENT_INVOICES_ENABLED` defaults off: a client-role caller gets 404 while it is off, and an admin still gets the list. `totalCents` is the Xero total, GST inclusive (`totalBasis: "inc_gst"`). Overdue is authorised, amount due above zero, and due before today's Sydney civil date. Due today is not overdue.

- Files: app/api/dashboard/[slug]/invoices/route.ts, lib/finance/invoices/clientInvoices.ts, lib/finance/invoices/__tests__/clientInvoices.test.ts, lib/api/__tests__/dashboardSlug.invoices.route.test.ts, docs/brain/API-DYNAMIC-ROUTE-GATES.md, docs/brain/api-tenant-classification.md, docs/brain/modules/dashboards-charts-exports.md, docs/brain/modules/finance-billing.md, docs/brain/INVARIANTS.md, docs/brain/BLAST-RADIUS.md (the new invoices row only; the design-system lines stayed unstaged).
- Tests: typecheck 0, lint 0 (same warning set), test:finance-sections pass (236 + 5 + 28 vitest), test:tenant-isolation pass (54, including the route-guard harness). clientInvoices tests pass (4). dashboardSlug.invoices route tests pass (4). Those two files are not in a package.json script; package.json was left untouched.
- Under 90%: an `AUTHORISED` invoice with amount due of zero is labelled `due`, not `paid`. Only status `PAID` is `paid`. A full regenerate of the tenant classification counted 258 route files because untracked routes are on disk, so that output was not committed. The table row was inserted by hand and the previous recount was increased by one.
- Morning smoke: As admin, GET /api/dashboard/<slug>/invoices for a linked client returns rows. As a client user (flag off): 404. Not exercised in the browser here.

## AV-I4 DONE 88574499

`/dashboard/[slug]` renders an Invoices section below the campaign list. The title is "Invoices." Amounts are the API cents converted to dollars, and the summary says they include GST once. The PDF control is `InvoiceDocumentButton`, so a row with no PDF renders nothing. Ten rows, then Show all. Empty is "No invoices yet." A failed load uses the error card and does not show $0.00. A 404 hides the section. Admins are not 404'd by the flag, so the section stays for them. The admin finance slide-over outstanding block is that same payload, outstanding rows only.

- Files: components/dashboard/ClientInvoicesSection.tsx, components/dashboard/__tests__/ClientInvoicesSection.test.tsx, components/dashboard/ClientDashboardPageContent.tsx, lib/design/status.ts, lib/design/__tests__/status.test.ts, vitest.config.ts, docs/brain/modules/dashboards-charts-exports.md, docs/brain/INVARIANTS.md (the client invoice list sentence only; the design-system shadow line stayed unstaged).
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:status pass (4), test:finance-sections pass (236 + 5 + 28 vitest), test:client-dashboard-range pass (25 + 3 + 22 vitest). ClientInvoicesSection render tests pass (5). There is no `test:client-dashboard` script. The new file was added to the vitest include list. package.json was left untouched.
- Under 90%: I did not find a written DS decision D2. Invoice overdue uses `critical`, the same tone as billing overdue. The finance slide-over still mounts only when `campaignLinkMode` is `adminHub` (`/client/[slug]`). `/dashboard/[slug]` does not open that slide-over. The section itself is on the shared page, so it shows on `/dashboard/[slug]`.
- Morning smoke: Admin on /dashboard/<linked client>: Invoices section with PDFs downloading. Slide-over shows outstanding. Light and dark. Not exercised in the browser here. The slide-over is on the admin client hub, not the tenant dashboard.

## AV-I5 DONE 8cd6d64a

The client dashboard shows one factual overdue line when the invoices payload has `overdueCount` above zero. There is no dollar threshold and no dismiss control. A 404 hides it with the invoices section. The amount is `overdueCents` converted to dollars. One overdue invoice uses its number and the civil due date (`1 September 2026` for `2026-09-01`). Several use the count and the total. "View invoices" scrolls to the invoices section. `ACCOUNTS_CONTACT_EMAIL` is read on the server and passed in. The thank-you sentence is omitted when that value is unset or blank.

- Files: components/dashboard/ClientOverdueNotice.tsx, components/dashboard/__tests__/ClientOverdueNotice.test.tsx, components/dashboard/ClientInvoicesSection.tsx, components/dashboard/ClientDashboardPageContent.tsx, app/dashboard/[slug]/page.tsx, app/client/[slug]/page.tsx, vitest.config.ts, docs/brain/modules/dashboards-charts-exports.md, docs/brain/INVARIANTS.md (the Owed reminder sentence only; the design-system shadow line stayed unstaged).
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:status pass (4), test:finance-sections pass (236 + 5 + 28 vitest), test:client-dashboard-range pass (25 + 3 + 22 vitest). ClientOverdueNotice render tests pass (4). ClientInvoicesSection render tests still pass (5). There is no `test:client-dashboard` script. package.json was left untouched.
- Under 90%: a single overdue invoice with a blank number says "An invoice" rather than inventing a number. The summary has no invoice number, so the number and due date come from the one overdue row in the same response.
- Morning smoke: Admin on a client with an overdue invoice (16 are overdue in FY26 data): the banner shows with correct copy. Not exercised in the browser here.

## AV-I6 DONE 55ec0a1c

`GET /api/cron/overdue-digest` emails ops a weekday list of overdue FY26 invoices. `OVERDUE_DIGEST_ENABLED` must be exactly `true`. Saturday and Sunday in Sydney are skipped. A row in `overdue_digest_sends` for today's Sydney date returns `already_sent` and does not send. Nothing overdue sends nothing and writes no row. The email uses the ops digest shell and `EMAIL_FONT_STACK`. Subject is `Overdue invoices: {n} totalling {amount}`. Clients resolve with `best_effort`. Unresolved contacts sit under "No client link" with the Xero contact name and a link to `/finance/xero`. Ageing matches owed: day 60 is 31-60, day 61 is 60+. Totals are Xero amount due, GST inclusive. The row is inserted after the email succeeds. A failed insert is logged and the route still returns 200.

Migration `0093_overdue_digest_sends.sql` is authored only. Do not apply `db/drizzle/0010_gifted_ben_parker.sql`. That snapshot catch-up also creates `finance_clearance_sends` and adds three billing columns that were already in `db/schema` but missing from snapshot 0009. Apply `0093` in the SQL editor. RLS is on with no policies.

Vercel cron is `30 1 * * 1-5` (01:30 UTC, after the Xero sync).

- Files: db/migrations/0093_overdue_digest_sends.sql, db/schema/overdueDigestSends.ts, db/schema/index.ts, db/drizzle/0010_gifted_ben_parker.sql, db/drizzle/meta/0010_snapshot.json, db/drizzle/meta/_journal.json, lib/finance/overdueDigest.ts, lib/finance/__tests__/overdueDigest.test.ts, app/api/cron/overdue-digest/route.ts, vercel.json, docs/brain/DATA-MODEL.md, db/README.md, docs/brain/modules/finance-billing.md, docs/brain/INVARIANTS.md (the digest sentence only; the design-system shadow line stayed unstaged).
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:finance-sections pass (236 + 5 + 28 vitest), check:drizzle-snapshot pass, overdueDigest tests pass (7). The new test is not in a package.json script. package.json was left untouched.
- Under 90%: if `OPS_EMAIL_TO` is unset, `getOpsEmailRecipients()` still returns its existing default address. The link uses `APP_BASE_URL` when that is set, otherwise the path `/finance/xero`.
- Morning smoke: After `0093` is applied and `OVERDUE_DIGEST_ENABLED=true`: trigger the cron with the secret on a preview; one email; a second call says `already_sent`. Not exercised here. The cron was not run and no email was sent.

## AV-A1 DONE 9e70ccd8

`assembled-insight-commentary` is 1.2.0. The four-rung ladder is gone. Each finding is Insight, then Action, then Outcome, in that order, with those labels. The output is a one-sentence Summary, then 2 to 4 of those items. What, how, why and what next stay a thinking checklist. AV rules kept: priors from `get_campaign_insights`, numbers from the page, no invented dollars, ask below 90% confidence, three anchors, three rings, Australian English, no em dashes. `VERSION.json` sets this skill to 1.2.0 and adds `editedInRepo`. The worked example was rewritten to the same shape so it no longer demonstrates the old headings. Injection budget still passes. The new section was not shortened.

Sibling skills still describe the old ladder (`assembled-audience-insight`, `assembled-performance-review-report`, `assembled-presentations`). They were left as they are.

- Files: lib/ava/skills/content/assembled-insight-commentary/SKILL.md, lib/ava/skills/content/assembled-insight-commentary/references/example-output.md, lib/ava/skills/content/VERSION.json.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:ava-skills pass (11), test:campaign-read pass (31 + 8 vitest).
- Under 90%: none.
- Morning smoke: In AVA on a campaign page, press "Write commentary". The reply should have a summary, then labelled Insight, Action and Outcome items. Not exercised here.

## AV-A2 DONE 9130d5d1

`assembled-performance-review-report` is 1.1.0. Commentary is a Summary plus 2 to 4 Insight, Action and Outcome items, following commentary 1.2.0. The separate insights-and-recommendations stage is gone. Recommendations are the Actions, and each Action says in-flight (this campaign) or next period. Chat still shows the narrative and builds the deck only after an explicit yes. When the app builds the report without chat, the same structure is returned as JSON. The model supplies text only. The deck is the v5 template applied by the app. Tool field names are unchanged: `execSummary`, `keyInsight`, `insights`, `recsInFlight`, `recsNextPeriod`.

`assembled-presentations` is 1.3.0. Sand grounds, ink text, sky for Insight, forest for Action, lime for Outcome. Never teal, steel blue, purple, emerald, gradients or drop shadows. Slide title is the Insight as a sentence ending in a full stop. Body is the evidence. Kicker is the Action. Hero numbers carry the Outcome. Outline-only mode inside Assembled View is kept. The skill tells the model never to load `assets/assembled-template.pptx`.

`assembled-campaign-read` is 1.4.0. Still six beats. Coming up is an Action with an owner and an Outcome. The reject rules for KPIs and for promising a follow-up are unchanged. `skillGuidance.ts` names Insight, Action and Outcome for commentary and reports, and still says "four questions" and "outline-only".

- Files: lib/ava/skills/content/assembled-performance-review-report/SKILL.md, lib/ava/skills/content/assembled-presentations/SKILL.md, lib/ava/skills/content/assembled-campaign-read/SKILL.md, lib/ava/skills/skillGuidance.ts, lib/ava/skills/content/VERSION.json.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:ava-skills pass (11), test:campaign-read pass (31 + 8 vitest), test:performance-report-insights pass (13).
- Under 90%: the file's commentary stage was Stage 2 and the insights stage was Stage 3. The prompt called those Stage 3 and Stage 4. I merged the insights stage into commentary and left the report as Stage 4. Deck narrative fields still may not contain a free-text dollar amount, so an Outcome that is money is named without a `$` in those fields. The presentations python block still lists old slide numbers for use outside Assembled View. `slide-catalogue.md` and `buildCampaignReportDeck.ts` still name `assembled-template.pptx`. They were outside this prompt. `assembled-audience-insight` still describes the old ladder.
- Morning smoke: AVA "Review & Report" style request in chat: commentary in Insight, Action and Outcome; no mention of old colours. Not exercised here.

## AV-A3 DONE 7ac409f1

Every chat now has one voice rule: a finding or a recommendation is Insight, Action, Outcome. The so-what carries its number, the next step names an owner, and the effect is a number or a measurement plan. The labels are inline bold words, so they do not break the no-headers rule. The 150-word default holds at most two of those items. If more belong, AVA says "Ask for more" and stops. A loaded skill that sets its own length, such as a performance review, follows that skill. Decision AV-D3 is on `docs/brain/AVA-VOICE.md`.

- Files: src/ava/voiceSpec.ts, lib/ava/buildAvaSystemPrompt.ts, docs/brain/AVA-VOICE.md.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:ava-skills pass (11), loadIngestIntoForm.test.ts pass (16), including the create/edit system prompt assertions. No snapshot of the system prompt exists, so none was updated.
- Under 90%: none on the rule itself. The two-item cap is scoped to the default 150-word reply so it does not override the performance-review skill, which already allows 2 to 4 items and about 500 words.
- Morning smoke: Ask AVA "how is this campaign going?" on a campaign page: the answer uses the three labels. Not exercised here.

## AV-A4 DONE fa62e7c2

`campaign_insights` gains nullable `action`, `action_owner`, `outcome` and `outcome_kind`. `insight_type` stays the category. `outcome_kind` is null, `achieved`, or `expected`. Old rows stay valid. Reads return the four fields (null when unset): the library query, the write path's returning select, and `get_campaign_insights` / `get_client_insights`. Inserts still omit them. Writers that store the values are AV-A5.

Pre-push: apply `0094_campaign_insights_action_outcome.sql` in the SQL editor before this code is deployed. Reads that select the new columns will fail until then. Do not apply `db/drizzle/0011_acoustic_shinko_yamashiro.sql`. That file is the snapshot bookkeeping only.

- Files: db/migrations/0094_campaign_insights_action_outcome.sql, db/schema/insights.ts, db/drizzle/0011_acoustic_shinko_yamashiro.sql, db/drizzle/meta/0011_snapshot.json, db/drizzle/meta/_journal.json, docs/brain/DATA-MODEL.md, db/README.md, lib/insights/queryCampaignInsights.ts, lib/insights/writeCampaignInsights.ts, lib/ava/tools/getCampaignInsights.ts, lib/insights/__tests__/insightsLibrary.ui.test.ts.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), check:drizzle-snapshot pass, test:insights-library pass (31, 1 skipped), test:performance-report-insights pass (13), test:ava-skills pass (11).
- Under 90%: the live EXPLAIN test skipped because the database host was unreachable (ENOTFOUND). That skip is the test's own unreachable-database path, not a new failure. The write module now selects the new columns on return so the shared row type stays honest. It does not write them.
- Morning smoke: After the migration is applied: /insights loads. Not exercised here. The migration was not applied.

## AV-A5 DONE 7bcc686f

Insight cards on /insights and the dashboard recent-insights panel show an Insight tag on the body. When the row has an action, an Action tag, the action text, and "Owner: {name}" when an owner is stored. When the row has an outcome, an Outcome tag, the outcome text, and a small Achieved or Expected label. Tags use StatusPill tones insight, action and outcome. Rows with no action and no outcome keep the existing type and source badges and the body, plus the Insight tag only.

The performance-report writer stores action, action_owner, outcome and outcome_kind when the narrative carries a `findings` array, in the same order as keyInsight, the three insights, recsInFlight and recsNextPeriod. Camel case and snake case are both read. A kind that is not achieved or expected is stored as null so the check does not drop the row. Payloads without findings still write nulls. priorInsightGuard and the invented-money check stay on the report tool, unchanged.

The human create and edit path still does not send these fields. A body-only edit does not clear them.

- Files: components/insights/InsightFinding.tsx, app/insights/InsightsPageClient.tsx, components/insights/InsightListRow.tsx, components/insights/RecentInsightsPanel.tsx, lib/reports/persistPerformanceReportInsights.ts, lib/reports/__tests__/persistPerformanceReportInsights.test.ts, lib/insights/__tests__/insightsLibrary.ui.test.ts.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:insights-library pass (34, 1 skipped ENOTFOUND on the live EXPLAIN), test:performance-report-insights pass (14), test:status pass (4).
- Under 90%: AV-A8 and AV-A9 were not in this prompt, so the optional `findings` array is the shape they need to pass. The human Quick Add form was left as a body-only writer.
- Morning smoke: /insights in light and dark: tags in sky, forest and lime; old insights unchanged. Not exercised here. Apply 0094 before this is deployed. The migration was not applied.

## AV-A6 DONE d8ac482f

The v5 deck is in the repo at `lib/reports/assets/v5/am-template-deck-16x9.pptx`. It is not fetched at runtime. First bytes are PK (zip). Size 7171584 bytes. SHA-256 9AC7E8A3936C589FAF966A2E83DA25D9A845DD606EFE9F8E47C52C434E2B2C23.

`scripts/reports/describe-pptx-layouts.ts` lists each slide layout and the slide master (name, index, placeholder type, idx, name, position and size in EMU) plus theme fonts and colours. Output is `lib/reports/assets/v5/LAYOUTS.md`. One master, 20 layouts, 70 placeholders. Every `p:ph` tag was listed.

Theme `ppt/theme/theme1.xml` is named Assembled Media 05b and is the one the presentation and slide master use. Sand, ink, forest, lime and sky match tokens.json. The other scheme colours are also tokens: white, forestLight, context, panel. The major font is Plus Jakarta Sans ExtraBold, not Plus Jakarta Sans. The minor font is Plus Jakarta Sans. Instrument Serif is not a theme font. That name does appear in 25 XML parts. `ppt/theme/theme2.xml` is the Office notes theme (Aptos), not the slide master.

`outputFileTracingIncludes` now traces `./lib/reports/assets/v5/**` for `/api/chat-v2` (skills were already traced), and both the v5 assets and `./lib/ava/skills/content/**` for `/api/campaigns/export-report`, `/api/cron/reports-worker` and `/api/admin/reports/runs/[id]/generate`. The old templates were left in place.

- Files: lib/reports/assets/v5/am-template-deck-16x9.pptx, lib/reports/assets/v5/LAYOUTS.md, scripts/reports/describe-pptx-layouts.ts, next.config.mjs.
- Tests: typecheck 0, lint 0 (same warning set, none in these files). No test script was named.
- Under 90%: none on the file or the map. The theme font difference is recorded in LAYOUTS.md, not guessed.
- Morning smoke: Open lib/reports/assets/v5/am-template-deck-16x9.pptx in PowerPoint: it's the v5 deck. Not exercised here.

## AV-A7 DONE 221b2760

The campaign report deck is built on `lib/reports/assets/v5/am-template-deck-16x9.pptx` through pptx-automizer. Each slide is chosen by layout name (Cover - Sand, Title and Text, Two Column, Statement - Sky, Thank You - Black). The slide number is read from the template at build time. Colours and the sans font come from `lib/brand`. There is no literal hex. Chart bars are pill-ended shapes in forest (delivered) and context grey (previous and planned), with a value label and no gridlines. A family-colour dot marks the channel. Every chart slide has a sand insight card tagged Insight, and the sentence is the data headline (for example "Search delivered 34% of spend."). Commentary is `ReportCommentary | null`. The assembler returns null, and the slide says "Commentary not generated for this period." The PLACEHOLDER strings are gone. Titles are sentence case and end in a full stop. Client and campaign names stay as entered.

`scripts/reports/render-sample-campaign-report.ts` wrote `tmp/overnight-reports/campaign-report-PENFOLD013-this-month-20261008.pptx` (7,241,299 bytes, nine slides). tmp is not staged. The fixture script no longer builds a deck when it is imported.

Follow-up: `buildPlannerDeck` still uses `assembled-template.pptx`. It was not touched. `docs/brain/modules/dashboards-charts-exports.md` still describes the old template and the PLACEHOLDER. It was outside this prompt.

- Files: lib/reports/campaignReport/buildCampaignReportDeck.ts, lib/reports/campaignReport/assembleCampaignReportData.ts, scripts/smoke-campaign-report-fixture.ts, scripts/reports/render-sample-campaign-report.ts.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), campaign report tests pass (24: filename, periods, buildPerformanceReport, parseReportExportPath, performanceReportHardNumbers, persistPerformanceReportInsights), test:charts-registry pass (6 + 2 vitest), test:brand pass (80).
- Under 90%: bars are shapes, because a native chart bar cannot pill its ends. The family colour is a dot, not the bar, because the series are spend measures and the highlight stays forest. Cover, Statement - Sky and Thank You still carry the template's arches and images under the new text. That was not opened in PowerPoint. The published campaign read is no longer pasted onto this slide.
- Morning smoke: Open tmp/overnight-reports/*.pptx, then press Review & Report on a live campaign (admin): the v5 look, brand colours, insight cards, and the commentary slide shows the not-generated line. The file was rendered here. PowerPoint and the live button were not exercised.

## AV-A8 DONE 9de9916f

Review & Report now asks AVA for Insight, Action and Outcome commentary and puts it on the v5 commentary slide. `generateReportCommentary` loads `assembled-insight-commentary` 1.2.0 the way `load_skill` does, plus the report skill's commentary stage. The model sees the assembled report, the published campaign read when one exists, and live priors. It must return JSON. Zod checks 2 to 4 items and the character caps. A dollar or percent figure is rejected unless that number is already in the input. An unattributed prior restatement is rejected. One retry, then null. A 60 second timeout returns null. The deck still downloads.

The export route `maxDuration` is 300 because two model attempts plus the delivery snapshots can exceed 120 seconds. The route logs assembled time and deck time. After the deck is built, the items are saved with `persistPerformanceReportInsights`, source `ava`, and the action, owner and outcome columns. The origin is `origin:review-report` on the existing `confidence` field. The period is the window's start month (`YYYY-MM`). A second export for the same MBA and period skips bodies that are already stored. Persist did not dedupe before this.

- Files: lib/reports/campaignReport/generateReportCommentary.ts, lib/reports/campaignReport/__tests__/generateReportCommentary.test.ts, lib/reports/campaignReport/assembleCampaignReportData.ts, lib/reports/performanceReportHardNumbers.ts, lib/reports/__tests__/performanceReportHardNumbers.test.ts, lib/reports/persistPerformanceReportInsights.ts, lib/reports/__tests__/persistPerformanceReportInsights.test.ts, app/api/campaigns/export-report/route.ts.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), generateReportCommentary pass (4), test:performance-report-insights pass (17), campaign report filename/periods/buildPerformanceReport/parseReportExportPath pass (10), test:insights-library pass (34, 1 skipped ENOTFOUND on the live EXPLAIN), test:campaign-read pass (31 + 8 vitest), test:ava-skills pass (11).
- Under 90%: the report skill has no Stage 3 heading. AV-A2 folded that stage into Stage 2 commentary, and that is the section loaded. Priors use `listRecentLiveInsightsForMba` on the app database (live rows, limit 15). `get_campaign_insights` reads the same table through the read-only AVA client. A share the model calculates, such as 54% of spend, is rejected unless that number is already in the input text. `docs/brain/modules/dashboards-charts-exports.md` still describes the old template and the PLACEHOLDER. It was outside this prompt.
- Morning smoke: Review & Report on two live campaigns: the commentary slide has 2 to 4 items, every number traceable to the data slides; /insights shows the new items with tags. Not exercised here. No email was sent and no cron was run.

## AV-A9 PARKED

The token template was not deleted and the tool was not switched. The old deck shows figures the campaign report does not.

Old deck fields the campaign report does not show:

- CPM, always, from delivery totals. The campaign report has no CPM line.
- CPC, always, from delivery totals. The campaign report has no CPC line.
- CTR from the delivery snapshot, always. The campaign report shows CTR only when a stored campaign KPI target exists, as target versus actual. The metrics it can show are ctr, cpv, conversion rate, vtr and frequency.
- 3-second video views, when the snapshot has any. The campaign report does not show them.
- A spend-pace percent box. The period summary shows delivered, planned and expected to date, and time elapsed, but not that pace percent.
- Four channel commentary sentences, four next steps (when and what), and the fixed insight and recommendation lines. Those are narrative shapes the commentary items replace. They are not missing measurements.

CPM, CPC and snapshot CTR are the material gap. No files were changed. No patch. No commit.

- Morning smoke: In AVA on a campaign: ask for a performance review, approve, download: the same v5 deck as Review & Report. Not exercised. Blocked on the KPI gap above.

## AV-R1 DONE fe9ae287

Authored `0095_report_runs.sql` only. It was not applied. `clients.id` is bigint, so `report_runs.client_id` is a nullable bigint foreign key to `clients.id`. `report_runs` is unique on `(kind, mba_number, period_start)` and indexed on `(kind, period_start, status)`. `report_digest_sends` has primary key `(kind, period_start)`. Both tables have RLS enabled and no policies. The Drizzle mirror is `db/schema/reportRuns.ts`, exported from the schema index. Constraint names match the names Postgres will give the authored SQL (`report_runs_client_id_fkey`, `report_digest_sends_pkey`). Do not apply `db/drizzle/0012_wild_firelord.sql`. That file is the snapshot bookkeeping only.

- Files: db/migrations/0095_report_runs.sql, db/schema/reportRuns.ts, db/schema/index.ts, db/drizzle/0012_wild_firelord.sql, db/drizzle/meta/0012_snapshot.json, db/drizzle/meta/_journal.json, docs/brain/DATA-MODEL.md, db/README.md.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), check:drizzle-snapshot pass. No test file was named or touched.
- Under 90%: none. RLS is in the SQL and not in the Drizzle snapshot, which is the same as the other server tables.
- Morning smoke: None until applied. The migration was not applied.

## AV-R2 DONE 92e61793

`generateCampaignReportForMba` resolves the published version from `media_plan_masters.published_version_id` (and requires `published_at`), then the client name, campaign name, flight dates and search flag. It assembles the deck from those values. Commentary runs only when `withCommentary` is true, and only after the skip check. A period whose lines are all `no_source` or `no_rows_yet`, or that has no lines, returns `skipped` and does not build a deck. `store: true` writes through `storePerformanceReport` under `exports/reports/{mba}/`. The clean download name is `{client}-{campaign}-report-{yyyy-mm}.pptx`.

The export route still requires admin and the rate limit. The body is `mbaNumber` and `period`. Client name, campaign name, version, dates and `mpSearchEnabled` are ignored, with a deprecation log when they are sent. `periodKind` is still read when `period` is absent, and that send is logged too. The route streams the buffer (`store: false`). Review & Report now posts `period` only.

- Files: lib/reports/campaignReport/generateCampaignReportForMba.ts, lib/reports/campaignReport/__tests__/generateCampaignReportForMba.test.ts, lib/reports/campaignReport/assembleCampaignReportData.ts, app/api/campaigns/export-report/route.ts, app/api/campaigns/export-report/__tests__/export-report.route.test.ts, components/dashboard/campaign/CampaignReportPeriodDialog.tsx.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), campaign report tests pass (19, including the new generator tests and commentary, periods, filename, parseReportExportPath, buildPerformanceReport), export route test pass (1), test:campaign-documents pass (41 + 14 + 20).
- Under 90%: search is on only when the published version channel flag `search` or `mp_search` is set. A missing flag is off, matching the campaign page. The old export treated a missing body flag as on, because the dialog never sent it. `docs/brain/modules/dashboards-charts-exports.md` still describes the old template and the old request body. It was outside this prompt.
- Morning smoke: Review & Report still downloads the same deck. Not exercised here.

## AV-R3 DONE 73f47fd9

`sendHtmlEmail` accepts optional `attachments` (`filename`, `contentType`, `contentBase64`) and `replyTo`. Attachments are mapped to SendGrid's `content`, `filename`, `type` and `disposition: attachment`. The 3 MB cap is the decoded byte total. One byte over throws `Email attachments total N bytes, over the 3 MB limit.` and SendGrid is not called. Callers that omit the new fields send the same payload as before. No email was sent.

- Files: lib/email/sendHtmlEmail.ts, lib/email/__tests__/sendHtmlEmail.test.ts.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), sendHtmlEmail tests pass (3). package.json has no digest script. The email match is `test:codex-auth0-roster`, which passed (34).
- Under 90%: none. The cap counts decoded bytes, so a 3 MB file is allowed and 3 MB plus one byte is refused.
- Morning smoke: None.

## AV-R4 DONE d2cadb08

`GET /api/cron/reports-enqueue` checks the cron secret first (401), then `AUTO_REPORTS_ENABLED` (200 `{ skipped: "disabled" }` unless the value is exactly `true`), then the Sydney civil day. It queues only on the 4th and 5th. The period is the previous Sydney calendar month. Selection is `selectMonthlyReportMbas`: published version (`published_version_id` and `published_at`), commercial status through `resolveFinanceCampaignStatus` and `isApprovedOrBeyond`, campaign dates overlapping the period. Cancelled is excluded. Inserts are `status: queued` with `on conflict do nothing` on `(kind, mba_number, period_start)`. The Vercel schedule is `5 20 3,4 * *`. 20:05 UTC on the 3rd is 07:05 AEDT on the 4th (06:05 AEST). 20:05 UTC on the 4th is the 5th in Sydney, the retry. The cron was not run. 0095 was not applied.

- Files: app/api/cron/reports-enqueue/route.ts, lib/reports/selectMonthlyReportMbas.ts, lib/reports/__tests__/selectMonthlyReportMbas.test.ts, vercel.json, docs/brain/DATA-MODEL.md, docs/brain/modules/shared-core.md, docs/brain/api-tenant-classification.md, docs/brain/tenant-isolation-audit.md.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), selectMonthlyReportMbas tests pass (3).
- Under 90%: a non-blank master `campaign_status` wins, so a booked published version whose master is still planned is excluded. Stored `completed` is included because `isApprovedOrBeyond` treats it as beyond. An MBA with no start or end date is excluded. Version dates are used, and a blank side falls back to the master. Sydney today is `getMelbourneTodayISO` (same civil calendar). `MAP.md` still says 17 crons. That count was already short of `vercel.json`, so it was left alone.
- Morning smoke: None until the flag is set. Do not run the cron until 0095 is applied.

## AV-R5 DONE b63eea91

`GET /api/cron/reports-worker` checks the cron secret, then `AUTO_REPORTS_ENABLED`, then the Sydney 4th or 5th. `maxDuration` is 300 and the region is syd1. Each run resets rows stuck in `generating` for more than 30 minutes (back to queued under 3 attempts, otherwise failed with `timed out 3 times`), then claims one row at a time with `for update skip locked`, up to `REPORTS_WORKER_BATCH` (default 3). A claim only starts when more than 60 seconds of the 240 second budget remains. Each claimed row calls `generateCampaignReportForMba` with `store: true` and `withCommentary: true`, using the row's period as a custom range. Success writes `generated` with the blob path, file name and commentary flag. A skip writes `skip_reason`. A throw writes `failed` with the error trimmed to 500 characters. One log line records claimed, generated, skipped, failed and duration. The Vercel schedule is `20 * 3-5 * *`. The cron was not run. 0095 was not applied.

- Files: app/api/cron/reports-worker/route.ts, lib/reports/runReportsWorker.ts, lib/reports/reportsWorkerStore.ts, lib/reports/__tests__/runReportsWorker.test.ts, vercel.json, docs/brain/DATA-MODEL.md, docs/brain/modules/shared-core.md, docs/brain/api-tenant-classification.md, docs/brain/tenant-isolation-audit.md.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), runReportsWorker tests pass (4), check:client-server-only pass.
- Under 90%: the deck period is the row's `period_start` and `period_end` passed as `custom`, so the slide label says custom range. A generated result with no blob path is marked failed. Requeue clears `error` and `finished_at`.
- Morning smoke: None until the flag is set. Do not run the cron until 0095 is applied.

## AV-R6 DONE de83957c

At the end of each reports-worker run, one internal email goes out for the previous Sydney month when that period already has `report_runs` rows, nothing for the period is queued or generating (or it is 16:00 or later on the Sydney 5th), and `report_digest_sends` has no row for `(monthly_campaign, period_start)`. Zero rows never send. A second run sees the digest row and does not send again. Recipients are `REPORTS_EMAIL_TO` when set, otherwise `getOpsEmailRecipients()`. The mail goes through `sendHtmlEmail` with no attachments. Subject is `Monthly campaign reports: {Month yyyy}`. The body uses the ink-band email shell, then counts, then one table per client (campaign, MBA, status, and a Download link to `{APP_BASE_URL}/api/reports/download?path=`). Skipped and failed rows show their reason. No email was sent. 0095 was not applied.

- Files: app/api/cron/reports-worker/route.ts, lib/reports/reportDigest.ts, lib/reports/reportDigestStore.ts, lib/reports/__tests__/reportDigest.test.ts, docs/brain/DATA-MODEL.md, docs/brain/modules/shared-core.md.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), reportDigest tests pass (4).
- Under 90%: if the digest insert fails after the email is sent, the error is logged and the route still returns. The next hour could send again. A missing `APP_BASE_URL` makes the download link a path, with no host filled in. Client names come from `media_plan_masters.mp_client_name`. There is no shared email layout function, so the shell matches the ops health ink band.
- Morning smoke: None until the flag is set. Do not run the cron until 0095 is applied.

## AV-R7 DONE 7ef667c6

`/admin/reports` uses the same client `AdminGuard` as the other admin pages, inside PageShell and PageHeader, so the heading reads "Reports." The month picker defaults to the previous Sydney month. The table is `report_runs` for that month: client name from `media_plan_masters`, MBA, a status pill (generated is outcome, queued or generating is neutral, skipped is neutral with the reason, failed is critical), commentary yes or no, generated at, Download via `/api/reports/download?path=`, and Generate now.

`GET /api/admin/reports?period=YYYY-MM` supplies the table. `requireAdmin` gates it. Generate now is `POST /api/admin/reports/runs/[id]/generate` with `maxDuration` 300. It marks the row generating, then runs `generateCampaignReportForMba` for that MBA and period (`store: true`, `withCommentary: true`) and writes generated, skipped, or failed. It does not send email. Queue for the month is `POST /api/admin/reports/enqueue` with `{ period }`. It inserts missing queued rows for that month through `selectMonthlyReportMbas` and does not generate. The page says the worker runs on the 4th and 5th. The page is in the route manifest and the admin sidebar, after Schedule ingest. 0095 was not applied. The list and queue routes surface an error if the table is missing, rather than an empty month.

- Files: app/admin/reports/page.tsx, app/api/admin/reports/route.ts, app/api/admin/reports/enqueue/route.ts, app/api/admin/reports/runs/[id]/generate/route.ts, app/api/admin/reports/__tests__/admin-reports.route.test.ts, lib/reports/adminReportRunsStore.ts, lib/reports/selectMonthlyReportMbas.ts, lib/reports/__tests__/selectMonthlyReportMbas.test.ts, lib/nav/routeManifest.ts, lib/nav/__tests__/routeManifest.test.ts, docs/brain/MAP.md, docs/brain/DATA-MODEL.md, docs/brain/modules/admin-misc.md, docs/brain/modules/shared-core.md, docs/brain/api-tenant-classification.md, docs/brain/tenant-isolation-audit.md.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), admin report route tests pass (4), selectMonthlyReportMbas tests pass (3), routeManifest tests pass (8), test:finance-sections pass, check:client-server-only pass.
- Under 90%: the list GET was not named in the prompt. The page is a client component, so it needs a JSON source. Manual generate does not increment `attempts`, so it does not use the worker's three-attempt cap. The row is set to generating first. Region is syd1, matching the worker. The prompt only named `maxDuration`. The published-version candidate query is copied from the enqueue cron. The selection helper is shared. The page was not opened in the browser. Auth is required, and 0095 is not applied, so a live query would fail.
- Morning smoke: After the migrations are applied, open `/admin/reports` for last month, use Generate now on one live MBA, and download it. Do not expect the page to work until 0095 is applied.

## AV-G2 DONE 23735bb5

`scripts/check-money-inline.mjs` counts inline money maths in `.ts` and `.tsx` files outside `lib/money`, tests, `scripts/`, and `tmp`. The patterns are `(100 -` or `(100-` near a fee or pct identifier, `* 100) / 100`, `Math.round` whose argument contains `* 100`, a money identifier (amount, budget, cost, spend, fee, total, gross, net, media) calling `toFixed(2)`, `/ 100` next to a fee identifier, and local functions named `parseMoney`, `parseAmount`, `formatCurrency`, `roundCents`, or `toCents`. Counts live in `scripts/money-inline-baseline.json` (115 files, 250 hits). A higher count or a new file fails and prints the lines with `use lib/money`. A lower count passes. `--update` rewrites the baseline. `npm run check:money-inline` is in `gate:main` after `check:hardcoded-urls`. ESLint `no-restricted-syntax` was not added. The same patterns already match the baseline, so a warn would fire on existing debt on every lint.

- Files: scripts/check-money-inline.mjs, scripts/money-inline-baseline.json, package.json, docs/brain/CONVENTIONS.md.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), check:money-inline pass. A throwaway file with the patterns failed the gate, then was deleted.
- Under 90%: "near" is the match plus about 80 characters, not a full expression parse. `Math.round` with `* 100` also counts percent formatting, which is what the pattern says. `tmp/` is skipped so untracked scratch is not in the baseline. The prompt did not name `tmp`.
- Morning smoke: None.

## AV-G3 DONE f7ee22fc

The brain now matches the code for this pack. Money rounds through `lib/money` `toCents`. Expected spend compared with delivered spend is media only. The app builds media plan workbooks only through `lib/docs/mediaPlanWorkbook.ts`. Tests still call `generateMediaPlan` directly. A clean file comes from a published version's stored file. Client invoice access is strict. The overdue notice is derived at render. The overdue digest is internal. AVA commentary, the campaign read, and the performance review write Insight, Action and Outcome. Monthly campaign reports are internal and are generated on the Sydney 4th and 5th.

C-152 names `3d150b67`. C-5 is closed: one `computeLoadedDeliverables` remains. C-154 records the published workbook ad serving fix (`8bfdd2e3`). B-3 (client-server-only) was already closed. The route manifest row for `/design-system` is the unstaged design-system UI-11 line, already marked fixed, and was not staged. Public legal pages are already in `ROUTE_MANIFEST_EXCLUSIONS`.

C-153 is the planner deck, still `assembled-template.pptx`, including `generate_performance_report`. C-155 records the client-pays Total Ex GST decision: full-scope totals include that net media, billing months do not. C-156 records cinema Avg. Rate as cost per screen (`c1e7d75c`). AV-F3 was not opened. The date parser now throws on a blank or invalid date and does not use today. AV-M10 and AV-X3 were finished later, so they are not open. AV-00 night 2 was a dirty tree, not a product defect. Migrations 0090, 0091, 0092, 0093, 0094 and 0095 are each marked authored, not applied, once.

- Files: docs/brain/INVARIANTS.md, docs/brain/KNOWN-ISSUES.md, docs/brain/MAP.md, docs/brain/DATA-MODEL.md, docs/brain/modules/media-plans.md, docs/brain/modules/finance-billing.md, docs/brain/modules/ava.md, docs/brain/modules/dashboards-charts-exports.md, docs/brain/modules/shared-core.md.
- Tests: lint 0 (same warning set). Docs only.
- Under 90%: the old "no other rounding helper" line was stronger than the code. `roundMoney4` and `roundDeliverables` still exist, and the migration script keeps half-even `toCents`. The workbook invariant used to say no other code calls `generateMediaPlan`. Tests do. C-155 and C-156 are recorded as decided and fixed, not left open, because the code and the AV-D9 line already say so. Which commit removed the nine `computeLoadedDeliverables` copies was not re-found. The design-system shadow line in INVARIANTS and the UI-7 to UI-12 hunks in KNOWN-ISSUES stayed unstaged.
- Morning smoke: None.

## AV-Z DONE this commit

The Night 2 morning summary is at the top of this file. This commit is that summary. The hash is the commit itself. Nothing was pushed. Design-system files, `package.json`, and the discovery files stayed unstaged.

- Files: docs/superpowers/overnight-av-fixes/RUNLOG.md.
- Tests: typecheck 0, lint 0 (same warning set), check:client-server-only 0, test:all exit 1 (123/124). New failure: test:mba-live-dates, on HEAD. Fixed on HEAD: test:finance-sections. Fixed only in the dirty tree: test:campaign-dashboard-range, test:social-delivery. build exit 0.
- Under 90%: the two colour suites pass against uncommitted design-system files, so a clean HEAD is not claimed to pass them. `0090` and `0091` are marked authored, not applied, and were not in tonight's prompt list, so they are not listed as Night 2 migrations. The shared STOP rule treats a new suite failure as a park. This prompt's job is to record that failure and commit the log, so the failure is listed and the product was not changed.
- Morning smoke: the consolidated list at the top. Do not send email. Do not run a cron until 0093 or 0095 is applied and the matching flag is exactly true.

## AV-H1 DONE 6d8aa9cc

A new master whose MBA number is already taken returns 409 `MBA_NUMBER_TAKEN` with `nextMbaNumber` from `allocateNextMbaNumber` and writes nothing. The create page sets that number on the form and in context, toasts that the old number was used, and retries the save once. A second collision uses the existing save-error modal. An existing master save does not reallocate.

- Files: lib/data/classifySaveUniqueViolation.ts, lib/data/__tests__/classifySaveUniqueViolation.test.ts, lib/mediaplan/mbaNumberTaken.ts, lib/mediaplan/__tests__/postgresSavePayload.integration.test.ts, app/api/mediaplans/route.ts, lib/api.ts, app/mediaplans/create/page.tsx, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md.
- Tests: typecheck 0, lint 0 (same warning set, none in these files), test:postgres-save-mode pass (253 pass, 20 skip, 0 fail), test:plan-drafts pass (68).
- Under 90%: the unique insert the prompt attributed to `savePlan` is `POST /api/mediaplans`. `savePlan` always has a master id. The 9 Oct message is the pre-check string, so both the pre-check and the `mba_number` unique violation return the same 409. `savePlan` and `POST /api/plans/save` are unchanged.
- Morning smoke: Open create in two tabs for the same client. Save tab A, then tab B. B saves as the next number and says so.

## AV-H2 DONE 9dd32d8a

Case (a). The live-dates assertions were stale. Create did not lose the plan version on the PDF a planner actually downloads.

`planVersionForDocs` is gone from both pages. AV-X3e (`c93d74d9`) deleted the client upload that used to call `generateMbaPdfBlob({ planVersion: planVersionForDocs })` after the postgres return. That was the only call the two failing tests matched.

The published MBA is the stored file. `regeneratePlanVersionDocuments` renders `renderPlanVersionDocuments` with the saved row's `versionNumber` and does not pass `liveCampaignDates`. `buildMbaFromPersisted` then prints `media_plan_version` from that number and campaign dates from `version.campaignStartDate` / `campaignEndDate` unless a live overlay is sent. Create and edit zips fetch that file with `downloadStoredPlanFile({ versionId, kind })` and `fetchStored("mba_pdf")`. The version id is the save response (`zipCtx.versionId` on create, `args.versionId` on edit). Neither zip calls `generateMbaPdfBlob`.

The draft MBA is the form. Create's visible button is `onDraftMba` → `handleDraftMba` → `buildCreateDraftDocumentsBody("mba_pdf")`. That body sets `versionNumber` from `fv.mp_plannumber` and `campaignStartDate` / `campaignEndDate` from the form. `renderDraftDocuments` puts those on the PDF through `buildMbaDataFromFinancials`. Create's source still has no `liveCampaignDates` string. `isPublished` is hardcoded false and `isCreate` hides the published group, so `handleGenerateMBA`'s no-argument `generateMbaPdfBlob()` is not the button. Edit Generate still posts live dates: `handleGenerateMBA` calls `generateMbaPdfBlob({ liveScope: true })`, and that helper posts `liveCampaignDates` only when the form dates differ from the loaded row.

- Files: lib/docs/__tests__/liveCampaignDates.test.ts.
- Tests: typecheck 0, lint 0 (same warning set), test:mba-live-dates 21 pass, test:mba-header-date 13 pass, test:plan-drafts pass (59 + 12 + 68, 6 skipped), test:postgres-save-mode 253 pass, 20 skip.
- Under 90%: none on the path choice. The no-argument create `generateMbaPdfBlob()` would post `fv.mp_plannumber` and persisted dates if the published button were shown. It is not shown.
- Morning smoke: Create a plan and generate the MBA. The version and campaign dates on the PDF match the form. Not exercised in the browser. This change does not alter the PDF path, and creating a plan would write.

## AV-H3 DONE 6ab57a96

0090, 0091 and 0092 are applied. Supabase migration history was checked 9 Oct 2026. 0092 was applied 8 Oct by Claude. 0093, 0094 and 0095 stay authored, not applied.

KNOWN-ISSUES has no row for these six migrations. The status lived in DATA-MODEL, and the same unapplied claim for 0091 was in INVARIANTS and BLAST-RADIUS. `db/README.md` still said AUTHOR ONLY and "apply before" for 0090 and 0091.

- Files: docs/brain/DATA-MODEL.md, docs/brain/INVARIANTS.md, docs/brain/BLAST-RADIUS.md, db/README.md.
- Tests: docs only.
- Under 90%: none.
- Morning smoke: none.

# AV smoke fix pack (10 Oct 2026)

Date: 2026-10-10. Started 13:20 Australia/Sydney (+11:00).
Branch: localhost.
HEAD: b8b9ac42d08fd3f79dfab87040a9931ae57eb1eb
Node: v24.14.1

Tracked tree was clean. Untracked discovery files only. Gate passed. Baseline follows. Fix nothing.

## AV-S0 DONE (no commit)

Pre-flight only. No product files changed. Nothing fixed.

- `npm run typecheck` PASS, exit 0, about 21s.
- `npm run lint` PASS, exit 0, about 47s. 38 warnings. The set is react-hooks/exhaustive-deps, unused eslint-disable directives, and the AppSidebar `<img>` warning. `next lint` also prints the Next.js 16 deprecation notice.
- `npm run check:client-server-only` PASS, exit 0. 482 use-client seeds, 158 server-only modules, 1095 reachable, 4 webpackIgnore allowlist edges.
- `npm run check:money-inline` PASS, exit 0. 115 files, 250 hits.
- `npm run test:all` PASS, exit 0, about 559s. 124/124 suites.

```
suite                                 result  exit  ms
test:billing-line-id-match            PASS       0      2237
test:client-server-only               PASS       0      1505
test:brand                            PASS       0       872
test:status                           PASS       0       731
test:media-families                   PASS       0       806
test:charts-registry                  PASS       0      2699
test:format-money                     PASS       0      1327
test:planned-to-date                  PASS       0      2792
test:client-dashboard-range           PASS       0      4079
test:campaign-read                    PASS       0      4618
test:ava-skills                       PASS       0     17786
test:campaign-dashboard-range         PASS       0      6040
test:delivery-ui                      PASS       0      2759
test:search-delivery-tiles            PASS       0      1075
test:social-delivery                  PASS       0      2291
test:programmatic-delivery            PASS       0      1514
test:solver                           PASS       0       831
test:utm                              PASS       0       739
test:weekly-gantt                     PASS       0      3303
test:week-starts-on                   PASS       0      2176
test:expert-mappings                  PASS       0      1881
test:expert-goldens                   PASS       0      2104
test:expert-paste                     PASS       0      1796
test:expert-grid-selection            PASS       0      3721
test:spreadsheet                      PASS       0       699
test:finance-forecast                 PASS       0      2407
test:retained-commission              PASS       0       733
test:deliverable-budget               PASS       0       819
test:editor-line-inputs               PASS       0      3023
test:finance-filters                  PASS       0       920
test:finance-derive                   PASS       0      5171
test:billing-divergence               PASS       0      2219
test:billing-seed-fees                PASS       0      1904
test:billing-fee-drift                PASS       0      3556
test:kpi-resolve                      PASS       0       810
test:kpi-percent-units                PASS       0      1024
test:kpi-writes                       PASS       0      1608
test:money                            PASS       0      3876
test:money-golden                     PASS       0      3915
test:monthly-plan-calendar            PASS       0      1043
test:kpi-review                       PASS       0      2564
test:kpi-backfill                     PASS       0       849
test:pacing-maths                     PASS       0       897
test:pacing-portfolio                 PASS       0      5364
test:pacing-channel                   PASS       0      3965
test:pacing-detail                    PASS       0      4214
test:pacing-scenario                  PASS       0      3564
test:pacing-relabel                   PASS       0      7678
test:pacing-plan-lines                PASS       0       912
test:unmapped-placements              PASS       0       831
test:partner-ingest                   PASS       0      2677
test:ava-tools                        PASS       0      8297
test:ava-chat-ui                      PASS       0      6072
test:ava-autopopulate                 PASS       0      2182
test:ava-detect-goldens               PASS       0      2379
test:db-drift                         PASS       0       835
test:forecast-targets                 PASS       0      3574
test:write-kpi                        PASS       0      1507
test:line-item-snapshot-parity        PASS       0      1668
test:xero                             PASS       0      6502
test:finance-periods-flag             PASS       0       829
test:inline-schedule-amount           PASS       0      2918
test:line-item-attrs                  PASS       0      1610
test:shadow-diff                      PASS       0       842
test:mba-plan-detail                  PASS       0      2312
test:mba-number-alloc                 PASS       0      2182
test:channel-line-item-routes         PASS       0      1080
test:tenant-isolation                 PASS       0      4441
test:match-text                       PASS       0      1012
test:approvals                        PASS       0      4941
test:write-clients                    PASS       0      1620
test:write-reference                  PASS       0      1659
test:mba-header-date                  PASS       0      5885
test:mba-scope                        PASS       0      3747
test:mba-media-breakdown              PASS       0      3147
test:derive-approved-slice            PASS       0      2782
test:live-mba-scope                   PASS       0       828
test:mba-live-dates                   PASS       0      3903
test:finance-schedule                 PASS       0      2887
test:finance-sections                 PASS       0     14229
test:approved-slice                   PASS       0      2258
test:c1-fullscope-drift               PASS       0     23494
test:save-plan                        PASS       0     67834
test:write-billing-overrides          PASS       0     12390
test:write-finance                    PASS       0     12198
test:mb13-fee-override-publish        PASS       0     10082
test:mb15c-published-immutable        PASS       0     15042
test:vc2a-published-immutable         PASS       0     10331
test:vc2b-working-draft               PASS       0     19028
test:dirty-controller                 PASS       0      2320
test:write-media-plan-masters         PASS       0      6106
test:xano-mirror                      PASS       0      1007
test:campaign-documents               PASS       0      9282
test:media-plan-excel                 PASS       0      3220
test:campaign-row-actions             PASS       0      2951
test:postgres-save-mode               PASS       0      4793
test:session-expiry                   PASS       0      4044
test:plan-drafts                      PASS       0      5979
test:codex-flag-auth                  PASS       0      3097
test:codex-stage0-guarantees          PASS       0     10521
test:codex-stage1-detail              PASS       0     13000
test:codex-task-detail-ui             PASS       0      2066
test:codex-stage1-scope               PASS       0     11645
test:codex-stage1-templates           PASS       0     12250
test:codex-auth0-roster               PASS       0       902
test:dashboard-vc15-tip               PASS       0      1011
test:clients-fail-soft                PASS       0       760
test:m365-site-url                    PASS       0       725
test:m365-graph                       PASS       0       749
test:m365-reconciliation              PASS       0       749
test:myhours                          PASS       0      1295
test:fireflies                        PASS       0      4421
test:performance-report-insights      PASS       0      1758
test:insights-library                 PASS       0      2449
test:empty-channel-defaults           PASS       0       773
test:line-item-panels                 PASS       0       982
test:line-item-panel-flights          PASS       0      1838
test:publisher-profiles               PASS       0      2175
test:ingest-propose                   PASS       0      2815
test:ingest-review                    PASS       0     22615
test:ingest-eval                      PASS       0      3989
test:ooh-expert-gate                  PASS       0       784
test:ooh-standard-bench               PASS       0      1905
test:specs                            PASS       0      2808
```

Morning smoke: this baseline is 124/124 on HEAD `b8b9ac42`. A later suite failure is new against this run.

## This pack, in order

AV-S0, AV-S1, AV-S2, AV-S3, AV-S4, AV-S5, AV-S6, AV-S7, AV-S8, AV-S9, AV-S10, AV-S11, AV-S12, AV-S13, AV-S14, AV-S15, AV-S16, AV-S17, AV-S18, AV-SZ.

## AV-S1 DONE 6da479b7

Draft documents accept a client address whose fields are null. The Create page stores those fields as empty strings, the same way Edit does. The MBA PDF prints only the non-empty address parts. Postcode `0` is not printed. A lone `NSW` with no street, suburb, or postcode is the add-client default and is not printed. A full address is still the street line, then `suburb, state postcode`.

The route test's latin1 scan for the draft stamp fails on the previous `generateMBA` as well. Custom fonts are not WinAnsi (`pdfText.ts`). That assertion now uses `pdfText`, and it still requires `DRAFT - NOT FOR CLIENT`.

- Files: lib/docs/draftDocumentsBody.ts, lib/docs/mbaClientAddress.ts, lib/docs/__tests__/mbaClientAddress.test.ts, lib/generateMBA.ts, app/mediaplans/create/page.tsx, app/api/mediaplans/draft-documents/__tests__/draft-documents.route.test.ts, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/brain/modules/dashboards-charts-exports.md, docs/brain/BLAST-RADIUS.md.
- Tests: typecheck 0, lint 0 (same warning set), check:money-inline pass (115 files, 250 hits), draft-documents route + render + address formatter 12 pass, test:media-plan-excel 17 pass, test:mba-header-date 13 pass, test:mba-scope 8 pass, test:mba-live-dates 21 pass. No `__tests__` file names `buildMbaDataFromFinancials`.
- Under 90%: `NSW` is treated as the default state only when it is the only remaining part. A stored NSW with a street, suburb, or real postcode still prints. A client whose only real address is the state NSW would print nothing.
- Morning smoke: Create a campaign for Krusty Krab. Download draft MBA and Download draft Media Plan. Both download. The MBA has no `, NSW 0` line.

## AV-S2 DONE 431483b0

Edit bar map, dirty published tip. Each desktop button calls its own prop. The bar test passes: clicking Published Media Plan (v1) calls `onDownloadMediaPlan` and does not call `onDraftMediaPlan`.

| Button | Edit handler |
|---|---|
| Draft MBA | `onDraftMba` → `handleDraftMba` → `postDraftDocuments` `mba_pdf` |
| Draft Media Plan | `onDraftMediaPlan` → `handleDraftMediaPlan` → `postDraftDocuments` `media_plan` |
| Draft Media Plan (AA) | `onDraftAa` → `handleDraftAa` → `postDraftDocuments` `aa_media_plan` |
| Published MBA (vN) | `onPublishMba` → `handleGenerateMBA` → `POST /api/mba/generate` with `liveScope: true` |
| Published Media Plan (vN) | `onDownloadMediaPlan` → `handleDownloadMediaPlan()` |
| Published Media Plan (AA) (vN) | `onDownloadAa` → `handleDownloadAdvertisingAssociatesMediaPlan` |

The bug was inside `handleDownloadMediaPlan`, not the button. While the form was dirty it called `handleDraftMediaPlan`, which posts the live form and stamps DRAFT. It now calls `downloadStoredPlanFile({ versionId: publishedVersionId, kind: "media_plan" })` whenever the plan is published. Unpublished still falls through to the draft handler. A 422 `NotApprovedError` still falls through to the draft handler. Draft handlers are unchanged.

- Files: app/mediaplans/mba/[mba_number]/edit/page.tsx, components/mediaplans/__tests__/PlanWizardBottomBar.test.tsx, lib/mediaplan/__tests__/planWizardSaveBar.test.ts, docs/brain/modules/media-plans.md.
- Tests: typecheck 0, lint 0 (same warning set), PlanWizardBottomBar 7 pass, planWizardSaveBar 35 pass, test:media-plan-excel 17 pass, test:plan-drafts pass (59 + 12 + 69, 6 skipped).
- Under 90%: Create's `handleDownloadMediaPlan` still serves the draft when the form is dirty. Edit Published MBA (vN) still posts `/api/mba/generate` with live scope. Edit Published Media Plan (AA) still serves the draft when dirty.
- Morning smoke: Open krusty002 in Edit and change a budget without saving. Click Published Media Plan (v2). The file has no DRAFT stamp and matches v2.

## AV-S3 DONE (no commit)

Discovery only. Findings in `docs/superpowers/overnight-av-fixes/discovery/AV-S3-create-server-draft.md`. No product code.

Create Save draft stays disabled because `plan_working_drafts.master_id` is required and unique with `user_id`. The browser store is IndexedDB `av-plan-drafts`, keyed `mba:{PREVIEW MBA}::{userId}` while there is no master. Two tabs for one client share that key because `GET /api/mediaplans/mbanumber` does not reserve the number. Autosave is about 3 seconds and last write wins, which is the stale restore. A server draft without an MBA reservation needs a new table (option A). Option B must insert master and version in one transaction; `POST /api/mediaplans` alone is the penfold024 writer. Option C stops the two-tab clash and does not put the plan on the server.

- Checks: none. Docs only.
- Morning smoke: do not implement until Luke picks A, B, or C. Do not insert a `media_plan_masters` row without a version.

## AV-S4 DONE e4cf6c20

Workbook Service Fee and Ad Serving months were a raw media-share ratio, so krusty002 showed 1333.332857 and 26.666657. They now go through `allocateLineAcrossMonths`: each month except the last is `toCents` half-up, and the last month is the residue so the months sum to the line. Cell values are cents / 100. The Total row month is the cent sum of media, production, fee and ad serving.

krusty002 v1: fee 3000 over 18666.66 / 23333.34 is 1333.33 / 1666.67; ad serving 60 is 26.67 / 33.33; month totals are 20026.66 / 25033.34.

- Files: lib/docs/allocateLineAcrossMonths.ts, lib/docs/__tests__/allocateLineAcrossMonths.test.ts, lib/generateMediaPlan.ts, package.json, docs/brain/INVARIANTS.md, docs/brain/BLAST-RADIUS.md, docs/brain/modules/dashboards-charts-exports.md.
- Tests: typecheck 0, lint 0 (same warning set), test:money 90 pass (1 todo), test:money-golden 55 pass (1 todo), test:media-plan-excel 19 pass, check:money-inline ok (115 files, 250 hits).
- Morning smoke: Download krusty002's media plan. Fee by month shows 2 decimals, and the month totals equal the MBA billing schedule.

## AV-S5 DONE 99ba01e4

Published media plans now include the Campaign KPIs sheet. `renderPlanVersionDocuments` loads rows through `publishedKpiSheetRows` (persisted lines plus campaign, client and publisher KPI rates) and passes them into `buildMediaPlanWorkbook`. An empty resolve still leaves a one-sheet workbook. AA still skips the KPI sheet.

KPI Grand Total leaves Deliverables blank. Spend, Est. Clicks, Est. Views and Est. Reach still total. Channel subtotals still sum deliverables. Column B is the publisher display name when `publisherid` matches; otherwise the raw value stays. Campaign Status is sentence case. Plan Version is a number. Each sheet is landscape, fit to 1 page wide. The Media Plan repeats rows 1:8. Campaign KPIs repeats row 1.

Download names come from `planDocumentFileName`. Published: `<Client> - <Campaign> - Media Plan - v<N>.xlsx` and `... - MBA - v<N>.pdf`. Draft: `DRAFT - <Client> - <Campaign> - Media Plan - not for client.xlsx` and the MBA twin. AA uses `Media Plan (AA)` so it does not collide with the standard plan. A partial MBA adds ` partial` before `.pdf`. Windows-illegal characters are stripped. Stored blob names such as `Glendale_MediaPlan_v6.xlsx` are unchanged.

- Files: lib/docs/planDocumentFileName.ts, lib/docs/publishedKpiSheetRows.ts, lib/docs/mediaPlanWorkbook.ts, lib/docs/mbaScope.ts, lib/docs/renderDraftDocuments.ts, lib/docs/renderPlanVersionDocuments.ts, lib/generateMediaPlan.ts, app/mediaplans/create/page.tsx, app/mediaplans/mba/[mba_number]/edit/page.tsx, package.json, the matching tests, docs/brain/INVARIANTS.md, docs/brain/BLAST-RADIUS.md, docs/brain/modules/dashboards-charts-exports.md.
- Tests: typecheck 0, lint 0 (same warning set), test:media-plan-excel 22 pass, test:expert-goldens 9 pass, test:plan-drafts pass (59 + 12 + 69, 6 skipped).
- Morning smoke: Download krusty002's published and draft media plans. Both have 2 sheets. The names follow the new pattern. Print preview fits one page wide.

## AV-S6 DONE 55cf1a9f

`loadLastPulledAt` still reads only manual `pull-xero` rows. `loadLastNightlySyncAt` reads the latest `xero_sync_log.run_finished_at` where `stage = 'invoices'`, `status = 'success'`, and `sqlCronWatermarkLogWhere` excludes manual pulls. The draft-match payload returns both. In Xero shows `Xero synced <d MMM, h:mm am> · Last manual pull <d MMM, h:mm am | none>` in Melbourne time. A missing nightly sync reads `never`.

- Files: lib/finance/sections/draftMatchQuery.ts, lib/finance/sections/draftMatch.ts, lib/finance/sections/__tests__/draftMatchHonesty.test.ts, components/finance/sections/inXero/InXeroPageClient.tsx, docs/brain/modules/finance-billing.md.
- Tests: typecheck 0, lint 0 (same warning set), draftMatch + draftMatchHonesty 18 pass, check:client-server-only OK.
- Morning smoke: /finance/in-xero shows today's invoices sync time (00:15 UTC is 10:15 am Melbourne). A manual pull, if none, reads `none`.

## AV-S7 DONE (no commit)

Discovery only. Findings in `docs/superpowers/overnight-av-fixes/discovery/AV-S7-investment-fee.md`. No product code.

Investment `fee_cents` is `SUM(schedule_months.amount_cents)` where `component = 'fee'` on the published version. It is not a publisher column. Broadcast / Nine $126,371.00 / $0.00 is three radio plans: hartm015 and glenda008 have no Jul–Oct fee in the billing schedule either; CHALLEN005's $2,750.64 sits on a YouTube line, not on Nine. PGAAUS015 July matches To bill: media $3,439.00 and fee $859.75 on `PGAAUS015SM3` (Social / Meta). The caption's "Other" is the fee because the fee line has no media type. Social / Meta in the same window is $57,262.80 fee, so fee is not $0 on every row.

A separate drop: 28 version-months have a blob `feeTotal` ($27,619.57) and no schedule fee row, because `explodeScheduleToMonthRows` writes `__service__fees` only when the month has no line items. Smallest fix is that condition. The fee then stays on the existing campaign-totals row. Do not allocate it onto publishers. Published versions need a re-explode before the page changes.

- Checks: none. Docs only. Read-only SQL against published `schedule_months` and `legacy_schedules`.
- Morning smoke: on the Investment cut, Social / Meta should show a fee; Broadcast / Nine stays $0 until a later fix. Do not expect Nine to gain a fee from the explode condition alone.

## AV-S8 DONE (no commit)

Discovery only. Findings in `docs/superpowers/overnight-av-fixes/discovery/AV-S8-pacing-scope.md`. No product code.

Spend delivered % is spend / expected-to-date. The adjacent dollars are spend of `mp_campaignbudget` (`campaign_budget_cents / 100`). A channel % is spend / (campaign expected × channel budget / contributing budgets). Ad-serving rows are forced to $0 / $0 and use delivered units against time. Thresholds are 90 and 110. `no_adserving`, `client_pays_for_media`, bonus, and package inclusions are not filtered out of budget or expected. `fixed_cost_media` is deferred onto `FIXED_COST_REPORTED_DAILY_FACT`. ATL with no composer row stays inside the card budget and the expected and adds no spend.

Worked from `pacing_portfolio_snapshots`: buxton004 $25,000 of $122,185, channel 21.96% (card rounds to 22%) against expected $113,840.63; Home $147,777.62 is the current `campaign_budget_cents`. PENFOLD015 $36,405 of $418,878 is 10.13% → 10%; Channel Factory $36,405 / $40,000 is 27.82% → 28%; time 90% is the 10 Oct day count (80/89), on a partial snapshot that stored spend 0. golf025 $0 / $0 at 8% and 41% is the 10 Oct ad-serving rows. $36,887 / 51% and BICAU002's 93% are not in the snapshot table. BICAU002's Direct · Digital Video row on 7 Oct is $18,240 / $18,240 at 118% → 119%. KNOWN-ISSUES B-1 is the fixed build failure, not this pacing choice.

- Checks: none. Docs only. Read-only SQL against `pacing_portfolio_snapshots`, `media_plan_masters`, `media_plan_versions`, `line_items`.
- Morning smoke: do not treat the 10 Oct snapshot as the screen. It is a 16-campaign partial with spend 0. The last full snapshot is 7 Oct (33 / 21 / 3 / 30). A portfolio rebuild is what would show whether $36,887 and 93% were live that morning.

## AV-S9 DONE (no commit)

Discovery only. Findings in `docs/superpowers/overnight-av-fixes/discovery/AV-S9-expected-to-date.md`. No product code.

BICAU002 has three expected figures because they are three calculations. Review & Report is live line media $102,402.10 × 71/86 = $84,541 (94.5% of $79,884). Pacing and AVA are the delivery-schedule media proration through 10 Oct = $85,729.39 (93.2% of $79,884.21). The campaign read's $60,051 is draft id 7 from 18 Sep, which matches all-in (media + fee + ad serving) through 18 Sep ($60,050.63). The live dashboard strip already uses the pacing resolver and is not that draft.

"Timed out" is failed rows id 1 and id 2 from 17 Sep. `error_message` is the 10-minute stale flip. Their beats are still the placeholder. The list returns that failed row next to the newer draft, so the banner stays. Nothing retries. Regenerate is the only way to start again.

The shared helper already exists: `resolveCampaignExpectedSpendToDate`, with `basis: "media"` and `monthlyOpts.asOfISO`. The report does not call it. AVA passes the as-of into the day count only.

- Checks: none. Docs only. Read-only SQL against `media_plan_versions.legacy_schedules`, `line_items`, and `campaign_reads`.
- Morning smoke: BICAU002's read will still say 18 Sep and Timed out until someone regenerates. Do not expect the deck's $84,541 and the pacing card's $85,729.39 to match until the report uses the monthly resolver.

## AV-S10 DONE

Commit `08574c1f` `fix(reports): deck share wording, no empty previous period, honest rate metrics`.

A channel share now reads "<Channel> was <N>% of campaign spend." Campaign to date, and a custom range that starts on or before the flight, has no previous window, so the deck drops the Previous series, column and sentence. Planned impressions, clicks and views come from the line deliverable (buy type, or the burst calculated value), prorated when the window is shorter than the flight, and show "No plan" only when the plan has none. CPM, CPC, CTR and CPV use spend only from lines that report that delivery. The key-metrics footnote is "Rates exclude $X of spend with no reported impressions or clicks." and appears only when X is above zero. A KPI whose target is 0 or empty is hidden. "No delivery feed" is "No data yet". Deck dates are "10 Oct 2026". The download name is `{client}-{campaign}-report-{period}.pptx`: `campaign-to-date-{yyyy-mm-dd}`, `{yyyy-mm}` for a calendar month, `{start}-to-{end}` for a custom range. The period dialog was left for AV-S12. The report's expected-to-date formula is unchanged.

- Checks: typecheck 0. lint 0 (existing warnings only). campaignReport tests 37 pass. test:money 90 pass, 1 todo. check:money-inline ok (115 files, 250 hits).
- Morning smoke: Run Review & Report on BICAU002 for campaign to date. There should be no Previous. CPM should exclude Digital Video, with a footnote for that spend. The cover date should be 10 Oct 2026. The file name should end in `campaign-to-date-2026-10-10.pptx`. The deck's expected figure is still the flat flight share, not the pacing card's monthly figure.

## AV-S11 DONE 427e16a9

Commit `427e16a9` `fix(dashboard): client header and tile share one expected value`.

The header and the expected-media tile already took `plannedToDate` from one `computePlannedSpendTotals` call. The tile did not show that number. `useCountUp` starts at 0 when reduced motion is off, and at the target when it is on. `useReducedMotion()` is null on the server, so the first paint of the tile was $0 while the header printed the real figure. A reduced-motion client initialises to the full target, then the animation writes `target * eased` and the first frames read as $0. There is no second expected-media fetch. The Delivered fetch does not feed this tile. Both surfaces now share one skeleton until that same `plannedToDate` is committed, then both print it. The expected-media tile no longer counts up.

Spending insights exclude campaign status Planned on purpose. `isBookedApprovedCompleted` is booked, approved, or completed, and `plannedSpendConsistency` uses the same set. krusty002 and krusty003 stay out, so a Planned-only client can total $0. The caption now says "booked and live campaigns". Completed campaigns are still in the set. "Live" in the caption is that commercial set, not the Live pill.

"Welcome back, {client}." is the title only when `viewerIsClient` is set. `/client/[slug]` passes false. `/dashboard/[slug]` passes true only for role `client`. Admin and staff see the client name, without a full stop.

- Checks: typecheck 0. lint 0 (existing warnings only). test:campaign-dashboard-range pass (72 + 31 + 5). test:client-dashboard-range pass (25 + 3 + 22). clientHeroExpected 3 pass. spendInsightsCaptions 3 pass.
- Morning smoke: /client/krusty-krab header and tile show the same expected figure, with a skeleton first and no $500.0K then $0. No "Welcome back" for an admin. Spending insights can still total $0 while only Planned campaigns are published.

## AV-S12 DONE 2c54da83

Commit `2c54da83` `chore: remove debug logs, fix Network typo and report dialog copy`.

There was no shared logger. Job-result `console.log` calls now go through `logJob` in `lib/log.ts`, which still writes `console.log` so Vercel stdout is unchanged. `eslint.config.mjs` sets `no-console` to error for `app/**` and `components/**`, allowing `warn` and `error` only. Tests are ignored. `console.error` and `console.warn` are unchanged. Pacing `DEBUG` flags that still gate a warning or a response field were left in place. Flags that only gated logs were removed (`DEBUG_SPEND` on expected-spend-to-date, and the four dashboard campaign-page flags).

Radio and Integration already-processed hydration now returns before the work, instead of an empty then-branch. Skip behaviour is the same.

`Netowrk` was only the Radio collapsed label. It now reads Network. No `Netwrok` hits.

The period dialog reads "Choose the reporting period for MBA {mba}. AVA writes the commentary. Admin only."

Removed `console.log` (101). The other 22 of the 123 were renamed to `logJob`, listed under kept.

- app/api/campaigns/export-report/route.ts: 2
- app/api/dashboard/[slug]/route.ts: 2
- app/api/mediaplans/mba/[mba_number]/expected-spend-to-date/route.ts: 6
- app/api/mediaplans/route.ts: 3
- app/api/media_plans/route.ts: 1
- app/api/pacing/bulk/route.ts: 2
- app/api/pacing/programmatic/display/route.ts: 3
- app/api/pacing/programmatic/video/route.ts: 3
- app/api/pacing/social/meta/route.ts: 3
- app/api/pacing/social/tiktok/route.ts: 3
- app/dashboard/page.tsx: 5
- app/dashboard/[slug]/page.tsx: 1
- app/dashboard/[slug]/[mba_number]/page.tsx: 5
- app/mediaplans/create/page.tsx: 4
- app/mediaplans/mba/[mba_number]/edit/page.tsx: 31 (includes the two logs inside the billing-append helpers). Also removed 17 `billingAppendDebug` / `billingFeeSeedDebug` call sites and those helpers, which only logged.
- app/mediaplans/page.tsx: 3
- app/tools/behavioural-planner/components/ResultsPanel.tsx: 3
- components/AddClientForm.tsx: 3
- components/media-containers/BVODContainer.tsx: 3
- components/media-containers/DigitalDisplayContainer.tsx: 3
- components/media-containers/IntegrationContainer.tsx: 1
- components/media-containers/RadioContainer.tsx: 4
- components/media-containers/SocialMediaContainer.tsx: 3
- components/media-containers/TelevisionContainer.tsx: 4

Removed `console.info` (15), because the new rule forbids it: pacing bulk 6, programmatic display 1, programmatic video 1, search 1, meta 1, tiktok 1, edit page 1, behavioural planner client 2, TvSceneMockup 1.

Removed `console.debug` (10): components/media-containers/ExpertGrid.tsx.

Kept as `logJob` (22): admin auth0-roster-sync 1, admin fireflies-sync 1, campaign-reads generate 2, cron auth0-roster-sync 1, codex-recurring 1, creative-upload-digest 1, fireflies-sync 1, myhours-sync 1, ops-health 1, pacing-digest 4, pacing-portfolio 2, partner-ingest 1, relabel-drift 1, snapshot-checksum 1, xano-line-item-sync 3.

- Checks: typecheck 0. lint 0 (existing warnings only). test:all 124/124 suites passed.
- Morning smoke: Open a plan in Edit with devtools open. There should be no `[RadioContainer]` logs.

## AV-S13 DONE f562b984

Commit `f562b984` `fix(ava): suggestion chips send their question`.

The three chips on `/dashboard/bic/BICAU002` are `STARTER_CHIPS.general` in `components/ChatWidget.tsx`. The click already called `sendMessage(chip)`, the same function as Send, and the chips already unmounted once `messages.length > 0`. They were rendered inside the conversation log (`role="log"`, `aria-live`, `overflow-y-auto`). The input and Send sit outside that scroller, and that is the path that reached `/api/chat-v2`. The chips now sit in a shrink-0 block above the log. `mousedown` stops propagation so the panel drag cannot take the gesture. `onClick` still calls `sendMessage` with the chip label. After that user message is appended, the chips unmount.

- Checks: typecheck 0. lint 0 (existing warnings only). test:ava-chat-ui 35 pass (4 files), including `ChatWidget.starterChips.test.tsx`: the pacing chip POSTs `/api/chat-v2` with that text as the user message, is not inside the log, and is gone afterwards. Send posts typed text on the same endpoint.
- Morning smoke: On `/dashboard/bic/BICAU002`, open Ask Ava and click a chip. Devtools should show `POST /api/chat-v2` and AVA should answer. The chips should disappear once that message is in the thread. Not exercised in the browser here.

## AV-S14 DONE 6f324669

Commit `6f324669` `fix(ui): current financial year by default and the finished-campaign boundary`.

Home and Campaigns default to `currentFy` (Melbourne civil date). On 10 Oct 2026 that is start year 2026, labelled FY27 (Jul 2026–Jun 2027). `?fy=` stays the July start year. An explicit `?fy=` or `all` is kept; saved views still store client pins, not the year. Chips are newest first: current, then the two prior years, then All (FY27, FY26, FY25, All). Invoiced vs expected uses the same Melbourne year, mapped onto its windows (`fy27` from 1 Jul 2026, `fy26` on 30 Jun 2026). Its chips are FY27, FY26, All since FY26. An explicit `fy` query on that API is kept.

A campaign is finished from the Melbourne day after its end date. An end date of today stays out of “Campaigns Finished in Past 40 Days” and stays in the live list.

`/finance/xero` already says “FY26 invoices resolved to a client”. `countFy26ArClientCoverage` counts `xero_ar_invoices` with `issue_date >= 2025-07-01` and no end date. That is the app’s FY26 cohort on purpose (same open start as import, PDFs, and the client invoice list). The label stays FY26. It is not the closed current year.

- Checks: typecheck 0. lint 0 (existing warnings only). `auFinancialYear` + `invoicedVsExpected` 13 pass, including 30 Jun / 1 Jul Melbourne and finished today vs yesterday.
- Morning smoke: Home and Campaigns open on FY27 (chips FY27, FY26, FY25, All). A campaign ending today shows as Live and is not in Finished. Invoiced vs expected opens on FY27. The Xero header still says FY26. Not exercised in the browser here.

## AV-S15 DONE e3169c2b

Commit `e3169c2b` `chore(ui): plain labels on finance, forecasting and admin pages`.

**Other → Fees: PARKED (this item only).** The To bill caption segment "Other" is every line whose `media_type` is blank (`buildMediaTypeRollups`). That bucket holds the Assembled Fee, Adserving, Production, a Monthly retainer, and any media line with a blank media type. Production and the retainer are not fees, so the label stays "Other".

Costs overview no longer prints "From costs/summary — not global-monthly-* dashboard endpoints". The coverage line is the live `bookedWithPublisherIdentityPct` plus "of booked spend is matched to a publisher. Unmatched lines are shown in the Orphans view." The Costs nav is Overview, Publisher invoices, Accruals, and Client-pays. There is no view named Orphans. The API `coverage.note` still mentions `orphanLineCents` and is no longer rendered on this page.

Xero exceptions now read "Billing rows waiting for a client or MBA, and Xero invoices we couldn't match." The matches line on the same paragraph no longer names `xero_invoice_matches`.

Forecasting scope label is `FY{year}` only. "Show debug details" is visible only when `useAuthContext().isAdmin`. The row sheet and the export filter row use that same label. The CLIENT column stays "Client": `resolveClientName` is `mp_client_name`, and uses `campaign_name` only when the client name is blank. The mono line under the name was `client_id` (a numeric id when the client matches, otherwise a lowercase `normalizeName` slug). That line is gone.

Schedule ingest fields are Plan ID, MBA number, and Version. Accept's error and the review hint use those words.

The client dashboard Delivered caption is "Platform delivery". Live campaigns read "Live · {n} planned".

Search and programmatic line summaries go through `formatBuyTypeForExport`, so `cpc` shows CPC. The other containers already mapped known buy types; an unlisted value now uses the same display label.

No snapshots changed.

- Checks: typecheck 0. lint 0 (existing warnings only). No snapshot updates.
- Morning smoke: `/finance/costs`, `/finance/xero`, `/finance/forecasting` and `/admin/schedule-ingest` should not show the engineering strings listed above. The To bill cards still say "Other" for the mixed fee/production/retainer bucket. Forecasting still has an admin-only snapshot alert that names `DATABASE_URL` when snapshot storage is missing. Not exercised in the browser here.

## AV-S16 DONE ceefe7e9

Commit `ceefe7e9` `fix(plans): line cards stay open, date order validation, Monday week start`.

Create feeds Radio and OOH published line items back as `initialLineItems`. A network or buy-type change republished that array, hydration ran `form.reset`, and `allCollapsedIndices` closed every card. `useStableHydration` now skips that own-publish reference. Ingest, draft restore, and an edit load still hydrate and start collapsed. Television and the other legacy containers collapse only when hydration runs. On create they do not echo the published array, so a select change does not close them. Expert apply and expert exit still collapse on purpose.

When the campaign end is before the start, End date shows "End date must be on or after the start date" and Publish is disabled on create and edit. The same message sits under a burst end date in the line card, the expert grid, and production. Stored dates are not rewritten. Edit Save draft stays the existing dirty-state control (that expression is pinned). While every save publishes, `handleSaveAll` still returns before writing if the dates are out of order.

`Calendar` sets `weekStartsOn={1}` after its props, so every date picker starts on Monday. The expert-grid week toggle stays a separate preference, default Sunday.

- Checks: typecheck 0. lint 0 (existing warnings only). test:plan-drafts pass (hydration skip included). test:dirty-controller pass after leaving the pinned Save draft expression unchanged. test:expert-goldens 9 pass. test:empty-channel-defaults 3 pass. `dateOrder.test.ts` 4 pass (15 Nov 2026 vs 31 Oct 2026, same day, missing date, Monday source pin).
- Morning smoke: Create a Radio line and pick a network and a buy type: the card stays open. Set a start date after the end date: the inline error shows and Publish is disabled. Calendars start on Monday. Not exercised in the browser here.

## AV-S17 DONE 6ded57fc

Commit `6ded57fc` `style(brand): one token set on the 05b hexes, tabular Jakarta for numbers`.

The five off-by-one colours were not hex literals. They were integer HSL channels in `app/globals.css` and `styles/chart-tokens.css` that `hsl()` rounds one step off the 05b hex. Each channel is now one decimal place, which rounds to the brand hex: ink `#0F1D13`, lime `#B5D337`, sand `#EFE9DF`, muted `#6B6A5E`, muted on black `#AEB9B0`. Existing hex tokens were already those values. Status colours (`#D4583C`, `#9E321C`, `#7A5200`) are unchanged. No new tokens.

Select-String of `app/**` and `components/**` found no `#101E14`, `#B4D336`, `#F0EAE0`, `#69685D`, or `#ADB8AF` literals, so no component file was rewritten for a raw hex.

Forecasting figures dropped Geist Mono and keep tabular numbers (Jakarta from the page font): `ForecastingPageClient.tsx`, `VarianceTargetVsActualView.tsx`, `TargetGrid.tsx`, `FinanceForecastVariancePageClient.tsx`. Code stays mono (`DATABASE_URL`, the migration name, error details, snapshot id, `<pre>`). MBA number labels dropped Geist Mono and use `tabular-nums`: create and edit MBA Number, `CampaignHeroBanner.tsx`, `CampaignPacingCard.tsx`, `CampaignPacingTable.tsx`, `CampaignDetailModal.tsx`, `OverviewClient.tsx`, `NewAdminUserForm.tsx`, and the MBA column in the ad-serving, search, social, and programmatic pacing tables.

Colour snapshot tests: none contained these hexes. None updated.

- Checks: typecheck 0. lint 0 (existing warnings only). test:brand 80 pass.
- Morning smoke: Forecasting numbers are Jakarta. Sidebar ink and lime buttons look unchanged to the eye. Not exercised in the browser here.

## AV-S18 DONE 65e3c3e7

Commit `65e3c3e7` `feat(insights): record action, owner and outcome with a client picker`.

0094 already has nullable `action`, `action_owner`, `outcome`, and `outcome_kind` (`achieved` or `expected`, or null). The record form now sends those optional fields. POST `/api/insights` validates them and `createCampaignInsight` stores them. A body-only supersede copies the existing action, owner, and outcome onto the replacement so an edit does not clear them.

`/insights` filter and the record form pick a client from `/api/clients` and an optional MBA for that client from `/api/mediaplans`. The free-text Client ID is gone. A campaign page that already has an MBA still records against that MBA. Insight cards already show Action, Owner, and Outcome through `InsightFinding` (sky Insight, forest Action, lime Outcome) when the row has them.

- Checks: typecheck 0. lint 0 (existing warnings only). test:insights-library 37 pass, 1 skipped (live EXPLAIN, DB unreachable). check:client-server-only OK.
- Morning smoke: `/insights` — record an insight for Krusty Krab with an action and an outcome. The card shows the I/A/O tags. Not exercised in the browser here (admin session).

## AV-S19 DONE 4bb467af

Commit `4bb467af` `fix(finance): header-only fee months reach schedule_months and Investment`.

`explodeScheduleToMonthRows` is on the live save path, not only the migration. Callers:

- `lib/data/savePlan.ts` (`savePlanVersion`, including publish) writes billing and delivery `schedule_months`.
- `lib/data/writeBillingSchedule.ts` (`patchBillingScheduleOnPostgres`) writes the billing explode, and delivery when a delivery schedule is sent.
- Migration and verify only: `scripts/migration/etl-xano-to-supabase.ts`, `scripts/migration/recon.ts`, `scripts/verify/byte-diff-schedules.ts`.

A month that already produced a per-line fee row still writes no `__service__fees`. A month with lines, no per-line fee, and a header `feeTotal` greater than zero now writes one `__service__fees` row. Cents for that new row go through `lib/money` `toCents` (half-up). The fee stays on `__service__fees` (campaign totals). `__service__media_total` is still only when the month has no line items. A month with no line items is unchanged.

Dry-run of `scripts/backfill/rebuild-service-fee-months.ts` (no writes). Published tips only (`published_version_id` with `published_at` set). 200 tips scanned, 0 explode failures.

The AV-S7 window matches: billing basis, master status approved/booked/completed, months 2026-07 through 2026-10: **28 rows, 2,761,957 cents ($27,619.57)**.

The unrestricted set is larger, because the same gap exists outside that window and on the delivery basis: **568 rows, 95,277,322 cents ($952,773.22)**. Billing 280 rows / $484,359.50. Delivery 288 rows / $468,413.72. `--apply` inserts that full set, one transaction per version. It does not rewrite `approved_slice` or `snapshot_checksum`. Luke reviews before `--apply`.

First 10 rows of the full dry-run:

| mba | version | basis | month | cents |
| --- | --- | --- | --- | --- |
| 001001 | 7 / 618 | billing | 2026-04-01 | 105000 |
| 001001 | 7 / 618 | delivery | 2026-04-01 | 105000 |
| 001001 | 7 / 618 | billing | 2026-05-01 | 105000 |
| 001001 | 7 / 618 | delivery | 2026-05-01 | 105000 |
| 001001 | 7 / 618 | billing | 2026-06-01 | 105000 |
| 001001 | 7 / 618 | delivery | 2026-06-01 | 105000 |
| 001001 | 7 / 618 | billing | 2026-07-01 | 105000 |
| 001001 | 7 / 618 | delivery | 2026-07-01 | 105000 |
| 001001 | 7 / 618 | billing | 2026-08-01 | 105000 |
| 001001 | 7 / 618 | delivery | 2026-08-01 | 105000 |

candel001 v23 (807) billing Jul–Oct is 195000 cents ($1,950.00) each month. letsgo001 v3 (625) billing Jul–Oct is 142735, 163125, 163125, 163125 cents.

- Checks: typecheck 0. lint 0 (existing warnings only). test:money 90 pass, 1 todo. Schedule transform tests 12 pass (`scheduleTransform.serviceFees.test.ts` 3, `dispositionFixes.test.ts`, golden explode in `attachScheduleLineDetail.test.ts`). `approvedSlice.test.ts` 10 pass. check:money-inline ok (115 files, 250 hits).
- Morning smoke: After Luke runs `--apply`, `/finance/investment` shows fee on the Campaign totals rows for candel001 and letsgo001. Nine stays at $0.00 fee. `--apply` also inserts the months outside Jul–Oct and the delivery-basis rows listed above. Document footers still show the old `snapshot_checksum`. Not exercised in the browser here.

## AV-S20 DONE 44a91246

Commit `44a91246` `fix(reports): deck and AVA use the shared expected-to-date resolver`.

Review & Report expected media now comes from `resolveCampaignExpectedSpendToDate` (`basis: "media"`, `monthlyOpts.asOfISO` = the report period end). This month, last month, and custom ranges are that figure minus the resolver at the day before the period start (`toCents` / `fromCents`). Campaign to date is one call at the period end. The flat `expectedMediaToDate` helper is gone. Channel rows still use the flight elapsed share.

`get_delivery_snapshot` passes the snapshot as-of (Melbourne) into `monthlyOpts.asOfISO`. The pacing card and the portfolio assembler were not changed.

A BICAU002-shaped front-loaded schedule (Aug $27,749.73, Sep $46,864.52, Oct $27,787.85, flight 1 Aug–25 Oct) is $85,729.39 on 10 Oct, the same as the resolver, and more than a flat 71/86 of the media.

- Checks: typecheck 0. lint 0 (existing warnings only). Campaign report tests 39 pass. test:ava-tools 103 pass, 1 skipped (live golden, no AVA_DATABASE_URL), plus the as-of test 1 pass. test:money 90 pass, 1 todo. test:money-golden 55 pass, 1 todo. check:money-inline ok (115 files, 250 hits).
- Morning smoke: Review & Report on BICAU002, campaign to date. The deck expected to date and spend pace should match the pacing card for the same day ($85,729.39 and about 93.2% on 10 Oct, before dollar rounding on the deck). Not exercised in the browser here.

## AV-S21 DONE e78e5abb

Commit `e78e5abb` `fix(dashboard): campaign read hides superseded failures and shows its age`.

The campaign-read list now shows a failed row only when that failure is the newest row for the MBA and version. A Timed out row older than a later draft or published read stays in history and is not returned as `failed`, so the banner does not sit beside the newer read. Generation and stored beats are unchanged. Nothing auto-regenerates.

Beside "Read as at", a read whose as-at instant is more than 7 days old shows "Out of date. Regenerate for current figures." in muted text. The existing Regenerate button stays beside it.

- Checks: typecheck 0. lint 0 (existing warnings only). test:campaign-read 35 pass plus vitest 9 pass. test:campaign-dashboard-range 72 pass, vitest 32 pass, delivered-totals 5 pass.
- Morning smoke: `/dashboard/bic/BICAU002` should have no "Timed out" banner, and "Read as at 18 Sep 2026" should show the out-of-date cue. Not exercised in the browser here.

## AV-S22 DONE a92e1732

Commit `a92e1732` `fix(plans): published AA media plan downloads the published version`.

Edit `handleDownloadAdvertisingAssociatesMediaPlan` now uses the same published-version gate as the media plan button. A published plan downloads the stored AA file for `publishedVersionId` even when the form is dirty. If that file was never saved, `POST /api/mediaplans/[id]/aa-workbook` builds the workbook from the published version (`renderPlanVersionDocuments`, draft false) and writes nothing. The live form is not used on that path. The draft AA button and the Create page are unchanged.

- Checks: typecheck 0. lint 0 (existing warnings only). PlanWizardBottomBar 8 pass. planWizardSaveBar 35 pass. AA workbook route 1 pass. test:media-plan-excel 22 pass. test:plan-drafts 59 pass, 6 skipped, plus route tests 12 pass, plus vitest 71 pass.
- Morning smoke: krusty002 Edit, with a budget change unsaved. "Published Media Plan (AA) (v2)" has no DRAFT stamp and matches v2. Not exercised in the browser here.

## AV-S23 DONE

Discovery only. No commit. Findings in `docs/superpowers/overnight-av-fixes/discovery/AV-S23-pacing-snapshot.md` (left untracked).

The 10 Oct `pacing_portfolio_snapshots` row is a complete upsert of a build that timed out search, social, and direct and kept going. Ad-serving returned 16 campaign rows and programmatic 55 line rows; `build_rows` stored 16. Spend is $0 because those three sources were replaced with `[]` and ad-serving never contributes spend. `Postgres.js : Unknown Message: 0` and `Unknown Message: 55` are on that same request (`2026-10-10T00:05:56Z`). The upsert still ran at ~90s (`2026-10-10T00:07:26Z`, 11:07am Melbourne).

A second `GET /api/pacing/portfolio` at `2026-10-10T00:06:27Z` finished in 6.6s with all five sources and upserted 33 campaigns. That is the page at 11:06am (33 live, 20 Behind, 6 On track, 27 needing attention). The slower build then replaced that key. The 10 Oct cron (`2026-10-09T21:00:21Z`) was a 504 at 300s and stored nothing. 8 and 9 Oct are absent from the retained logs; the cron has no date skip.

`fab33866` is the Snowflake `XANO_LINE_ITEMS_SNAPSHOT` merge, not this writer.

- Checks: none (discovery).
- Morning smoke: after a later fix, a second portfolio load must not replace a 33-campaign snapshot with a timed-out one, and a cron 504 must leave the previous good row in place. Not exercised here.

## AV-S24 DONE 9257e523

Commit `9257e523` `fix(plans): one browser draft per tab with a resume list and draft export/import`.

Create no longer keys IndexedDB on the shared preview MBA. Each tab gets `crypto.randomUUID()`, stored in `sessionStorage` (`av-create-draft-id`) and in `?draft=`. The record key is `draft:{draftId}::{userId}`, with client, campaign, preview MBA, line count and `updatedAt` beside the autosave payload. Opening `/mediaplans/create` with no valid `?draft` lists this user's drafts newest first (Resume, Start new, Delete via `AlertDialog`). It does not auto-restore by client. Legacy `mba:{MBA}::{userId}` rows for this user move to the new key on that landing load. Empty and ≥14-day create drafts are still dropped. Export draft (bottom bar) downloads `{ schemaVersion: 1, payload }` as `DRAFT - Client - Campaign - draft.json`. Import on the landing rejects any other schema version and loads a new id. Publish deletes that draft id. Edit stays on `m{masterId}::{userId}`. Create Save draft stays disabled.

The migration test logged `create-draft migration count: 2` (two `mba:` rows for this user moved; another user's `mba:` row and an edit `m283` row stayed).

- Checks: typecheck 0. lint 0 (existing warnings only). test:plan-drafts 63 pass, 6 skipped, route tests 12 pass, vitest 72 pass (includes the four create-browser-draft cases and the hook cases). test:dirty-controller 30 pass plus vitest 40 pass. check:client-server-only ok.
- Morning smoke: Open Create in two tabs for Krusty Krab, add different lines, and reload both. Each keeps its own lines. The landing list shows both drafts. Export one, delete it, import it, and it comes back. Not opened in the browser here (auth).

## AV-S25 DONE

Design only. No commit. No code change. Findings in `docs/superpowers/overnight-av-fixes/discovery/AV-S25-server-drafts-design.md` (left untracked).

Option A is a new `create_drafts` table, not a nullable `plan_working_drafts.master_id`. The AV-S24 `?draft=` uuid is the row id, so two tabs for one client stay two rows. `published_master_id` stays null until publish. RLS matches `0012` (enabled, no policies, no `ava_readonly` grant). The SQL is written in the discovery file as `db/migrations/0096_create_drafts.sql` and was not added under `db/migrations/`.

Publish becomes `publishCreatePlan`: one transaction inserts the master, runs the current `savePlanVersion` body, and sets `published_master_id`. A version-save throw rolls back, so no penfold024 master is left. `POST /api/mediaplans` is still the orphan writer if Create keeps calling it. Documents stay after commit.

Server save is the 3 second local autosave plus blur and leave. IndexedDB remains until the PUT returns 200; the pill stays "Saved on this device only" until then. An admin page lists another user's open drafts and exports JSON. It does not publish as that user.

- Checks: none (design).
- Morning smoke: none until a later prompt builds it. After that, a failed version save must leave no new master, and a second machine signed in as the same user must see the Create draft. Not exercised here.

## AV-S26 DONE

Design only. No commit. No code change. Findings in `docs/superpowers/overnight-av-fixes/discovery/AV-S26-flat-allocation-design.md` (left untracked).

`BACKLOG-av-2026-10.md` is not in the repo. `KNOWN-ISSUES.md` B-1 is the fixed Edge build failure, not this item. The Golf Australia request is golf025 (master 244, published version 17009). DS-4 is the unconfirmed note in `docs/superpowers/delivery-source-registry-backlog-2026-09-16.md`.

The nightly procedure only backfills `FIXED_COST_MEDIA = true` partner-file lines. The inner procedure drops every other id. golf025 radio, newspaper, and OOH are `fixed_cost_media` false, so they never get a row. `no_adserving` is not on the snapshot and is the wrong test on its own: golf025 DV360 has a map row, and digital video has CM360 impressions even with the flag on. Both procedures need a hand deploy. A null-id backfill is the wrong call.

On 10 Oct, AV-M5 media expected is $72,739.65. The only allocation is newspaper $12,823.06. Radio and OOH are November and December, so they add $0. Last full reported spend is the 7 Oct social figure $35,775.33 (the 10 Oct card spend of $0 is the partial snapshot). Gap before $36,964.32. Gap after $24,141.26 (66.8%, still Behind). Display and video stay $0 spend (ZERO-$).

Bonus and `package_inclusions` stay out. Client-pays is included via delivery media; golf025 has none. Spots, package, and insertions on this plan have burst dates and empty spots arrays. The card's expected is a month-window proration, not a burst-day split; the design recommends matching the month window so the allocation equals the media already inside expected.

- Checks: none (design). Postgres read of golf025 and the portfolio snapshots only. Temp query scripts were deleted.
- Morning smoke: after a later build and Luke's Snowsight backfill, golf025 Newspaper shows Booked spend (flat allocation) of about $12,823 to date and is not mixed into reported spend. Radio and OOH stay $0 until November. Digital Display and Digital Video stay impression rows with $0 spend. Not exercised here.

## AV-S27 DONE ac56dd15

Commit `ac56dd15` `fix(finance): To bill names fees, ad serving, production and retainer; Costs coverage copy`.

Caption rule (`toBillCaptionLabel`). A `line_type` "media" line keeps its `media_type`; a blank type is "Untyped media". The other parts match the lines `deriveReceivableRecords` and `deriveRetainerReceivables` already write: Retainer is `line_type` "retainer", item code "Retainer", or description "Monthly retainer". Ad serving is item code "T.Adserving" or description "Adserving and Tech Fees". Production is `line_type` "service" with item code or description "Production". Fees is `line_type` "fee", item code "Service" or "FEE", or description "Assembled Fee", "Service fee", or "Fee". Anything else with a media type uses that type. A line that matches none of these is "Other". Named parts follow the media types, in that order, and a rounded total of 0 is left out. The card total is the same cent rounding as before.

Costs coverage now ends at the percentage. Publisher invoices does not list unmatched schedule lines. It shows publisher × month rows (including "Unspecified" and the campaign-level bucket) and an "Unattributed bills" group for Xero AP bills that did not match a publisher. That is not a line list, so the sentence is not "Unmatched lines are listed under Publisher invoices."

- Checks: typecheck 0. lint 0 (existing warnings only). invoicingRowPresentation 10 pass, including PGAAUS015 July "Social Media $3,439.00 · Fees $859.75" and a production + retainer card. invoicingPlanRow 10 pass. check:money-inline ok (115 files, 250 hits). No Costs page test covers this sentence.
- Morning smoke: `/finance/invoicing` PGAAUS015 July reads "Social Media $3,439.00 · Fees $859.75". `/finance/costs` coverage line does not mention an Orphans view. Not exercised in the browser here.

## AV brand UI pack (05b)

Pre-flight date: 10 Oct 2026 (Australia/Sydney). Branch `localhost`. HEAD `ac56dd15114d85ebcdc42554dacf487c106c25ee`. `node -v` is v24.14.1.

## BR-0 STOPPED

No commit. Stopped at the dirty-tree gate. `git status` is not limited to `docs/superpowers/overnight-av-fixes/RUNLOG.md`, so the building-block list was not written and no product files were read for this prompt.

Tracked modifications besides the run log:

- `docs/brain/BLAST-RADIUS.md`
- `docs/brain/INVARIANTS.md`
- `docs/brain/modules/pacing.md`
- `lib/partner-ingest/parseTests.ts`
- `lib/partner-ingest/runPartnerIngest.ts`
- `lib/partner-ingest/__tests__/parseChannelFactory.test.ts`
- `lib/partner-ingest/__tests__/parseTests.test.ts`
- `lib/partner-ingest/__tests__/runPartnerIngest.test.ts`

Untracked:

- `CF-T4-PREFLIGHT.md`
- `CODEX_FOUNDATION_DISCOVERY.md`
- `CODEX_REPAIR_DISCOVERY.md`
- `CONTAINER_TOTALS_DISCOVERY.md`
- `RL-0-DISCOVERY.md`
- `VISTAR-SCHEDULED-DISCOVERY.md`
- `avmediaplanClaude outputsmerge-diag.txt` (filename ends with U+F8E2)
- `docs/superpowers/DISCOVERY-brand-05b-ui.md`
- `docs/superpowers/DISCOVERY-design-system-consolidation.md`
- `docs/superpowers/discovery-delivered-tile-2026-10-05.md`
- `docs/superpowers/discovery-fx1-main-live-xano-2026-10-06.md`
- `docs/superpowers/overnight-av-fixes/discovery/`

The design file is present at `Claude outputs/design/assembledview-05b-design.html`. It was not opened. Confidence in the stop is above 90%.

- SHA: none
- Files: `docs/superpowers/overnight-av-fixes/RUNLOG.md` only
- Checks: none (pre-flight stopped)
- Morning smoke: none

## BR-1 DONE e68264d5

Commit `e68264d5` `style(shell): search pill, light/black segment and sidebar user card (05b)`.

The signed-in top bar is breadcrumbs, a sand Search pill (`CommandPaletteTrigger`, Ctrl K hint from `sm` up) that dispatches `av:open-command-palette`, then the Light / Black segment (`segmentChipClass`, active lime). The moon icon and "Hi …" greeting are gone. Ctrl and Cmd K still toggle the palette. The sidebar trigger and its separator stay beside the breadcrumbs.

The sidebar card is a forest circle with white initials, the name at 13px bold, and Admin, Staff, or Client at 12px muted. No email and no photo. An email-shaped name uses the local part (`luke.fitzpatrick` → Luke Fitzpatrick, LF). Staff is neither admin nor client. Nav order is unchanged. No snapshots.

- Files: `components/ClientLayout.tsx`, `components/CommandPalette.tsx`, `components/ThemeToggle.tsx`, `components/UserMenu.tsx`, `components/__tests__/ClientLayout.privacyShell.test.tsx`, `components/__tests__/AppSidebar.relabels.test.tsx`, `docs/brain/modules/admin-misc.md`
- Checks: typecheck 0. lint 0 (existing warnings only). vitest ClientLayout.privacyShell and AppSidebar.relabels 7 pass.
- Morning smoke: every signed-in page shows the Search pill; Ctrl K opens search; the footer shows initials, name and role, not the email. Not exercised in the browser here (auth).
- Under 90%: kept the sidebar trigger beside the breadcrumbs. The prompt's left-to-right list starts at breadcrumbs, and the design's menu button is hidden on desktop. Removing the trigger would drop the control that opens the nav. Staff as a label is anyone who is not admin and not client; those sessions are sent to `/unauthorized`, so the label is rare in the shell.

## BR-2 DONE d4592f74

Commit `d4592f74` `style(pages): 05b page titles with serif accent and lede`.

Home, Campaigns, Pacing, Create, Edit and the four Clients billing sections use `PageHeader`. Home is "Good morning|afternoon|evening," plus the first name in serif (Melbourne hour: before 12, before 17, else evening). Campaigns, Pacing and Create use the specified ledes. Edit is "Edit" plus the campaign name, with client, MBA and the published version number in the lede. Clients billing is "Clients billing," plus the selected month. In Xero, Owed and Exceptions keep their titles and gain a one-line lede. Create and Edit no longer render a second breadcrumb. The primary create buttons stay the default lime pill. Header AVA actions on those pages are `variant="secondary"` (forest outline). No snapshots changed.

- Files: `components/layout/pageTitleCopy.ts`, `components/layout/PageHeader.tsx` (unchanged, used), `components/layout/__tests__/PageHeader.test.tsx`, `vitest.config.ts`, `components/dashboard/DashboardOverview.tsx`, `app/mediaplans/page.tsx`, `components/pacing/PacingShell.tsx`, `components/mediaplans/PlanWizardHeader.tsx`, `components/mediaplans/PlanWizardShell.tsx`, `app/mediaplans/create/page.tsx`, `app/mediaplans/mba/[mba_number]/edit/page.tsx`, `components/ava/AvaSkillActionSets.tsx`, `components/finance/sections/FinanceSectionsShell.tsx`, invoicing / in-xero / owed / xero page clients, `docs/brain/CONVENTIONS.md`, `docs/brain/modules/media-plans.md`, `docs/brain/modules/finance-billing.md`
- Checks: typecheck 0. lint 0 (existing warnings only). vitest PageHeader 4 pass. No snapshot updates.
- Morning smoke: each listed page shows the new title and lede; Create and Edit have one breadcrumb (the top bar). Not exercised in the browser here (auth).
- Under 90%: a billing range of more than one month uses "October to December" as the accent. An edit with no resolved published version says "Not published yet" rather than a version number. The Exceptions lede describes unmatched rows; the matches tab still sits under that title. Home keeps the time-range and updated line under the lede. `docs/brain/INVARIANTS.md` and `docs/brain/BLAST-RADIUS.md` have the matching sentences in the working tree and were not staged: those files already held unrelated partner-ingest edits.

## BR-3 DONE 91fecd8a

Commit `91fecd8a` `feat(brand): HeroBand, ArchTrio, JourneyLine and I/A/O cards`.

`HeroBand` is an ink band (`rounded-frame`, white type, muted-on-black captions) with slots for chips, a title plus serif accent, meta, the journey, right-side actions, and an optional `ArchTrio`. The primary button stays the lime pill. The secondary button on the band uses a forest-light outline and white text. `ArchTrio` is three rising bars (sky, forest light, lime), `aria-hidden`, hidden below 980px. `JourneyLine` takes a `CAMPAIGN_PHASE` key. Done steps and connectors are forest light, the first done step is sky, the current step is lime with a soft ring, and later steps are an outline. Cancelled is one "Cancelled" pill and no steps. `IAOCards` takes one insight record (`body`, `action`, `action_owner` / `actionOwner`, `outcome`, `outcome_kind` / `outcomeKind`) and renders only the cards that have text. `action_owner` sits in the Action paragraph. A card also renders when an optional figure is passed. All four are shown on `/design-system` only. No live page was changed. No snapshots.

- Files: `components/brand/HeroBand.tsx`, `components/brand/ArchTrio.tsx`, `components/brand/JourneyLine.tsx`, `components/brand/journeySteps.ts`, `components/brand/IAOCards.tsx`, `components/brand/__tests__/JourneyLine.test.tsx`, `components/brand/__tests__/IAOCards.test.tsx`, `app/(internal)/design-system/page.tsx`, `vitest.config.ts`, `docs/brain/MAP.md`
- Checks: typecheck 0. lint 0 (existing warnings only). vitest JourneyLine and IAOCards 5 pass. No snapshot updates.
- Morning smoke: `/design-system` shows the ink hero (arches from 980px), Planned and Cancelled journeys, and the three insight cards. Not exercised in the browser here (auth). The route is `notFound()` in production.
- Under 90%: `campaign_insights` has no figure column, so the big numbers are an optional `figures` prop used by the design-system example (`$5.20`, `+$4,000`, `1,940`). The Cancelled pill is panel fill with muted-on-black text, so it stays readable on the ink band.

## BR-4 DONE 0d391b75

Commit `0d391b75` `style(home): 05b home with needs attention, starting soon and spend by month`.

The greeting lede is `homeAttentionLede` from `GET /api/pacing/portfolio` `counts.attention`. Zero is "Everything is pacing to plan." A positive count is "<n> campaigns need a look today. Everything else is pacing to plan." One campaign uses the singular. While the snapshot is loading, building, or failed, the lede is left off so the page does not claim the book is on plan. Tiles are white cards with no icon chips. Live campaigns has a lime dot and "<n> start in the next 14 days" (Melbourne date-only, filtered latest plans in the selected FY). Live scopes and live clients have no sub-line. Media spend keeps the existing planned-to-date figure, labelled "Media spend FY27 to date" for the selected year, with no "of $planned" line. Needs attention is the first five attention rows (client, campaign, StatusPill, why) and Open pacing. Starting soon is the same next-10-day set as the grid, dated "12 Oct". The existing Live, Starting soon, Finished and scopes grids stay under "All campaigns." with the FY pills and list/grid toggle. No snapshots.

Spend by month plots planned only. `GET /api/dashboard/global-monthly-client-spend` is current-FY `schedule_months` (published plan), not platform delivery, and it does not take an FY parameter. There is no delivered-by-month source on Home. Other FY chips say monthly planned is loaded for the current year only. The month in progress is lime; other months are context. No gridlines. The Insight card states last month's planned total and says delivered by month is not loaded. The caption is "Calculated from published plans." The specified caption names platform delivery, which this page does not have.

- Files: `lib/dashboard/homeBrief.ts`, `lib/dashboard/__tests__/homeBrief.test.ts`, `components/dashboard/HomeStatTile.tsx`, `components/dashboard/HomeBrief.tsx`, `components/dashboard/DashboardOverview.tsx`, `vitest.config.ts`, `docs/brain/modules/dashboards-charts-exports.md`
- Checks: typecheck 0. lint 0 (existing warnings only). vitest homeBrief and homeDashboardFilters 17 pass. No snapshot updates.
- Morning smoke: `/dashboard` shows the greeting, lede, four tiles without icons, both lists, the planned chart and Insight card, then all campaigns. Not exercised in the browser here (auth).
- Under 90%: the media-spend tile is still planned media to date, not delivered. Scopes have no renewal date and clients have no "new this quarter" flag, so those dots are omitted. A count of 1 uses "campaign needs" rather than "campaigns need".

## BR-5 DONE 40c27f8e

Commit `40c27f8e` `style(campaigns): table view with lifecycle pills and CSV export`.

`/mediaplans` opens as a `DataTable` (newest `created_at` first). The existing layout toggle still switches to cards. The choice is stored per user in `avmp:campaignsLayout:v1` (try/catch), separate from the shared Home list/grid key, and defaults to table. Columns are Campaign (bold name, client underneath), MBA, Status, Dates ("1 Aug 2026 to 25 Oct 2026"), media types (neutral `MediaChannelTag` pills, first 3 then "+n"), Budget, Version, and Open. Row click and the Open link both go to the campaign edit page. Status pills are `CampaignStatusBadge` (`resolveCampaignPhase` + `CAMPAIGN_PHASE`): Planned context, Approved sky, Booked forest, Live lime with a pulse dot, Completed ink, Cancelled struck-through context. The stored status is not rewritten. Search placeholder is "Search client, campaign or MBA". Status chips (All, Live, Planned, Approved, Booked, Completed, Cancelled) filter the derived phase for both layouts. The filtered count sits under the list and stays hidden while loading. Create campaign stays the lime pill. Export CSV is a ghost button of the filtered rows, client-side, no new endpoint. Client pins and FY chips stay. No snapshots.

- Files: `app/mediaplans/page.tsx`, `lib/mediaplans/campaignListView.ts`, `lib/mediaplans/__tests__/campaignListView.test.ts`, `lib/hooks/useCampaignsLayout.ts`, `components/dashboard/DashboardFilterBar.tsx`, `vitest.config.ts`, `docs/brain/modules/media-plans.md`
- Checks: typecheck 0. lint 0 (existing warnings only). vitest campaignListView 3 pass (status chip filter and CSV columns). No snapshot updates.
- Morning smoke: `/mediaplans` opens as a table; chips filter; CSV downloads; Cards still available. Not exercised in the browser here (auth).
- Under 90%: the CSV adds a Client column so the muted line under the campaign name is not dropped. Cards are one grid of the same filtered rows, not the old per-status groups. Draft has no chip and displays as Planned. Open goes to the edit page, which was the staff item on the old Open menu.

## BR-6 DONE 378918ef

Commit `378918ef` `style(dashboard): 05b campaign hero, journey, I/A/O row and flighting`.

The campaign hero is `HeroBand` (`as="h1"`, punctuate false). Chips are the client mark and `CampaignStatusBadge`. The title is the campaign name. There is no creative-line column on the campaign, so the accent is omitted unless `creative_line`, `creativeLine`, or `mp_creative_line` is already a non-empty string on the payload. Meta is MBA, `d MMM` to `d MMM yyyy`, budget ex GST via `formatMoney` (whole dollars, same number), and version. "published d MMM" is added only when `published_at` or `publishedAt` is already on that object. `plan_date` is not used as a published date. `JourneyLine` uses `resolveCampaignPhase`. `ArchTrio` sits on the right. Download MBA is the lime primary and calls `downloadStoredPlanFile` (`mba_pdf`). Edit plan is admin-only, forest-light outline, and links to the edit page. More keeps Change range (`AdminDateRangeSelector`), View details, Downloads (scroll to the existing actions), Get AVA's read (`onAskRead` only), and Plan a scenario (`openAvaChat`). The two AVA items stay admin-only. There is no client-accent toggle.

Where we are keeps the same sentence, labels, captions, and figures. The four mini cards use a pacing-tone bar for delivered, forest for expected, sky for impressions, and forest for time elapsed. The insight row under the strip is `IAOCards` from the latest `GET /api/insights` item for the MBA that has an action or an outcome. It stays hidden while loading, on 401/403, on error, and when no such row exists. No figures are passed.

The existing media-plan gantt is the flighting chart. Timeline title is "Flighting." with the caption "Bars show planned bursts. Line marks today." `flighting` paints the full planned span: active bursts forest, past or future context, today line already ink. Other gantt callers are unchanged. `SpendChartsRow` is a planned-media donut and monthly stack. There is no cumulative expected-versus-delivered chart on this dashboard, so none was added. Numbers and data sources are unchanged. No snapshots.

- Files: `components/dashboard/campaign/CampaignHeroBanner.tsx`, `components/dashboard/campaign/CampaignStatusStrip.tsx`, `components/dashboard/campaign/CampaignInsightCards.tsx`, `components/dashboard/campaign/MediaPlanVizSection.tsx`, `components/dashboard/campaign/mediaGanttReshape.ts`, `components/charts/system/domain-charts.tsx`, `app/dashboard/[slug]/[mba_number]/components/CampaignPageAssembly.tsx`, `app/dashboard/[slug]/[mba_number]/components/MediaGanttChart.tsx`, `components/dashboard/campaign/__tests__/mediaGanttReshape.test.ts`, `docs/brain/modules/dashboards-charts-exports.md`
- Checks: typecheck 0. lint 0 (existing warnings only). `test:campaign-dashboard-range` node tests 73 pass, including the flighting tone test. Vitest in that script passed 32 on a rerun; the billing Excel case timed out once at 15s while typecheck and lint were running beside it, then passed alone in under a second. JourneyLine and IAOCards 5 pass. No snapshot updates.
- Morning smoke: `/dashboard/golf-australia/golf025` and `/dashboard/bic/BICAU002` show the hero with journey and arches, Download MBA as the lime primary, the old actions under More, and flighting. Not exercised in the browser here (auth).
- Under 90%: no creative-line field was found, so live campaigns will have no accent. The page object does not currently copy `published_at`, so the published date will be missing until that field is on the payload. Flighting bar width is the full planned span; the delivered / planned label is unchanged. Change range sits inside More; the calendar is a second popover, and `onInteractOutside` tries to keep the menu open while it is up. Last updated stays the existing date caption. `docs/brain/INVARIANTS.md` and `docs/brain/BLAST-RADIUS.md` were left unstaged.

## BR-7 DONE 57ac2557

Commit `57ac2557` `style(pacing): click-to-filter tiles and 05b line cards`.

Portfolio tiles are Live, Behind, On track, Ahead, Over-pacing, and Needs attention. Clicking a tile filters the cards (`aria-pressed`); the active tile is ink with white text. Clicking it again clears the filter. The separate status legend card is gone from the portfolio board. The pacing lede keeps the 90% / 110% sentence, and How we calculate opens a popover of the five `portfolioLegendItems` lines. There was no separate explanation page. Section tabs use `segmentChipClass` (lime when selected).

Each campaign card keeps the same figures and channel rows. The header is client, campaign, MBA, and `StatusPill`. The time bar is forest. The spend bar is coloured by status, filled as spend against budget, with an ink tick at expected against budget. The pace percent beside the bar is still `spendPct`. KPI chips are white bordered mini cards. The why line is plain text under a hairline, and it still hides on the "everything else" section. No snapshots.

- Files: `components/pacing/portfolio/PortfolioStatusTiles.tsx`, `components/pacing/portfolio/PortfolioCardsBoard.tsx`, `components/pacing/portfolio/CampaignPacingCard.tsx`, `components/pacing/PacingCalculateLink.tsx`, `components/pacing/PacingShell.tsx`, `components/pacing/portfolio/__tests__/PortfolioCardsBoard.test.tsx`, `components/pacing/portfolio/__tests__/CampaignPacingCard.test.tsx`, `docs/brain/CONVENTIONS.md`
- Checks: typecheck 0. lint 0 (existing warnings only). `test:pacing-portfolio` 24 node tests and 7 vitest pass, including tile click filters then clears. No snapshot updates.
- Morning smoke: `/pacing/portfolio` — Behind shows only Behind cards, the legend card is gone, and the spend bar has the expected tick. Not exercised in the browser here (auth).
- Under 90%: the spend bar width is now spend against budget so the tick can sit at expected. The printed dollars, percents, days, rates, and channel rows are the same. Overview and the channel boards still render their own legend cards. `docs/brain/modules/pacing.md` and `docs/brain/BLAST-RADIUS.md` still say the portfolio passes a legend card and that tabs use `navChipClass`; those files were already dirty and were not staged. The matching sentences are in `docs/brain/CONVENTIONS.md`.

## BR-8 DONE 90d9e437

Commit `90d9e437` `style(plans): ink bottom bar with totals and files menu, media-type chips`.

Create and edit share an ink bottom bar the width of the content column (offset by the collapsed sidebar). Left: Budget, Allocated, Unallocated. Middle: autosave text. Right: Save draft (forest-light outline), Files, Publish (lime, existing split). Files holds every draft and published download, Generate Naming (Ava), and Export draft, with the same handlers, disabled rules, and busy labels. The page reserves the measured bar height. Ask Ava lifts while the wizard shell is mounted. A dirty edit shows Unpublished changes beside the title. Enabled media types are sticky chips that scroll to their section; + Add media type opens the existing switches. The steps rail stays. Line-item cards (`ExpertCard`) use the sand fill.

- Files: `components/mediaplans/PlanWizardBottomBar.tsx`, `components/mediaplans/MediaTypeChipRow.tsx`, `components/mediaplans/PlanWizardShell.tsx`, `components/mediaplans/PlanWizardHeader.tsx`, `components/mediaplans/SplitActionButton.tsx`, `components/ChatWidget.tsx`, `components/media-containers/ExpertCard.tsx`, `app/globals.css`, `app/mediaplans/create/page.tsx`, `app/mediaplans/mba/[mba_number]/edit/page.tsx`, `components/mediaplans/__tests__/PlanWizardBottomBar.test.tsx`, `docs/brain/modules/media-plans.md`
- Checks: typecheck 0. lint 0 (existing warnings only). `test:plan-drafts` pass (6 skipped, pre-existing). `test:dirty-controller` pass. `test:expert-goldens` pass. No snapshot updates.
- Morning smoke: Create and Edit at 1280 and 1440 — ink bar with totals, Files holds every download, no sideways scroll, Ask Ava clear, + Add media type adds a container. Not exercised in the browser here (auth).
- Under 90%: Allocated is `formatMoney(totalInvestmentAllocated)` on create and `formatMoney(totalInvestment)` on edit. Those are the figures already passed into budget remaining. The draft summary card labels Budget and Budget remaining, not Allocated. Budget and Unallocated on the bar are the same formatted strings as that card. Unallocated is lime when the remaining number is 0 and amber (`text-pacing-behind`) when it is negative. The in-page exports block and the dashboard download bar are unchanged. `docs/brain/BLAST-RADIUS.md` still describes the old floating bar; it was already dirty and was not staged. The matching sentences are in `docs/brain/modules/media-plans.md`.

## BR-9 DONE 35e54ef7

Commit `35e54ef7` `style(finance): billing month chips, stat cards and lifecycle table`.

Month chips for the selected FY (Jul–Jun) sit above the existing FY / month-from / month-to / clients filters. The pressed chip is the applied single month, or the current month when it sits inside a wider range (so FY-to-date landing still highlights this month). Choosing a chip sets month-from and month-to to that month and applies, including the URL. The filter row stays for ranges.

Stat cards are Expected, Drafted in Xero, Issued and paid, and Overdue. Each dollar is the sum of loaded `record.total` for that derived state. Issued and paid is issued + paid. Issued outside AV stays in Expected only. Overdue uses `text-status-critical-fg` (the light token is `BRAND.functional.coralText`) and a `bg-tone-critical` dot. The list is every derived state in the loaded scope, so Approve still shows on Ready rows. Cards stay the default. Table is the list side of `ListGridToggle`.

Table columns: Client, Reference (`mba_number`), Type, State (`BillingStateBadge` / `BILLING_STATE`, including Ready, Approved, Sent to finance, Drafted, Issued, Paid, Overdue), Expected, In Xero, Difference, Approved by, plus Actions. Send to accounts, Clear for issue, and Approve ready stay on the month bar in both layouts. Row Approve, Un-approve, and the rest of `RowActionLine` stay on the table via `actionsOnly`. No new billing states were added. No snapshots.

- Files: `components/finance/sections/invoicing/BillingMonthChips.tsx`, `components/finance/sections/invoicing/BillingStatCards.tsx`, `components/finance/sections/invoicing/InvoicingRecordsTable.tsx`, `components/finance/sections/invoicing/InvoicingPageClient.tsx`, `components/finance/sections/invoicing/InvoicingPlanRow.tsx`, `components/finance/sections/StatTile.tsx`, `lib/finance/sections/billingPresentation.ts`, `lib/finance/sections/__tests__/billingPresentation.test.ts`, `package.json`, `docs/brain/modules/finance-billing.md`
- Checks: typecheck 0. lint 0 (existing warnings only). `test:finance-sections` 246 node tests, 7 draft-match tests, and 28 vitest pass. No snapshot updates.
- Morning smoke: `/finance/invoicing` — month chips switch the month, Table shows state pills, Approve / Send to accounts still work. Not exercised in the browser here (auth).
- Under 90%: Drafted in Xero, Issued and paid, and Overdue are schedule expected dollars for rows already in that derived state, not a separate Xero ledger total. The Xero subtotal is used to derive state and is not on the client `BillingRecord`, so In Xero reads “Not in Xero” and Difference stays empty even when a match exists. Approved by is “Waiting” until `approved_at`, then the approval date — `approved_by_name` is stored and not on the loaded record. The current-month chip is pressed on the FY-to-date landing even though from and to are still a range; the range narrows only when a chip is chosen. The old funnel strip is no longer mounted; its helper and tests remain. `docs/brain/BLAST-RADIUS.md` and `docs/brain/INVARIANTS.md` were already dirty and were not staged.

## BR-Z DONE

Wrap-up on `localhost`, 10 Oct 2026 (Australia/Sydney). HEAD before this commit is `35e54ef7`. Nothing pushed. No snapshot files were updated. The two failing pins are source-order checks, not snapshots, and were left as they are.

| ID | Status | SHA | One line |
|---|---|---|---|
| BR-0 | STOPPED | none | Dirty tree; building-block list was not written |
| BR-1 | DONE | e68264d5 | Search pill, Light/Black segment, sidebar initials card |
| BR-2 | DONE | d4592f74 | Page titles with a serif accent and a lede |
| BR-3 | DONE | 91fecd8a | HeroBand, ArchTrio, JourneyLine and I/A/O cards |
| BR-4 | DONE | 0d391b75 | Home needs attention, starting soon, planned spend by month |
| BR-5 | DONE | 40c27f8e | Campaigns table, lifecycle pills and CSV export |
| BR-6 | DONE | 378918ef | Campaign hero, journey, I/A/O row and flighting |
| BR-7 | DONE | 57ac2557 | Pacing tiles filter the cards; line cards restyled |
| BR-8 | DONE | 90d9e437 | Ink plan bar with totals and Files; media-type chips |
| BR-9 | DONE | 35e54ef7 | Billing month chips, stat cards and lifecycle table |
| BR-Z | DONE | this commit | Full gate and test suite recorded; run log committed |

Morning smoke. None of these were opened in the browser (Auth0). Look for:

| Route | Look for |
|---|---|
| Any signed-in page | Sand Search pill; Ctrl K opens search; Light/Black segment; sidebar shows initials, name and role, not the email |
| `/dashboard` | Greeting and lede, four tiles with no icons, Needs attention, Starting soon, planned spend by month, then all campaigns |
| `/mediaplans` | Opens as a table; status chips filter; Export CSV; Cards still available |
| `/mediaplans/create` | One breadcrumb; ink bar with Budget, Allocated, Unallocated; Files holds the downloads; media-type chips; Ask Ava sits above the bar |
| `/mediaplans/mba/[mba_number]/edit` | Same ink bar and chips; Unpublished changes beside the title when the form is dirty |
| `/dashboard/golf-australia/golf025` and `/dashboard/bic/BICAU002` | Ink hero, journey, arches, Download MBA as the lime primary, other actions under More, flighting bars |
| `/pacing` | Title and lede |
| `/pacing/portfolio` | Clicking Behind shows only Behind cards; the legend card is gone; the spend bar has an expected tick |
| `/finance/invoicing` | Jul–Jun chips switch the month; Expected, Drafted in Xero, Issued and paid, Overdue; Table shows state pills; Approve and Send to accounts still work |
| `/finance/in-xero`, `/finance/owed`, `/finance/xero` | Existing titles, plus a one-line lede |
| `/design-system` | Ink hero, Planned and Cancelled journeys, three insight cards. The route is `notFound()` in production |

Checks:

- `npm run gate:main` exit 134. typecheck, check:egress-guards, lint, check:client-server-only, check:drizzle-snapshot, check:hardcoded-urls and check:money-inline all passed, then `next build` died: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` at about 4 GB. check:egress-guards still prints the known FX-1 Xano warning and then `check:egress-guards ok`. lint exit 0, same pre-existing warning set.
- `npm run build` retried with `NODE_OPTIONS=--max-old-space-size=8192`. Exit 0, about 243s. Next.js 15.5.24. Route table includes `/finance/invoicing`, `/pacing/portfolio`, `/mediaplans` and the campaign dashboard.
- `npm run test:all` exit 1, about 702s, 123/124 suites. Failed: `test:postgres-save-mode` (251 pass, 2 fail, 20 skipped). Both failures are the BR-8 bar, not snapshots.
  - `planWizardSaveBar.test.ts` “shared component order is Publish, Save draft, then MBA first in the download group” — Save draft now sits before Publish.
  - `postgresSavePayload.integration.test.ts` “both pages host banners under the header and keep buttons in bottomBar” — the create wizard bar no longer contains `CampaignExportsSection`; those downloads are in the Files menu.
- No snapshot updates.

## AV-P1 DONE aee4bc3a

Commit `aee4bc3a` `fix(pacing): a source timeout fails the portfolio build instead of storing a partial snapshot`.

`loadBounded` still returned `[]` on `portfolio source timeout` (confirmed before the edit). It now records the timing row and throws `portfolio source timeout: <source>`. `buildCampaignPacingRows` logs `pacing_portfolio_source_timing` and rethrows. A versions timeout is rewritten to the existing `portfolio versions read timed out`. If any timing is `timedOut` after the loads return (the overall-budget path still returns `[]` without the timeout error), the build throws before `assembleCampaignPacingRows`. `buildAndStorePortfolioSnapshot` has no catch, so that throw never reaches `upsertPortfolioSnapshot`. A successful read of zero rows is still assembled and upserted.

Callers were not changed.

- Cron `app/api/cron/pacing-portfolio/route.ts`: the `catch` logs `[cron/pacing-portfolio] fatal` and returns `NextResponse.json({ status: "error", message }, { status: 500 })`.
- Admin inline: `servePortfolioSnapshot` awaits `buildAndStore` with no catch (`if (args.isAdmin) { const built = await args.buildAndStore(...) }`). `GET /api/pacing/portfolio` catches that and returns `{ error: "internal_error" }` with status 500.
- `after()` path: a non-admin miss returns 202 `{ building: true }` and `after(() => { void work().catch(...) })` logs `[api/pacing/portfolio] background build failed`. The throw does not upsert.

- Files: `lib/pacing/portfolio/loadPortfolioChannelSources.ts`, `buildCampaignPacingRows.ts`, `buildAndStorePortfolioSnapshot.ts`, `servePortfolioSnapshot.ts` (optional `perSourceTimeoutMs`, unset on the serving path), `lib/pacing/portfolio/__tests__/composeChannelSources.test.ts`, `lib/pacing/portfolio/__tests__/portfolioSourceTimeout.test.ts`, `package.json`, and one sentence each in `docs/brain/modules/pacing.md`, `docs/brain/INVARIANTS.md`, `docs/brain/BLAST-RADIUS.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). `test:pacing-portfolio` 24 node + 4 timeout tests + 7 vitest, all pass.
- Morning smoke: nothing to see until a rebuild. A slow source should show as a failed build in the logs, not an upsert. Not exercised here.
- Under 90%: `git add` of the three brain paths also committed pre-existing dirty sentences that were already in the working tree (partner-ingest T4 no longer gates the load; invoicing lede / `accent="none"`; plan wizard `PageHeader`). The partner-ingest source files are still uncommitted. Those extra sentences are in `aee4bc3a`. Not amended.

## AV-P2 DONE 333bb5db

Commit `333bb5db` `chore(pacing): warn when the stored live count is below the live set; correct cron time comment`.

Live is the builder's existing gate: `isLiveCampaignStatus` on a version row's `campaign_status`, `campaign_start_date`, and `campaign_end_date` for the same asOfDate. Distinct campaigns are distinct `mba_number` values. After a successful unscoped build, if `counts.live` is below that set, `logJob` writes `pacing_portfolio_live_count_low` with asOfDate, scopeKey, `counts.live`, expectedLive, and the first 20 missing ids. The upsert still runs. A version row has no client name, so a scoped build does not use this comparison (it would warn about every other client's live campaigns).

The cron route comment now says 21:00 UTC (08:00 Melbourne AEDT, 07:00 AEST). `vercel.json` is still `0 21 * * *`.

- Files: `lib/pacing/portfolio/buildCampaignPacingRows.ts`, `buildAndStorePortfolioSnapshot.ts`, `lib/pacing/campaigns/pacingRowsCache.ts` (unwraps `.rows`), `app/api/cron/pacing-portfolio/route.ts`, `lib/pacing/portfolio/__tests__/portfolioSourceTimeout.test.ts`, `package.json`, `docs/brain/modules/pacing.md`, `docs/brain/INVARIANTS.md`, `docs/brain/BLAST-RADIUS.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). `test:pacing-portfolio` 24 node + 5 timeout/live-count tests + 7 vitest, all pass. The new test stores 2 rows against 3 live version campaigns and logs `missing001`.
- Morning smoke: none in the UI. A short unscoped snapshot should log `pacing_portfolio_live_count_low` and still upsert.
- Under 90%: a scoped snapshot that drops a live campaign in that scope does not warn. The versions read cannot be filtered by client.

## AV-P3 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-P3-portfolio-build-design.md`. No code change. File left untracked. No SHA.

Recommend a lease on `pacing_portfolio_snapshots` (one statement, survives the transaction pooler) plus a conditional upsert on a new `build_started_at`. `generated_at` is the write time, and the page's `Updated` label reads it in Melbourne. Session advisory locks do not cover a multi-minute build on port 6543. A second cron at 21:30 UTC that no-ops when today's ready row exists covers a single 504 and does not backfill 8 or 9 Oct. Serve the latest ready same-scope snapshot as 200 with `As of` that date while today builds, and do not put the ~4 MB body in the Next data cache.

- Checks: none. Read-only.
- Morning smoke: none. Luke picks the options.
- Under 90%: 8 and 9 Oct cron invocations were not in the logs this pack could read (70%). Failing fast on postgres.js `Unknown Message` is 75% — on the bad 10 Oct request the versions query still finished. The lease SQL must not hide a ready `rows` value during admin refresh (85%).

## AV-P4 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-P4-client-expected-to-date.md`. No code change. File left untracked. No SHA.

The $500.0K is krusty001 `campaign_budget_cents` 50000000 ($500,000), flight 1–31 Aug 2026. The August delivery row is $0 media. The completed-card fallback copies that budget into both expected-to-date and plan budget, so the division is 100%. The tiles do not call `resolveCampaignExpectedSpendToDate` (that returns $0 here). The 0.0% and Campaigns 0 are `useCountUp` starting at 0; “1 planned” is krusty002 and is not animated. Default range is FY 2026-07-01 to 2027-06-30.

- Checks: none. Read-only, plus a Postgres read of the Krusty Krab published rows. Temporary query script removed.
- Morning smoke: none.
- Under 90%: did not watch the signed-in page after the one-second count-up (90% the settled percent is 100). Dropping the completed fallback also changes other completed campaigns with no positive expected-to-date (85%).

## AV-P5 DONE 25f673de

Commit `25f673de` `fix(mediaplans): draft downloads respect the end-after-start check`.

Create and edit pass the existing `datesOutOfOrder` flag into `PlanWizardBottomBar` as `draftDownloadsBlocked`. That is the same result that disables Publish (`campaignDatesOutOfOrder` from `endIsBeforeStart`, or a burst end before its start). The three draft file items (Download draft MBA, Download draft Media Plan, Download draft Media Plan (AA), and the published-dirty Draft labels) disable and take `END_BEFORE_START_MESSAGE` as `title`. Published downloads and Export draft stay enabled.

`campaignStartDate` and `campaignEndDate` are on the save body, so the server step was not skipped. `draftDocumentsBodySchema` `superRefine` calls `endIsBeforeStart` and the route's existing 400 `{ error: "Validation failed", issues }` carries the message. Equal civil days still render. Missing dates stay allowed. Burst dates in the body stay `z.unknown()`; the UI flag still blocks those, the route does not re-check them.

- Files: `components/mediaplans/PlanWizardBottomBar.tsx`, both wizard pages, `lib/docs/draftDocumentsBody.ts`, bottom-bar and draft-documents tests, `docs/brain/modules/media-plans.md`, `docs/brain/INVARIANTS.md`, `docs/brain/BLAST-RADIUS.md`.
- Checks: typecheck 0. `next lint` on the touched files exit 0 (pre-existing hook warnings on the wizard pages only). `vitest run components/mediaplans/__tests__/PlanWizardBottomBar.test.tsx` 10 pass. Draft-documents route test 7 pass, including 400 for 15 Nov 2026 to 31 Oct 2026 and 200 for equal dates.
- Morning smoke: create a Krusty draft with end before start. Download draft MBA and Download draft Media Plan in Files are disabled, title "End date must be on or after the start date". Export draft stays enabled. Not exercised here (Auth0).

## AV-PZ DONE

Commit message `docs(runlog): AV pacing snapshot pack wrap-up`. This entry is that commit. No product code.

### Prompts

| ID | Result | SHA | What |
|---|---|---|---|
| AV-P1 | DONE | aee4bc3a | A source timeout fails the portfolio build and does not upsert |
| AV-P2 | DONE | 333bb5db | Warn when the stored live count is below the live set; cron comment is 21:00 UTC |
| AV-P3 | DISCOVERY | none | Portfolio build concurrency, cron timeout, and what users see while it builds |
| AV-P4 | DISCOVERY | none | Client dashboard expected-to-date vs plan committed |
| AV-P5 | DONE | 25f673de | Draft downloads respect the end-after-start check |
| AV-PZ | DONE | this commit | Full suite recorded; run log committed |

None PARKED. None STOPPED.

Discovery files, left untracked:

- `docs/superpowers/overnight-av-fixes/discovery/AV-P3-portfolio-build-design.md`
- `docs/superpowers/overnight-av-fixes/discovery/AV-P4-client-expected-to-date.md`

### Gates

| Gate | Result |
|---|---|
| typecheck | PASS exit 0 |
| lint | PASS exit 0 (pre-existing warnings only) |
| check:billing-line-id-equality | PASS exit 0 |
| check:stacking-layers | PASS exit 0 |
| check:client-server-only | PASS exit 0 |
| check:drizzle-snapshot | PASS exit 0 (empty `db:generate` diff) |
| check:hardcoded-urls | PASS exit 0 |
| check:money-inline | PASS exit 0 (115 files, 250 hits) |
| check:egress-guards | PASS exit 0 (known FX-1 Xano warning, then ok) |
| test:all | FAIL exit 1, about 615s, 123/124 suites |

`test:postgres-save-mode` is the only failed suite. Both assertions are the same ones recorded under BR-Z, from `90d9e437` (`style(plans): ink bottom bar with totals and files menu, media-type chips`), not from AV-P1, AV-P2, or AV-P5:

- `planWizardSaveBar.test.ts` “shared component order is Publish, Save draft, then MBA first in the download group” — `Save draft must follow Publish`.
- `postgresSavePayload.integration.test.ts` — the create wizard bar no longer matches `/CampaignExportsSection/`.

Not fixed here.

### Morning smoke

| Look at | Expect |
|---|---|
| Portfolio build logs | A source timeout is a failed build. No partial snapshot is stored. |
| Unscoped portfolio snapshot | If `counts.live` is below the live set, `pacing_portfolio_live_count_low` is logged and the upsert still happens. |
| AV-P3 / AV-P4 | Nothing to click. Luke picks the options in the two discovery files. |
| Create a Krusty draft with end before start | Download draft MBA and Download draft Media Plan are disabled, title "End date must be on or after the start date". Export draft stays enabled. |

## AV-SF1 DONE 5202c930

Commit `5202c930` `fix(plans): browser-draft restore keeps campaign dates on Edit`.

Date paths before the fix. Both pages put `form.getValues()` into `buildPlanDraftSnapshot` and both restored with `form.reset(state.formValues)`.

Create serialise (`app/mediaplans/create/page.tsx`, snapshot callback): `formValues: form.getValues()`. Create has no server draft (`masterId` null), so IndexedDB structured-clone keeps `Date`s. Export JSON (`exportCreateDraftFile` → `JSON.stringify`) turns a Melbourne midnight into a UTC instant, e.g. 15 Nov 2026 → `2026-11-14T13:00:00.000Z`. Create restore was `if (state.formValues) form.reset(state.formValues as never)` inside `onRestore` / `onRevertToBase`. A live Create draft still held `Date`s, so the pickers stayed on the right day.

Edit serialise (`app/mediaplans/mba/[mba_number]/edit/page.tsx`, `getSnapshot`): the same `formValues: form.getValues()`. Edit also writes the server draft, and `GET /api/plans/drafts` returns `draftStateJson` after JSON, so those `Date`s come back as ISO strings. Edit restore was the same `form.reset(state.formValues)` in `onRestore` and `onRevertToBase`.

Cause. `SingleDatePicker` shows "Pick a date" unless `isValidPickerDate` sees a `Date`. The changes list used `calendarDay`, which sliced any string matching `YYYY-MM-DD` to the first 10 characters, so `2026-11-14T13:00:00.000Z` (15 Nov in Melbourne) compared as 14 Nov, and `2026-12-19T13:00:00.000Z` as 19 Dec.

Red, `TZ=Australia/Melbourne`, before the helper did anything but return the stored values: round-trip failed with `expected a Date, got string 2026-11-14T13:00:00.000Z`. A budget-only restore listed `mp_campaignbudget`, `mp_campaigndates_end`, and `mp_campaigndates_start`.

Fix. `draftCampaignCivilDay` / `restoreDraftFormValues` (`lib/mediaplan/drafts/campaignDraftDates.ts`). A `Date` stays the local civil day. A UTC ISO string is the Australia/Melbourne civil day of that instant, then `parseDateOnlyString` makes a local `Date`. Both pages call it in `onRestore` and `onRevertToBase`. `calendarDay` uses the same helper, so the banner does not treat the instant as the UTC date prefix. Plan save is still `toDateOnlyString`. No snapshot files changed.

- Checks: typecheck 0. lint 0 (existing warnings only). test:plan-drafts 65 pass, 6 skipped, route tests 12 pass, vitest 74 pass (includes the new round-trip). test:dirty-controller 30 pass plus vitest 40 pass. The new test also passed with `TZ=UTC`.
- Morning smoke: Open krusty002 Edit, change the PO, reload. The banner lists the PO change only. Dates still read 15 Nov to 20 Dec 2026. Not opened in the browser here (auth).
- The production banner said "3 changes" and the note quoted two date rows. This fix removes those date rows. A third field, if there was one, was not in the quoted list.

## AV-SF3 DONE 2f63266c

Commit `2f63266c` `style(plans): lime Publish pill and bar follows the sidebar width`.

Publish (the primary split while `SAVE_PUBLISHES_IMMEDIATELY` is on, and the explicit Publish split) uses `bg-accent` / `text-accent-foreground`. The caret gets the same classes. Save draft stays the forest outline (`border-am-forest-light`, transparent, white text). Disabled states, labels, and the split menu are unchanged.

The bar in `PlanWizardShell` is `left-0` on mobile, `left-[var(--sidebar-width)]` while the sidebar is open, and `left-12` when it is collapsed. `--sidebar-width` is the variable `SidebarProvider` already sets (`224px`). Collapsed is the same `left-12` as before. No hard-coded 230.

Source pins updated because they still failed after the style change:

- `lib/mediaplan/__tests__/planWizardSaveBar.test.ts` — “shared component order is Save draft before Publish, with downloads in Files” (was “Save draft must follow Publish”). Also pins `bg-accent` instead of `bg-primary`, and MBA before Media Plan inside `fileItems`.
- `lib/mediaplan/__tests__/postgresSavePayload.integration.test.ts` — the wizard bar must not contain `CampaignExportsSection`. Downloads are the `onPublishMba` / `onDownloadMediaPlan` props the Files menu uses.

No snapshot files changed.

- Checks: typecheck 0. lint 0 (existing warnings only). Bottom-bar and shell vitest 16 pass. `test:postgres-save-mode` 253 pass, 20 skipped, 0 fail.
- Morning smoke: krusty002 Edit with the sidebar open. The footer card shows, the bar starts at the content edge, and Publish is lime. Not opened in the browser here (auth). The wizard still collapses the sidebar on mount; reopen it to see the open-width offset.
- Under 90%: the content frame also has an 8px inset (`md:m-2`). The bar starts at `--sidebar-width`, which is the sidebar’s right edge, not 8px inside that margin. Confidence on the footer card being clear of the bar is high.

## AV-SF4 DONE 63b32517

Commit `63b32517` `fix(plans): Edit lede names the published version`.

BR-2 lede is `editCampaignLede` in `components/layout/pageTitleCopy.ts`. The edit page passed `publishedVersionForTitle`, which looked up `publishedVersionId` in `availableVersions`. The MBA GET leaves `versions` empty until the picker asks for version meta, so that lookup was null and the lede said "Not published yet" while the loaded row was v2 with `published_at`. The header "v2" is the loaded version number. "Publishing creates v3" is `describeVersionHeaderTrail` on the next save ordinal (`SAVE_PUBLISHES_IMMEDIATELY`), not the published ordinal, so the lede uses `published_at` instead.

`publishedVersionNumberForEditLede` takes the pointer row when that row has `published_at`, or the loaded version when that row is the published cut. No stamp stays "Not published yet."

- Files: `components/layout/pageTitleCopy.ts`, `app/mediaplans/mba/[mba_number]/edit/page.tsx`, `components/layout/__tests__/PageHeader.test.tsx`, `docs/brain/modules/media-plans.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). PageHeader vitest 5 pass. Edit-page `planWizardSaveBar.test.ts` 35 pass. No snapshot files changed.
- Morning smoke: krusty002 Edit lede says version 2 published. Not opened in the browser here (auth).
- Under 90%: an older unpublished version opened before the version list loads, with a published pointer that is not the loaded row, still has no ordinal to name. The default edit load is the published cut, which is the krusty002 case. Confidence on that case is high.

## AV-SF5 DONE 966ceee6

Commit `966ceee6` `fix(home): first-name greeting and Starting soon by date`.

Greeting. `greetingFirstName` now calls `shellUserIdentity` (the sidebar card helper) and takes the first word. An email-only account (`name` and `email` are `luke.fitzpatrick@assembledmedia.com.au`, nickname `luke.fitzpatrick`) becomes "Luke". The old helper returned the nickname as one word, which is why Home read "luke.fitzpatrick." No second parser.

Starting soon. `sortCampaignsStartingSoon` orders by start date ascending (`campaignDateOnly`), then campaign name. The Leak 11 Oct, Squealini 19 Oct, J-Tech 12 Oct sort to 11, 12, 19 Oct.

Shared source. The Starting soon card and the "Campaigns Starting Soon" grid both read the render-path `campaignsDueToStart` in `DashboardOverview`. That array is sorted before either surface. `applySort` leaves it alone until a column is chosen, so the grid's default order matches the card and a column click still wins. The AVA page-context preview builds its own `getCampaignsDueToStart()` and uses the same helper, so that preview matches too.

- Files: `components/layout/pageTitleCopy.ts`, `components/dashboard/DashboardOverview.tsx`, `lib/dashboard/homeBrief.ts`, `components/layout/__tests__/PageHeader.test.tsx`, `lib/dashboard/__tests__/homeBrief.test.ts`, `docs/brain/modules/dashboards-charts-exports.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). vitest homeBrief + PageHeader 10 pass. No snapshot files changed.
- Morning smoke: `/dashboard` reads "Good evening, Luke." after 17:00 Melbourne (the day part still follows the hour) and Starting soon runs 11, 12, 19 Oct. Not opened in the browser here (auth).
- Under 90%: if Auth0 `name` is the dotted local part with no `@` (`luke.fitzpatrick`), `shellUserIdentity` returns that string unchanged, and the greeting stays `luke.fitzpatrick`. The sidebar only title-cases when the name contains `@` or is empty and the email local part is used. The quoted Home string matches the nickname-plus-email case, which this fix covers. Confidence on that case is high.

## AV-SF6 DONE 45111d8e

Commit `45111d8e` `fix(finance): In Xero column doesn't call issued or paid rows not in Xero`.

BR-9's table (`InvoicingRecordsTable`) always printed "Not in Xero" and passed `null` into the Difference pill, because the Xero subtotal is used to derive `state` and is not copied onto `BillingRecord`. A paid, issued, or issued-outside-AV row was labelled as if it were absent from Xero.

`billingInXeroCell` shows `xero_amount` when that dollar is already on the row, and Difference uses the same figure. With no dollar, Drafted, Issued, Issued outside AV, Paid and Overdue read "In Xero" in muted text, title "Xero amount not loaded on this page". Ready, Approved and Sent to finance stay "Not in Xero". Difference stays empty without a dollar. The overlay still does not load the Xero amount.

- Files: `lib/finance/sections/billingPresentation.ts`, `lib/finance/sections/__tests__/billingPresentation.test.ts`, `components/finance/sections/invoicing/InvoicingRecordsTable.tsx`, `lib/types/financeBilling.ts`, `docs/brain/modules/finance-billing.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). `test:finance-sections` 247 node pass, 7 draft-match pass, 28 vitest pass. No snapshot files changed.
- Morning smoke: `/finance/invoicing` table layout — Paid rows read "In Xero". Not opened in the browser here (auth).
- Under 90%: none. The loaded rows have no `xero_amount`, so the lifecycle text is what production will show. Drafted is included with the issued and paid states, as the prompt lists it. Confidence is high.

## AV-SF7 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-SF7.md`. No code change. No SHA.

Overdue and Drafted in Xero sum `record.total` for AV plan months in the selected range whose derived state is exactly `overdue` or `drafted`. They are not the Owed ledger. An unapproved Xero match becomes `issued_outside_av` before either state. Owed is every open AUTHORISED invoice with amount due, not clipped to July–October. 24 of 60 is unresolved invoices (36), not a confirmed count of 34 contacts. No database query.

Pick in the note: keep the AV sum and relabel the tile (option b). Confidence 75% on the pick, 92% on the code path. Luke decides.

- Checks: none. Discovery only.
- Morning smoke: none. `/finance/invoicing` and `/finance/owed` were not opened.

## AV-SF8 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-SF8.md`. No code change. No SHA.

The Where-we-are pill is `campaignPacingVerdict` → `computePacing` → `pacingStatus`: straight-line budget, on track only inside ±5% projection variance. `slightly_under` (−15% to −5%) is the label "Behind plan on spend". The 93% on the card is delivered ÷ schedule expected (`resolveCampaignExpectedSpendToDate`). The portfolio `on_track` pace is that ratio through `deliveryStatusFromPct` (90–110). `portfolioRowFlags` only counts it. Same band: no. Same expected: the caption and the snapshot call the schedule helper; the pill does not.

Shared rule in the note: both surfaces use `deliveryStatusFromPct` of delivered ÷ that schedule expected. Do not reorder the Snowflake `PacingStatus` ladder. Confidence 93% on the split, 70% that BICAU002's two expected calls and two spend totals are the same dollars. No database query.

- Checks: none. Discovery only.
- Morning smoke: none. `/dashboard/bic/BICAU002` was not opened.

## AV-SF9 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-SF9.md`. No code change. No SHA.

Files items are a Radix item around a `<button onClick>`. The button handler runs, then Radix closes the menu. A throwaway component test (not left in the tree) saw Draft MBA and Published MBA (v2) each fire once, and the item gone after the click. `pointerup` alone does not fire the handler. `handleDraftMba` and `handleGenerateMBA` have no dirty, autosave, or first-click return. `downloadsLocked` is `isLoading || isSaving` only.

The same test dropped the click when opening Files blurred a field that set `downloadsLocked`. A PO blur does not set that flag. If the handler did start, draft `saveAs` clicks on a timeout and published MBA revokes the blob URL in the same turn as `link.click()`. Either can produce no file and no console error.

Fix in the note: `onSelect` items like `SplitActionButton`, plus a synchronous anchor click with a deferred revoke. Confidence 70% that the pair covers both sightings. Under 90% until a krusty002 click says whether a toast appeared.

- Checks: none. Discovery only. Throwaway vitest was deleted.
- Morning smoke: none. The Files menu was not clicked.

## AV-SF2 DONE 1bc14974

Commit `1bc14974` `fix(brand): hero secondary buttons are visible on the ink band`.

Edit plan and More use `variant="outline"`, whose `bg-background` was the white fill. `heroBandSecondaryClassName` set the forest-light border and white text, and had no background class, so the outline fill won. The shared class now includes `bg-transparent`. Hover stays `hover:bg-am-panel`. Every HeroBand secondary, including the design-system sample and the plan-wizard ink outline, picks that up.

- Files: `components/brand/HeroBand.tsx`, `components/dashboard/campaign/__tests__/CampaignHeroBanner.test.tsx`, `docs/brain/modules/dashboards-charts-exports.md`, `vitest.config.ts`, `package.json`.
- Checks: typecheck 0. lint 0 (existing warnings only). `test:campaign-dashboard-range` 73 node pass, 33 vitest pass, 5 range pass. Brand component vitest (JourneyLine, IAOCards) 5 pass. No snapshot files changed.
- Morning smoke: `/dashboard/bic/BICAU002` — Edit plan and More read in white on the ink band. Not opened in the browser here (auth).
- Under 90%: none. The rendered class on both buttons is `bg-transparent` and does not contain `bg-background`. Confidence is high.

## AV-SF3b DONE c93d26fe

Commit `c93d26fe` `style(plans): plan bar back to a floating ink island with lime Publish`.

The full-width ink band is a floating island again: fixed to the bottom, centred in the content column, `pointer-events-none` outside and `pointer-events-auto` on the island, with the measured spacer and safe-area padding. The column starts at `var(--sidebar-width)` while the sidebar is open, `var(--sidebar-width-icon)` when it is collapsed, and the viewport edge on mobile. The island hugs its content (`rounded-pill`, solid `bg-am-ink`, `shadow-e2`, no blur). Autosave copy hides below `xl`. Publish stays the lime pill. Save draft, its caret, and Files stay the forest outline with `bg-transparent`. The Ask Ava lift in `app/globals.css` stays: it is the wizard-bar offset, not a rule that only the full-width band used.

- Files: `components/mediaplans/PlanWizardShell.tsx`, `components/mediaplans/PlanWizardBottomBar.tsx`, `components/mediaplans/__tests__/PlanWizardBottomBar.test.tsx`, `docs/brain/modules/media-plans.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). PlanWizardBottomBar + PlanWizardShell vitest 16 pass. `test:plan-drafts` 65 node pass, 6 skipped, 12 route pass, 74 vitest pass. `test:dirty-controller` 30 node pass, 40 vitest pass. `test:postgres-save-mode` 253 pass, 20 skipped, 0 fail. Source pins `shared component order is Save draft before Publish, with downloads in Files` were not edited. No snapshot files changed.
- Morning smoke: Create and krusty002 Edit at 1280 and 1440, sidebar open and collapsed. Not opened here (auth). The wizard still collapses the sidebar on mount.
- Under 90%: Ask Ava clearance at 1280 and 1440. The lift is `bottom: 7.5rem` and the island is shorter than the old band, so it should sit above the island. Not measured in the browser.

## AV-SF10 DONE aeb3322c

Commit `aeb3322c` `style(05b): smoke polish across pacing, home and campaign page`.

Pacing pills are `whitespace-nowrap` and do not shrink. Portfolio tile counts and spend percents are ink; the dot, bar and pill keep the status colour. A selected tile other than Live titles the list with that filter ("Behind" plus the count) instead of "Needs a look today". The Home insight is "September planned $431.0K." The chart caption no longer says delivered-by-month is not loaded. Spend-by-month ticks use the same `formatMoneyCompact` `home-spend` formatter as the tooltip. The I/A/O action owner is its own "Owner:" line. A draft read that is out of date keeps its controls, hides the beats until Edit, reads "Read as at 18 Sep 2026 · Out of date.", and moves below Where we are and the I/A/O row with flex order. The strip and the I/A/O row use `space-y-6`.

- Files: `components/ui/badge.tsx`, `components/ui/status-pill.tsx`, `components/pacing/portfolio/PortfolioStatusTiles.tsx`, `CampaignPacingCard.tsx`, `CampaignPacingTable.tsx`, `PortfolioCardsBoard.tsx`, `PortfolioCardsBoard.test.tsx`, `lib/dashboard/homeBrief.ts`, `homeBrief.test.ts`, `components/dashboard/HomeBrief.tsx`, `components/brand/IAOCards.tsx`, `IAOCards.test.tsx`, `components/dashboard/campaign/CampaignReadSection.tsx`, `CampaignReadSection.test.tsx`, `CampaignPageAssembly.tsx`, `docs/brain/modules/dashboards-charts-exports.md`, `docs/brain/modules/pacing.md`, `docs/brain/BLAST-RADIUS.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). `test:pacing-portfolio` 24 + 5 node pass, 7 vitest pass. homeBrief + IAOCards vitest 8 pass. `test:campaign-dashboard-range` 73 node pass, 33 vitest pass, 5 range pass. `test:brand` 80 pass. No snapshot files changed.
- Morning smoke: pacing pills, ink tile numbers, Home insight, and a stale campaign read below the current figures. Not opened here (auth).
- Under 90%: none on the copy. The monthly spend payload is client totals, so the insight does not say "across N campaigns". The stale read stays mounted and moves with flex `order`, so it does not refetch.

## AV-SFZ DONE

`npm run gate:main` with `NODE_OPTIONS=--max-old-space-size=8192` exit 0, about 279s. `npm run test:all` once, exit 1, 123/124 suites. The only failure is `test:mb15c-published-immutable`. It is a dropped Supabase pooler connection, not a commit in this pack. Not fixed here.

### Prompts

| ID | Status | SHA |
| --- | --- | --- |
| AV-SF1 | DONE | `5202c930` |
| AV-SF2 | DONE | `1bc14974` |
| AV-SF3 | DONE | `2f63266c` |
| AV-SF3b | DONE | `c93d26fe` |
| AV-SF4 | DONE | `63b32517` |
| AV-SF5 | DONE | `966ceee6` |
| AV-SF6 | DONE | `45111d8e` |
| AV-SF7 | DISCOVERY | none |
| AV-SF8 | DISCOVERY | none |
| AV-SF9 | DISCOVERY | none |
| AV-SF10 | DONE | `aeb3322c` |
| AV-SFZ | DONE | this commit |

### Discovery files

- `docs/superpowers/overnight-av-fixes/discovery/AV-SF7.md` — billing Overdue tile is the AV plan-month sum, not the Owed ledger. Pick in the note is option b. Luke decides.
- `docs/superpowers/overnight-av-fixes/discovery/AV-SF8.md` — Where-we-are pill is ±5% straight-line projection; portfolio pace is delivered ÷ schedule expected through the 90–110 band.
- `docs/superpowers/overnight-av-fixes/discovery/AV-SF9.md` — first Files click. Handler runs, then the menu closes. Recommended fix is `onSelect` plus a synchronous anchor click. Not implemented.

### Morning smoke

None of these were opened in the browser. Auth0 blocked them.

- AV-SF1: krusty002 Edit, change the PO, reload. Banner lists the PO only. Dates still 15 Nov–20 Dec 2026.
- AV-SF2: `/dashboard/bic/BICAU002` Edit plan and More read in white on the ink band.
- AV-SF3: Create and Edit. Publish is lime. Save draft is the forest outline. The bar follows the sidebar. The sidebar footer stays visible. The wizard still collapses the sidebar on mount.
- AV-SF3b: Create and krusty002 Edit at 1280 and 1440, sidebar open and collapsed. Centred ink island, sidebar footer visible, Publish lime, Save draft forest outline, last line item above the island, Ask Ava clear of the island. Reopen the sidebar after mount. Ask Ava clearance was not measured.
- AV-SF4: krusty002 Edit lede names the published version.
- AV-SF5: `/dashboard` reads "Good evening, Luke." Starting soon runs 11, 12, 19 Oct.
- AV-SF6: Paid rows on `/finance/invoicing` read "In Xero".
- AV-SF7, AV-SF8, AV-SF9: nothing to click. BICAU002 was not opened. The Files menu was not clicked.
- AV-SF10: pacing pills stay on one line and tile numbers are ink. Home insight has no dev copy. A stale campaign read sits below the current figures.

### gate:main

| Gate | Result |
| --- | --- |
| typecheck | PASS |
| check:egress-guards | PASS |
| lint | PASS (existing warnings only) |
| check:client-server-only | PASS |
| check:drizzle-snapshot | PASS (empty diff) |
| check:hardcoded-urls | PASS |
| check:money-inline | PASS |
| build | PASS |

### test:all

123/124 PASS. FAILED: `test:mb15c-published-immutable` (exit 1, about 6.4h). Inside that file, MB-15c (i) and (ii) passed. VC1-3 published+draft then died with `read ECONNRESET` after about 15 minutes. The next four cases failed in `wipeMba` with `getaddrinfo ENOTFOUND aws-0-ap-southeast-2.pooler.supabase.com`. Closing the pool then hung about 6.1h, which is why the suite clock is about 6.7h. The next suite, `test:vc2a-published-immutable`, passed 5/5 against the same published-immutable contract once DNS answered. No commit in this pack touches `publishedBillingImmutable.mb15c.test.ts` or the pooler.

| Suite | Result |
| --- | --- |
| test:billing-line-id-match | PASS |
| test:client-server-only | PASS |
| test:brand | PASS |
| test:status | PASS |
| test:media-families | PASS |
| test:charts-registry | PASS |
| test:format-money | PASS |
| test:planned-to-date | PASS |
| test:client-dashboard-range | PASS |
| test:campaign-read | PASS |
| test:ava-skills | PASS |
| test:campaign-dashboard-range | PASS |
| test:delivery-ui | PASS |
| test:search-delivery-tiles | PASS |
| test:social-delivery | PASS |
| test:programmatic-delivery | PASS |
| test:solver | PASS |
| test:utm | PASS |
| test:weekly-gantt | PASS |
| test:week-starts-on | PASS |
| test:expert-mappings | PASS |
| test:expert-goldens | PASS |
| test:expert-paste | PASS |
| test:expert-grid-selection | PASS |
| test:spreadsheet | PASS |
| test:finance-forecast | PASS |
| test:retained-commission | PASS |
| test:deliverable-budget | PASS |
| test:editor-line-inputs | PASS |
| test:finance-filters | PASS |
| test:finance-derive | PASS |
| test:billing-divergence | PASS |
| test:billing-seed-fees | PASS |
| test:billing-fee-drift | PASS |
| test:kpi-resolve | PASS |
| test:kpi-percent-units | PASS |
| test:kpi-writes | PASS |
| test:money | PASS |
| test:money-golden | PASS |
| test:monthly-plan-calendar | PASS |
| test:kpi-review | PASS |
| test:kpi-backfill | PASS |
| test:pacing-maths | PASS |
| test:pacing-portfolio | PASS |
| test:pacing-channel | PASS |
| test:pacing-detail | PASS |
| test:pacing-scenario | PASS |
| test:pacing-relabel | PASS |
| test:pacing-plan-lines | PASS |
| test:unmapped-placements | PASS |
| test:partner-ingest | PASS |
| test:ava-tools | PASS |
| test:ava-chat-ui | PASS |
| test:ava-autopopulate | PASS |
| test:ava-detect-goldens | PASS |
| test:db-drift | PASS |
| test:forecast-targets | PASS |
| test:write-kpi | PASS |
| test:line-item-snapshot-parity | PASS |
| test:xero | PASS |
| test:finance-periods-flag | PASS |
| test:inline-schedule-amount | PASS |
| test:line-item-attrs | PASS |
| test:shadow-diff | PASS |
| test:mba-plan-detail | PASS |
| test:mba-number-alloc | PASS |
| test:channel-line-item-routes | PASS |
| test:tenant-isolation | PASS |
| test:match-text | PASS |
| test:approvals | PASS |
| test:write-clients | PASS |
| test:write-reference | PASS |
| test:mba-header-date | PASS |
| test:mba-scope | PASS |
| test:mba-media-breakdown | PASS |
| test:derive-approved-slice | PASS |
| test:live-mba-scope | PASS |
| test:mba-live-dates | PASS |
| test:finance-schedule | PASS |
| test:finance-sections | PASS |
| test:approved-slice | PASS |
| test:c1-fullscope-drift | PASS |
| test:save-plan | PASS |
| test:write-billing-overrides | PASS |
| test:write-finance | PASS |
| test:mb13-fee-override-publish | PASS |
| test:mb15c-published-immutable | FAIL |
| test:vc2a-published-immutable | PASS |
| test:vc2b-working-draft | PASS |
| test:dirty-controller | PASS |
| test:write-media-plan-masters | PASS |
| test:xano-mirror | PASS |
| test:campaign-documents | PASS |
| test:media-plan-excel | PASS |
| test:campaign-row-actions | PASS |
| test:postgres-save-mode | PASS |
| test:session-expiry | PASS |
| test:plan-drafts | PASS |
| test:codex-flag-auth | PASS |
| test:codex-stage0-guarantees | PASS |
| test:codex-stage1-detail | PASS |
| test:codex-task-detail-ui | PASS |
| test:codex-stage1-scope | PASS |
| test:codex-stage1-templates | PASS |
| test:codex-auth0-roster | PASS |
| test:dashboard-vc15-tip | PASS |
| test:clients-fail-soft | PASS |
| test:m365-site-url | PASS |
| test:m365-graph | PASS |
| test:m365-reconciliation | PASS |
| test:myhours | PASS |
| test:fireflies | PASS |
| test:performance-report-insights | PASS |
| test:insights-library | PASS |
| test:empty-channel-defaults | PASS |
| test:line-item-panels | PASS |
| test:line-item-panel-flights | PASS |
| test:publisher-profiles | PASS |
| test:ingest-propose | PASS |
| test:ingest-review | PASS |
| test:ingest-eval | PASS |
| test:ooh-expert-gate | PASS |
| test:ooh-standard-bench | PASS |
| test:specs | PASS |

- Under 90%: the mb15c failure is the pooler (`ECONNRESET`, then `ENOTFOUND`). Confidence is high that no pack commit caused it. Ask Ava clearance (AV-SF3b) is still unmeasured. AV-SF7's option pick stays at 75%. AV-SF8's dollar match stays at 70%. AV-SF9's click fix stays at 70%.

## AV-SG1 DONE 01037154

Commit `01037154` `fix(pacing): campaign page status uses the portfolio pace band`.

The Where-we-are pill is `deliveryStatusFromPct` of delivered ÷ the schedule expected the card already prints (behind below 90, on track 90–110, ahead above 110). Copy is unchanged: Behind plan on spend / On track / Ahead of plan / Critical. `deliveryStatusFromPct` does not emit over-pacing, so the strip does not turn the portfolio over-pacing flag into Critical. The sentence takes that same band. The Snowflake `PacingStatus` ladder is untouched.

`campaignPacingVerdict` stays. Callers: `CampaignSummaryRow.tsx` (not mounted; helper tests) and `lib/dashboard/__tests__/campaignPacingVerdict.test.ts`.

Portfolio `expectedForCampaign` now passes `metricsExpectedSpendToDate`: an explicit schedule value, otherwise `expectedSpendToDateFromDeliveryScheduleMonthly` on the same delivery schedule and dates, basis media — the figure the campaign page builds as `metrics.expectedSpendToDate`. Step 1 still wins when that monthly total is already above 0. Stored row shape is unchanged (`metricsExpectedSpendToDate` is not a row field). The fallback test asserts the existing key list.

- Files: `components/dashboard/campaign/CampaignStatusStrip.tsx`, `components/dashboard/campaign/__tests__/CampaignStatusStrip.test.tsx`, `lib/pacing/portfolio/assembleCampaignPacingRows.ts`, `lib/pacing/portfolio/types.ts`, `lib/pacing/portfolio/buildCampaignPacingRows.ts`, `lib/pacing/portfolio/__tests__/buildCampaignPacingRows.test.ts`, `docs/brain/modules/dashboards-charts-exports.md`, `docs/brain/modules/pacing.md`, `docs/brain/BLAST-RADIUS.md`, `docs/brain/INVARIANTS.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). `test:pacing-portfolio` 25 node pass, 5 timeout pass, 7 vitest pass. `test:campaign-dashboard-range` isolated rerun: 73 node pass, 36 vitest pass, 5 range pass. A first run of that suite failed `CampaignActions.billingExcel` on a 15s timeout while portfolio vitest ran at the same time; the isolated rerun passed. No snapshot files changed.
- Morning smoke: `/dashboard/bic/BICAU002` — the pill should match the BICAU002 card on `/pacing/portfolio`. Not opened here (auth).
- Under 90%: live BICAU002 delivered dollars and the two expected-to-date dollars were not re-queried. AV-SF8 left that match at 70%. The band rule is now the same. If those dollar figures still differ, the labels can still differ.

## AV-SG2 DONE 00329ca1

Commit `00329ca1` `fix(plans): Files menu downloads fire on the first click`.

Files items are `DropdownMenuItem` `onSelect`, matching the Publish menu. The inner button `onClick` is gone. Disabled and `title` stay (watermark hint, end-before-start, unpublished).

`lib/docs/clickBlobDownload.ts` is new. Nothing in lib already appended an anchor, clicked it, and revoked on a timeout (`chart-shell` and `ExportDeckButton` do that locally and were left alone). The helper appends the anchor, clicks it synchronously, removes it, and revokes the blob URL after 1000ms. Both `handleGenerateMBA` copies and the draft MBA, draft Media Plan, and draft AA `saveAs` calls on create and edit use it. The existing success toast runs after that click returns. Other `saveAs` calls (xlsx, naming, stored published files, zip) stay on file-saver.

- Files: `lib/docs/clickBlobDownload.ts`, `components/mediaplans/PlanWizardBottomBar.tsx`, `components/mediaplans/__tests__/PlanWizardBottomBar.test.tsx`, `app/mediaplans/create/page.tsx`, `app/mediaplans/mba/[mba_number]/edit/page.tsx`, `docs/brain/BLAST-RADIUS.md`, `docs/brain/INVARIANTS.md`, `docs/brain/modules/media-plans.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). `test:campaign-row-actions` 4 files, 34 pass. `test:plan-drafts` 65 node pass, 6 skipped, 12 route pass, 76 vitest pass. No snapshot files changed.
- Morning smoke: krusty002 Edit — change the PO, then Files > Draft MBA once. The file should arrive on the first click. Not opened here (auth).
- Under 90%: AV-SF9 stayed at 70% that this pair of fixes covers both production sightings until the krusty002 click is watched. `@testing-library/user-event` is not installed; the select test dispatches pointerdown, pointerup, then click (the sequence the discovery verified), not `element.click()` alone. That test asserts the first Draft MBA select fires the handler once and `clickBlobDownload` once.

## AV-SG3 DONE 70cf2c26

Commit `70cf2c26` `style(finance): Overdue tile names its source and links to Owed`.

The tile label is Overdue on these plans. The ready caption is the overdue row count (`1 plan month` or `N plan months`) then `· Xero overdue is on` and a link to `/finance/owed`. The link carries the applied client ids only (`?clients=`), not FY or month range. `summariseBillingStatCards` is unchanged. Drafted in Xero is unchanged.

- Files: `components/finance/sections/invoicing/BillingStatCards.tsx`, `components/finance/sections/invoicing/InvoicingPageClient.tsx`, `components/finance/sections/StatTile.tsx`, `lib/finance/sections/__tests__/billingPresentation.test.ts`, `docs/brain/modules/finance-billing.md`, `docs/brain/BLAST-RADIUS.md`.
- Checks: typecheck 0. lint 0 (existing warnings only). `test:finance-sections` 248 node pass, 7 draft-match pass, 28 vitest pass. No snapshot files changed.
- Morning smoke: `/finance/invoicing` — the tile reads Overdue on these plans and its link opens Owed. Not opened here (auth).

## AV-SGZ DONE

Commit message `docs(runlog): AV SG pack wrap-up`. This entry is that commit. No product code.

`npm run gate:main` with `NODE_OPTIONS=--max-old-space-size=8192` exit 0, about 215s. `npm run test:all` once, exit 1, 123/124 suites, about 9.1 min. The only failure is `test:postgres-save-mode`. It is not a pooler or DNS error, so it was not rerun.

### Prompts

| ID | Status | SHA |
| --- | --- | --- |
| AV-SG1 | DONE | `01037154` |
| AV-SG2 | DONE | `00329ca1` |
| AV-SG3 | DONE | `70cf2c26` |
| AV-SF11 | not in this pack | none |
| AV-SGZ | DONE | this commit |

AV-SF11 has no section in this run log and no commit on `localhost`. This pack ran AV-SG1, AV-SG2, and AV-SG3.

### Morning smoke

None of these were opened in the browser. Auth0 blocked them.

- AV-SG1: `/dashboard/bic/BICAU002` pill matches the BICAU002 card on `/pacing/portfolio`.
- AV-SG2: krusty002 Edit — change the PO, then Files > Draft MBA once. The file should arrive on the first click.
- AV-SG3: `/finance/invoicing` reads "Overdue on these plans" and its link opens Owed.

### gate:main

| Gate | Result |
| --- | --- |
| typecheck | PASS |
| check:egress-guards | PASS |
| lint | PASS (existing warnings only) |
| check:client-server-only | PASS |
| check:drizzle-snapshot | PASS (empty diff) |
| check:hardcoded-urls | PASS |
| check:money-inline | PASS |
| build | PASS |

### test:all

123/124 PASS. FAILED: `test:postgres-save-mode` (exit 1, about 4s). Inside that suite, 252 passed, 20 skipped, 1 failed: `planWizardSaveBar.test.ts` "shared component order is Save draft before Publish, with downloads in Files". The assertion looks for the source strings `onClick: onPublishMba` and `onClick: onDownloadMediaPlan`. AV-SG2 (`00329ca1`) renamed those fields to `onSelect`, so `indexOf` returns -1 and the "MBA must precede Media Plan" check fails. The Files list in `PlanWizardBottomBar.tsx` is still MBA, then Media Plan. `test:mb15c-published-immutable` passed this run (about 14s). No `ECONNRESET` or `ENOTFOUND`.

| Suite | Result |
| --- | --- |
| test:billing-line-id-match | PASS |
| test:client-server-only | PASS |
| test:brand | PASS |
| test:status | PASS |
| test:media-families | PASS |
| test:charts-registry | PASS |
| test:format-money | PASS |
| test:planned-to-date | PASS |
| test:client-dashboard-range | PASS |
| test:campaign-read | PASS |
| test:ava-skills | PASS |
| test:campaign-dashboard-range | PASS |
| test:delivery-ui | PASS |
| test:search-delivery-tiles | PASS |
| test:social-delivery | PASS |
| test:programmatic-delivery | PASS |
| test:solver | PASS |
| test:utm | PASS |
| test:weekly-gantt | PASS |
| test:week-starts-on | PASS |
| test:expert-mappings | PASS |
| test:expert-goldens | PASS |
| test:expert-paste | PASS |
| test:expert-grid-selection | PASS |
| test:spreadsheet | PASS |
| test:finance-forecast | PASS |
| test:retained-commission | PASS |
| test:deliverable-budget | PASS |
| test:editor-line-inputs | PASS |
| test:finance-filters | PASS |
| test:finance-derive | PASS |
| test:billing-divergence | PASS |
| test:billing-seed-fees | PASS |
| test:billing-fee-drift | PASS |
| test:kpi-resolve | PASS |
| test:kpi-percent-units | PASS |
| test:kpi-writes | PASS |
| test:money | PASS |
| test:money-golden | PASS |
| test:monthly-plan-calendar | PASS |
| test:kpi-review | PASS |
| test:kpi-backfill | PASS |
| test:pacing-maths | PASS |
| test:pacing-portfolio | PASS |
| test:pacing-channel | PASS |
| test:pacing-detail | PASS |
| test:pacing-scenario | PASS |
| test:pacing-relabel | PASS |
| test:pacing-plan-lines | PASS |
| test:unmapped-placements | PASS |
| test:partner-ingest | PASS |
| test:ava-tools | PASS |
| test:ava-chat-ui | PASS |
| test:ava-autopopulate | PASS |
| test:ava-detect-goldens | PASS |
| test:db-drift | PASS |
| test:forecast-targets | PASS |
| test:write-kpi | PASS |
| test:line-item-snapshot-parity | PASS |
| test:xero | PASS |
| test:finance-periods-flag | PASS |
| test:inline-schedule-amount | PASS |
| test:line-item-attrs | PASS |
| test:shadow-diff | PASS |
| test:mba-plan-detail | PASS |
| test:mba-number-alloc | PASS |
| test:channel-line-item-routes | PASS |
| test:tenant-isolation | PASS |
| test:match-text | PASS |
| test:approvals | PASS |
| test:write-clients | PASS |
| test:write-reference | PASS |
| test:mba-header-date | PASS |
| test:mba-scope | PASS |
| test:mba-media-breakdown | PASS |
| test:derive-approved-slice | PASS |
| test:live-mba-scope | PASS |
| test:mba-live-dates | PASS |
| test:finance-schedule | PASS |
| test:finance-sections | PASS |
| test:approved-slice | PASS |
| test:c1-fullscope-drift | PASS |
| test:save-plan | PASS |
| test:write-billing-overrides | PASS |
| test:write-finance | PASS |
| test:mb13-fee-override-publish | PASS |
| test:mb15c-published-immutable | PASS |
| test:vc2a-published-immutable | PASS |
| test:vc2b-working-draft | PASS |
| test:dirty-controller | PASS |
| test:write-media-plan-masters | PASS |
| test:xano-mirror | PASS |
| test:campaign-documents | PASS |
| test:media-plan-excel | PASS |
| test:campaign-row-actions | PASS |
| test:postgres-save-mode | FAIL |
| test:session-expiry | PASS |
| test:plan-drafts | PASS |
| test:codex-flag-auth | PASS |
| test:codex-stage0-guarantees | PASS |
| test:codex-stage1-detail | PASS |
| test:codex-task-detail-ui | PASS |
| test:codex-stage1-scope | PASS |
| test:codex-stage1-templates | PASS |
| test:codex-auth0-roster | PASS |
| test:dashboard-vc15-tip | PASS |
| test:clients-fail-soft | PASS |
| test:m365-site-url | PASS |
| test:m365-graph | PASS |
| test:m365-reconciliation | PASS |
| test:myhours | PASS |
| test:fireflies | PASS |
| test:performance-report-insights | PASS |
| test:insights-library | PASS |
| test:empty-channel-defaults | PASS |
| test:line-item-panels | PASS |
| test:line-item-panel-flights | PASS |
| test:publisher-profiles | PASS |
| test:ingest-propose | PASS |
| test:ingest-review | PASS |
| test:ingest-eval | PASS |
| test:ooh-expert-gate | PASS |
| test:ooh-standard-bench | PASS |
| test:specs | PASS |

- Under 90%: live BICAU002 delivered dollars versus the two expected-to-date figures were not re-queried (AV-SG1, still 70% from AV-SF8). AV-SG2's first-click fix stays at 70% until krusty002 Files > Draft MBA is watched. The `test:postgres-save-mode` failure is the renamed `onSelect` source scan, not a menu-order change. AV-SF11 was not in this pack.

## AV-SH1 DONE 1b84c47b

Commit `1b84c47b` `test(plans): save-mode pin follows Files menu onSelect`.

The failing assertion is in `lib/mediaplan/__tests__/planWizardSaveBar.test.ts`, test "shared component order is Save draft before Publish, with downloads in Files". It still requires the MBA `onSelect` to sit after `const fileItems` and before the Media Plan `onSelect`. The needles are now `onSelect: onPublishMba` and `onSelect: onDownloadMediaPlan`. The other assertions in that test are unchanged.

- Files: `lib/mediaplan/__tests__/planWizardSaveBar.test.ts`.
- Checks: `npm run test:postgres-save-mode` exit 0. 273 tests, 253 pass, 0 fail, 20 skipped.
- Morning smoke: none. Test pin only.

## AV-SF11 DONE 02f346f5

Commit `02f346f5` `fix(pacing): retry a hung source, retry cron, and serve the last good snapshot`.

`direct` was missing from the 11 Oct timing logs because the parallel load does start it. `loadBounded` only recorded a source after it settled, and the catch logged as soon as the first source rejected. Direct was still inside its 90s wait, so it was omitted. The summary now always lists search, social, programmatic, adServing, direct, and versions, and marks any not yet settled `pending: true`.

A timed-out source is retried once when the 240s budget remains. Both attempts are logged. The channel retry calls `fetch*` so it does not join the in-flight `unstable_cache` promise (production Snowflake is serverless: connect per request, then destroy). The versions retry calls `discardHungPostgresClient` (`end({ timeout: 0 })` and a new pool) before the second `readPublishedOrLivePlanVersions`. The build throws and does not upsert only when the retry also times out.

`vercel.json` adds `30 21 * * *` on `/api/cron/pacing-portfolio?retry=1`. That flag returns 200 `already built` when today's `(as_of, all, live_only)` row exists. GET `/api/pacing/portfolio` returns the latest earlier same-scope snapshot with 200 and `stale: { asOf, reason }` when today's build fails or is still running. The page shows "Showing 10 Oct. Today's pacing hasn't built yet." above the tiles. No prior row keeps the 500 or the 202. The response sets `Cache-Control: no-store` and is not put in the Next data cache. Region was not changed.

Region: the cron route already exports `preferredRegion = ["syd1"]`, and `vercel.json` has no region. The 11 Oct 21:00 UTC cron still logged iad1; the 21:20 page load logged syd1. Supabase `DATABASE_URL` is the transaction pooler in ap-southeast-2. Snowflake `SNOWFLAKE_ACCOUNT` is a locator with no region suffix, and there is no `SNOWFLAKE_REGION` (production `SNOWFLAKE_MODE` defaults to serverless). Recommend Luke confirm why the syd1 export did not pin that cron (project function region is the likely lever). Do not add a second pin until that is checked. Sydney is still the right region: the database is there.

- Files: `lib/pacing/portfolio/loadPortfolioChannelSources.ts`, `buildCampaignPacingRows.ts`, `portfolioSnapshotStore.ts`, `servePortfolioSnapshot.ts`, `runPortfolioCron.ts`, `db/index.ts`, `app/api/cron/pacing-portfolio/route.ts`, `app/api/pacing/portfolio/route.ts`, `app/pacing/(shell)/portfolio/PortfolioClient.tsx`, `vercel.json`, the three portfolio tests, `docs/brain/modules/pacing.md`, `INVARIANTS.md`, `BLAST-RADIUS.md`, `MAP.md`.
- Checks: `npm run typecheck` exit 0. `npm run lint` exit 0 (existing warnings only). `npm run test:pacing-portfolio` exit 0. Node 28 pass + timeout file 7 pass + vitest 7 pass. No snapshot updates.
- Morning smoke: not opened. After the next 08:00 run, `pacing_portfolio_snapshots` should have today's row. If not, `/pacing/portfolio` should show the previous day with the notice instead of HTTP 500.
- Under 90%: why `preferredRegion` syd1 still ran in iad1 on 11 Oct is about 70% (the export is in the route; the log is the evidence it did not apply). Snowflake's region is not in the config. The notice was not clicked through in a browser.

## AV-SH1 replay — already done, no second commit

The assertion in `lib/mediaplan/__tests__/planWizardSaveBar.test.ts` ("shared component order is Save draft before Publish, with downloads in Files") already uses `onSelect: onPublishMba` then `onSelect: onDownloadMediaPlan`, and still requires the MBA needle to sit after `const fileItems` and before the Media Plan needle. That is commit `1b84c47b`. The other assertions in that test are unchanged. No files staged. Pass count from that commit: `npm run test:postgres-save-mode` exit 0, 273 tests, 253 pass, 0 fail, 20 skipped.

## AV-SHZ DONE

Commit message `docs(runlog): AV SF11 and SH1 wrap-up`. This entry is that commit. No product code.

`npm run gate:main` with `NODE_OPTIONS=--max-old-space-size=8192` exit 0, about 286s. `npm run test:all` once, exit 0, 124/124 suites, about 10.2 min. No `ECONNRESET` or `ENOTFOUND`, so nothing was rerun.

### Prompts

| ID | Status | SHA | Checks |
| --- | --- | --- | --- |
| AV-SF11 | DONE | `02f346f5` | typecheck 0, lint 0 (existing warnings), `test:pacing-portfolio` 28 node + 7 timeout + 7 vitest |
| AV-SH1 | DONE | `1b84c47b` | `test:postgres-save-mode` 273 tests, 253 pass, 0 fail, 20 skipped. A later replay found the pin already on `onSelect` and made no second commit. |
| AV-SHZ | DONE | this commit | gate:main 0, test:all 124/124 |

AV-SF11 region (step 6, not changed): the cron route already exports `preferredRegion = ["syd1"]`, and `vercel.json` has no region. The 11 Oct 21:00 UTC cron still logged iad1; the 21:20 page load logged syd1. Supabase `DATABASE_URL` is the transaction pooler in ap-southeast-2. Snowflake `SNOWFLAKE_ACCOUNT` is a locator with no region suffix, and there is no `SNOWFLAKE_REGION` (production `SNOWFLAKE_MODE` defaults to serverless). Sydney is still the right region because the database is there. Luke should confirm why the syd1 export did not pin that cron before adding another pin.

### Morning smoke

Not opened in this wrap-up.

- AV-SF11: after the next 08:00 run, `pacing_portfolio_snapshots` has today's row. If not, `/pacing/portfolio` shows the previous day with "Showing 10 Oct. Today's pacing hasn't built yet." instead of HTTP 500.
- AV-SH1: none. Test pin only.

### gate:main

| Gate | Result |
| --- | --- |
| typecheck | PASS |
| check:egress-guards | PASS (known FX-1 Xano warning, then ok) |
| lint | PASS (existing warnings only) |
| check:client-server-only | PASS |
| check:drizzle-snapshot | PASS (empty diff) |
| check:hardcoded-urls | PASS |
| check:money-inline | PASS (115 files, 250 hits) |
| build | PASS (compiled with the existing Auth0 warning) |

### test:all

124/124 PASS. `test:postgres-save-mode` passed (about 4.3s). `test:mb15c-published-immutable` passed (about 18s). No `ECONNRESET` or `ENOTFOUND`.

| Suite | Result |
| --- | --- |
| test:billing-line-id-match | PASS |
| test:client-server-only | PASS |
| test:brand | PASS |
| test:status | PASS |
| test:media-families | PASS |
| test:charts-registry | PASS |
| test:format-money | PASS |
| test:planned-to-date | PASS |
| test:client-dashboard-range | PASS |
| test:campaign-read | PASS |
| test:ava-skills | PASS |
| test:campaign-dashboard-range | PASS |
| test:delivery-ui | PASS |
| test:search-delivery-tiles | PASS |
| test:social-delivery | PASS |
| test:programmatic-delivery | PASS |
| test:solver | PASS |
| test:utm | PASS |
| test:weekly-gantt | PASS |
| test:week-starts-on | PASS |
| test:expert-mappings | PASS |
| test:expert-goldens | PASS |
| test:expert-paste | PASS |
| test:expert-grid-selection | PASS |
| test:spreadsheet | PASS |
| test:finance-forecast | PASS |
| test:retained-commission | PASS |
| test:deliverable-budget | PASS |
| test:editor-line-inputs | PASS |
| test:finance-filters | PASS |
| test:finance-derive | PASS |
| test:billing-divergence | PASS |
| test:billing-seed-fees | PASS |
| test:billing-fee-drift | PASS |
| test:kpi-resolve | PASS |
| test:kpi-percent-units | PASS |
| test:kpi-writes | PASS |
| test:money | PASS |
| test:money-golden | PASS |
| test:monthly-plan-calendar | PASS |
| test:kpi-review | PASS |
| test:kpi-backfill | PASS |
| test:pacing-maths | PASS |
| test:pacing-portfolio | PASS |
| test:pacing-channel | PASS |
| test:pacing-detail | PASS |
| test:pacing-scenario | PASS |
| test:pacing-relabel | PASS |
| test:pacing-plan-lines | PASS |
| test:unmapped-placements | PASS |
| test:partner-ingest | PASS |
| test:ava-tools | PASS |
| test:ava-chat-ui | PASS |
| test:ava-autopopulate | PASS |
| test:ava-detect-goldens | PASS |
| test:db-drift | PASS |
| test:forecast-targets | PASS |
| test:write-kpi | PASS |
| test:line-item-snapshot-parity | PASS |
| test:xero | PASS |
| test:finance-periods-flag | PASS |
| test:inline-schedule-amount | PASS |
| test:line-item-attrs | PASS |
| test:shadow-diff | PASS |
| test:mba-plan-detail | PASS |
| test:mba-number-alloc | PASS |
| test:channel-line-item-routes | PASS |
| test:tenant-isolation | PASS |
| test:match-text | PASS |
| test:approvals | PASS |
| test:write-clients | PASS |
| test:write-reference | PASS |
| test:mba-header-date | PASS |
| test:mba-scope | PASS |
| test:mba-media-breakdown | PASS |
| test:derive-approved-slice | PASS |
| test:live-mba-scope | PASS |
| test:mba-live-dates | PASS |
| test:finance-schedule | PASS |
| test:finance-sections | PASS |
| test:approved-slice | PASS |
| test:c1-fullscope-drift | PASS |
| test:save-plan | PASS |
| test:write-billing-overrides | PASS |
| test:write-finance | PASS |
| test:mb13-fee-override-publish | PASS |
| test:mb15c-published-immutable | PASS |
| test:vc2a-published-immutable | PASS |
| test:vc2b-working-draft | PASS |
| test:dirty-controller | PASS |
| test:write-media-plan-masters | PASS |
| test:xano-mirror | PASS |
| test:campaign-documents | PASS |
| test:media-plan-excel | PASS |
| test:campaign-row-actions | PASS |
| test:postgres-save-mode | PASS |
| test:session-expiry | PASS |
| test:plan-drafts | PASS |
| test:codex-flag-auth | PASS |
| test:codex-stage0-guarantees | PASS |
| test:codex-stage1-detail | PASS |
| test:codex-task-detail-ui | PASS |
| test:codex-stage1-scope | PASS |
| test:codex-stage1-templates | PASS |
| test:codex-auth0-roster | PASS |
| test:dashboard-vc15-tip | PASS |
| test:clients-fail-soft | PASS |
| test:m365-site-url | PASS |
| test:m365-graph | PASS |
| test:m365-reconciliation | PASS |
| test:myhours | PASS |
| test:fireflies | PASS |
| test:performance-report-insights | PASS |
| test:insights-library | PASS |
| test:empty-channel-defaults | PASS |
| test:line-item-panels | PASS |
| test:line-item-panel-flights | PASS |
| test:publisher-profiles | PASS |
| test:ingest-propose | PASS |
| test:ingest-review | PASS |
| test:ingest-eval | PASS |
| test:ooh-expert-gate | PASS |
| test:ooh-standard-bench | PASS |
| test:specs | PASS |


## AV-TF1 DONE 177c8ab3

Completed cards no longer copy the campaign budget into expected-to-date when the delivery schedule has no positive media. krusty001-shaped input (approved, empty months, missing expected) is $0 expected, $500,000 campaign budget, 0%. The half-inside clamp (500/500) and the in-range straddle (200/300) are unchanged. The expected tile says "campaign budget" when every booked/approved/completed campaign has an empty month list. Plan committed paints the computed percent on first render. The campaigns count still counts up from 0.

- Files: lib/dashboard/plannedSpendConsistency.ts, lib/dashboard/__tests__/plannedSpendConsistency.test.ts, components/dashboard/ClientDashboardPageContent.tsx, components/dashboard/HeroKPIBar.tsx, components/dashboard/__tests__/clientHeroExpected.test.tsx, vitest.config.ts, docs/brain/INVARIANTS.md, docs/brain/modules/dashboards-charts-exports.md.
- Checks: typecheck 0. lint 0 (existing warnings only, none in these files). test:client-dashboard-range pass (25 + 3 + 25). plannedSpendConsistency 12 pass. clientHeroExpected 5 pass. No snapshots.
- Under 90%: the prompt's "$0 planned" could mean the denominator is also $0. Morning smoke and AV-P4 section 5 both say $0 of $500.0K campaign budget, so the denominator stays the campaign budget. The signed-in page was not opened.
- Morning smoke: /dashboard/krusty-krab: Expected $0 of $500.0K campaign budget. /dashboard/golf-australia: figures unchanged ($159.8K expected on 11 Oct, give or take a day's proration).

## AV-TF2 DONE ab8a9b72

Deliverables data cells on the media plan sheet are left-aligned with indent 1 and number format #,##0, on the standard and AA workbooks. Buying Demo stays left with no indent. Gross Media stays right with $#,##0.00. Production Amount stays right-aligned #,##0. Gantt burst cells and the Campaign KPIs Deliverables column are unchanged.

- Files: lib/generateMediaPlan.ts, lib/docs/__tests__/mediaPlanWorkbook.test.ts, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md.
- Checks: typecheck 0. lint 0 (existing warnings only, none in these files). test:media-plan-excel 23 pass. No snapshots.
- Morning smoke: Draft Media Plan for krusty002: Deliverables reads left-aligned with a gap before Buying Demo. The signed-in export was not opened.

## AV-TF3 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-TF3.md`. No code change. File left untracked. No SHA.

Publish checks buy type only, on `POST /api/plans/save` since 15 Sep 2026 (`missingBuyTypeGate`, 422 `MISSING_BUY_TYPE`). The legacy PATCH stamp does not. Nothing recomputes or rounds `calculatedValue` on save. The named plans were published before the gate (buxton001 11 May, PENFOLD017 26 May, PGAAUS003 25 Jun, krusty001 2 Aug). In the current published window (campaign end on or after 1 Jul 2026): 8 lines fail (a), 607 non-production lines fail (b), 18 lines fail a broad (c). PGAAUS003 has no safe UPDATE until a buy type is chosen.

- Checks: none. Read-only, plus a Postgres read. Temporary query scripts were outside the repo.
- Morning smoke: none.
- Under 90%: strip versus block for empty lines is 75% (the block already exists). DD7 rate rewrite to $9,000 is 70% and left commented. Excluding package from the deliverable warning is 85%. The exact float 208333.33333333334 was not on a current published line in this window; TheY001DD1 has the same class of unrounded value (233333.33333333334). 226 fractional stored deliverables.

## AV-TF4 DONE aca768f0

Client hub canvas is sand (`bg-surface-muted`), matching the campaign page. Cards stay white. The header is `PageHeader`: client name with `ClientMark` beside it, the existing expected-to-date line as the lede, and Change range in actions. Client logins still see "Welcome back, {name}." The admin slide-over rail and profile links stay in that header. Plan committed numbers are ink (`text-foreground`). The bar and ring use pacing tokens for the same bands (above 50 ahead, 25–50 behind, else critical). Sections, figures, and the overdue notice are unchanged.

- Files: components/dashboard/ClientDashboardPageContent.tsx, components/dashboard/ClientDashboardSkeleton.tsx, components/dashboard/HeroBanner.tsx, components/dashboard/__tests__/clientHeroExpected.test.tsx, lib/dashboard/budgetUtilKpi.ts, docs/brain/modules/dashboards-charts-exports.md, docs/brain/BLAST-RADIUS.md.
- Checks: typecheck 0. lint 0 (existing warnings only, none in these files). test:client-dashboard-range pass (25 + 3 + 25). clientHeroExpected 6 pass. plannedSpendConsistency 12 pass (included in the vitest run with the hero file). No snapshots.
- Under 90%: the old bar used raw emerald/amber/rose. Those classes are banned, so the bar is `bg-pacing-ahead` / `bg-pacing-behind` / `bg-pacing-critical` on the same 50/25 bands. 36.7% stays the behind (amber) bar. The signed-in page was not opened.
- Morning smoke: /dashboard/golf-australia: sand canvas, PageHeader, ink numbers, and the same figures as before.

## AV-TF5 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-TF5.md`. No code change. File left untracked. No SHA.

Expected media is every delivery-schedule media channel (fees, production, and ad serving dropped). Delivered is platform facts, plus television, radio, and newspaper only when a line is currently fixed-cost. Static OOH, magazines, cinema, integration, and influencers never enter Delivered. Pick is option (a): platform expected beside a "Booked, no platform delivery" figure. Home copy: "33 with platform delivery" under the live count of 38.

- Checks: none. Read-only of the code. The 11 Oct dollars and the 38/33 split were not re-counted.
- Morning smoke: none.
- Under 90%: how many of the five Home campaigns fail the pacing phase gate, rather than having no source, was not checked. Pick confidence 80%.

## AV-TF6 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-TF6.md`. No code change. File left untracked. No SHA.

Edit drafts are not per tab. IndexedDB key is `m{masterId}::{email}` in `av-plan-drafts` / `drafts`. Create's `sessionStorage` id is not used. A matching-base server or newer local draft auto-applies when `allChannelsHydrated` becomes true. The PO input is already editable. A local-only draft would have asked first. The silent "SMOKE-11OCT" fill was the auto path. Pick: prompt "Restore your draft from {time}?" instead of applying it. Restoring earlier still leaks the other tab.

- Checks: none. Read-only of the code. The 11 Oct browser store was not opened.
- Morning smoke: none.
- Under 90%: which store held the string (IndexedDB vs `plan_working_drafts`) was not read. Append is the focused input taking `form.reset`, not a concat in the draft code. Pick confidence 88%.

## AV-TF7 DISCOVERY (no commit)

Wrote `docs/superpowers/overnight-av-fixes/discovery/AV-TF7.md` and `docs/superpowers/overnight-av-fixes/discovery/AV-TF7-audit.json`. No code change. No install, no `npm audit fix`. Files left untracked. No SHA.

GitHub's 41 open alerts (17 high, 18 moderate, 6 low) are the same packages as `npm audit` on this lockfile. npm's metadata says 36 because it collapses version lines and counts parent nodes. Safe follow-up is patch/minor only: next 15.5.27 (with eslint-config-next), and overrides for sharp 0.35.5, undici 6.28.1, brace-expansion 1.1.21 / 2.1.7 / 5.0.12, dompurify 3.4.16, plus moment 2.31.0 and source-map-js 1.2.2. undici 7.29.1 and smol-toml 1.9.0 are dev-only and can ride along. Majors held back: nodemailer 10, snowflake 3 (which also drops toml 3), uuid 11, image-size 2, braces (no 3.x fix), postcss-selector-parser 7, esbuild under drizzle-kit, sprintf-js (no release).

- Checks: none. `npm audit` exited 1, which is the vulnerability result, not a failed run. `npm view` was read-only.
- Morning smoke: none.
- Under 90%: whether the two next cache-poisoning advisories apply on Vercel is about 70% (both texts say self-hosted SSG/ISR). nodemailer 10, snowflake 3, uuid 11, and image-size 2 were not installed. braces and postcss-selector-parser not running on a request is about 90% from the lockfile trace.

## AV-TF8 DONE d86f8e4a

Spend by month Y-axis ticks use one compact scale: $0, $500K, $1M, $1.5M, $2M. Trailing zeros are dropped and a decimal appears only when the tick needs it ($1.5M). The Media Spend tile still uses `millionScale: "home-spend"`. The chart tooltip is exact `formatMoney` (`$1,500,000.00`).

- Files: lib/format/money.ts, components/dashboard/HomeBrief.tsx, tests/format/money-date.test.ts, docs/brain/modules/dashboards-charts-exports.md, docs/brain/modules/shared-core.md.
- SHA: d86f8e4a06b511cf0242010fe4b2218445767478
- Checks: typecheck 0. lint 0 (existing warnings only, none in these files). homeBrief  pass and money-date pass (22 tests across both files). No snapshots.
- Morning smoke: Home Spend by month axis reads $0, $500K, $1M, $1.5M, $2M. Hover still shows full dollars. The signed-in page was not opened.
- Under 90%: none on the formatter. Recharts chooses the tick numbers from the data; the five values in the test are the ones the prompt named.

## AV-TFZ DONE

`npm run gate:main` with `NODE_OPTIONS=--max-old-space-size=8192` exit 0, about 248s. `npm run test:all` once, exit 0, 124/124 suites, about 543s. No suite was rerun.

### Prompts

| ID | Status | SHA |
| --- | --- | --- |
| AV-TF1 | DONE | `177c8ab3` |
| AV-TF2 | DONE | `ab8a9b72` |
| AV-TF3 | DISCOVERY | none |
| AV-TF4 | DONE | `aca768f0` |
| AV-TF5 | DISCOVERY | none |
| AV-TF6 | DISCOVERY | none |
| AV-TF7 | DISCOVERY | none |
| AV-TF8 | DONE | `d86f8e4a` |
| AV-TFZ | DONE | this commit |

### Discovery files

- `docs/superpowers/overnight-av-fixes/discovery/AV-TF3.md` — publish checks buy type only. Current window: 8 lines with no buy type, 607 empty non-production shells, 18 unrounded deliverable warnings. UPDATE text is in the note. Not run.
- `docs/superpowers/overnight-av-fixes/discovery/AV-TF5.md` — expected counts every media channel; Delivered is platform plus TV/radio/newspaper only when fixed-cost. Pick is platform expected beside "Booked, no platform delivery". Confidence 80%.
- `docs/superpowers/overnight-av-fixes/discovery/AV-TF6.md` — edit drafts share `m{masterId}::{email}`. A matching-base draft auto-applies after containers settle. Pick is "Restore your draft from {time}?". Confidence 88%.
- `docs/superpowers/overnight-av-fixes/discovery/AV-TF7.md` — GitHub's 41 alerts match this lockfile. Safe follow-up is patch/minor (next 15.5.27, sharp, undici 6, brace-expansion, dompurify, moment, source-map-js). Majors held back.
- `docs/superpowers/overnight-av-fixes/discovery/AV-TF7-audit.json` — `npm audit --json` for that note. No fix was applied.

### Morning smoke

None of these were opened in the browser.

- AV-TF1: `/dashboard/krusty-krab` Expected $0 of $500.0K campaign budget. `/dashboard/golf-australia` figures unchanged.
- AV-TF2: Draft Media Plan for krusty002. Deliverables left-aligned, gap before Buying Demo.
- AV-TF3, AV-TF5, AV-TF6, AV-TF7: nothing to click.
- AV-TF4: `/dashboard/golf-australia` sand canvas, PageHeader, ink numbers, same figures.
- AV-TF8: Home Spend by month reads $0, $500K, $1M, $1.5M, $2M. Hover is full dollars.

## Strip empty lines on publish STOPPED

No commit. No product files changed. The editor does not reload channel rows after a successful `POST /api/plans/save`, so stripping on the server would leave the removed lines in the form. The next save builds `lineItems` from those in-memory snapshots and would send the empty rows again.

Postgres success (`handleSaveAll` in `app/mediaplans/mba/[mba_number]/edit/page.tsx`, around the `postPlansSave` 2xx branch) updates version ids, the billing snapshot, and KPI sync, then `afterSuccessfulSave` toasts, clears dirty, and may download. It does not call the channel setters. Line items load only while `loadPhase === "loadingLineItems"`, which is the bootstrap effect, not the save effect. `useStableHydration` resets a container only when its `initialLineItems` reference changes. Save does not replace that array. The next payload is `buildSavePlanLineItemsFromSnapshots` of `*MediaLineItemsForSave`, which the containers publish from the live form. Create's postgres success path is the same shape.

A full reload is not the same as that in-session path. Bootstrap fetches `/api/mediaplans/mba/{mba}?skipLineItems=true` and, when the URL has `?version=`, that query wins. Save does not rewrite the query. A reload with no `?version=` follows the published pointer, so the new version's stripped rows would show. A reload that keeps `?version=` of the version that was open still shows that older row, empty lines included.

`checkPublishLineItemIntegrity` does not fail a publish because one enabled channel has zero rows. It sums children across every enabled channel and returns 409 only when that sum is 0. Query errors fail open. The function runs on `PATCH /api/mediaplans/mba/[mba_number]`, not on `POST /api/plans/save`. `savePlanVersion` has a separate gate: `BOSS006_EMPTY_PUBLISH` aborts `publish` and `new_version` when the version has zero `line_items`. A strip that keeps one real line would pass both. A strip that removes every line would roll back on BOSS006.

The save body does match the described burst shape on the editor path. `plansSaveBodySchema` types `bursts` as `z.unknown()`. `buildSavePlanLineItemsFromSnapshots` sends `resolveLineItemBursts`, an array. Each form burst has `budget`, `buyAmount`, and `calculatedValue` (`serializeBurstsJson` / container hydration).

Proposed option: on `removedIds`, give each container a new `initialLineItems` array with those ids removed. `useStableHydration` will reset the form from that reference, and the next save will not resend them. Do this on create and edit. Do not refetch via `loadPhase` unless the loader is pointed at the new version number, because `?version=` would otherwise reload the pre-strip row.

- Checks: none (stopped before the helper).
- Morning smoke: not run. krusty002 was not opened.
- Confidence the editor does not reload after save: 94%.

## Round deliverables on save DONE 4c913162 / f29c38d5

Two commits on `localhost`. `lib/partner-ingest` was not staged.

`normaliseBurstDeliverables` rounds the `calculatedValue` the editor sent, on every save mode, before the gates. It does not recompute from budget and rate. Buy types in `BUY_TYPES_WITH_DERIVED_DELIVERABLES` are rounded, except `package`, `bonus`, and `package_inclusions`. The `fixed_cost` rule lives in that helper, not in `roundDeliverables` and not in `deliverablesFromBudget`: a burst budget above 0 stores 1, including a zero rate. A zero budget keeps the stored quantity, because `roundDeliverables("fixed_cost", …)` always returns 1 and would stamp an empty shell. `deliverablesFromBudget` still returns 0 for a zero rate before its `fixed_cost` case. Excel explode rounds a finite recomputed quantity with `roundDeliverables`. The television sheet still reads `burst.tarps`.

Publish returns `deliverableWarnings` when a rounded derived line has any burst budget above 0 and `calculatedValue` 0. The save still commits. Create and edit toast each line: `{id} ({buy type}) has a budget and no deliverables. Check the rate. Publishing will continue.` AV-TG1 was never built, so this uses the existing save toast.

Hard stops did not fire. Pacing, modelled spend, KPI grouping, and AVA read burst `calculatedValue`. Television also writes the same derived quantity onto `burst.tarps`; that field is a quantity, and this change does not round it. Production Excel uses cost times amount. No workbook snapshot pinned a fractional deliverable. Existing media plan workbook tests passed without snapshot edits.

- Files: lib/mediaplan/deliverableBudget.ts, lib/docs/explodeExcelLineItems.ts, app/api/plans/save/route.ts, lib/mediaplan/buildPostgresSavePayload.ts, app/mediaplans/create/page.tsx, app/mediaplans/mba/[mba_number]/edit/page.tsx, tests, docs/brain/INVARIANTS.md, docs/brain/modules/media-plans.md, docs/brain/BLAST-RADIUS.md, package.json.
- SHA: 4c913162f78ea712585e4c4385e9ca34f228d2e2 then f29c38d5316cbc21d24c5b37b66444d6d26c5632
- Checks: typecheck 0. lint 0 on the touched files (existing hook warnings on the twin pages, none from this change). test:deliverable-budget pass. test:media-plan-excel pass. roundDeliverables route tests pass (publish rounds 10.6 to 11, draft rounds, cpm at rate 0 with a budget publishes and returns one warning).
- Morning smoke: not run. krusty002 was not opened. On a digital display CPM line, save a budget that produces a fractional quantity, reload, and confirm a whole number. Export the media plan and confirm the same number. A rate of 0 with a budget should toast and still publish.
- Under 90%: none.

## Ask before restoring an edit draft STOPPED

No commit. No product files changed.

Discard of a matching-base edit draft deletes the draft the other tab is still writing. Edit drafts are one IndexedDB key `m{masterId}::{userId}` (`localStore.ts`) and one `plan_working_drafts` row, `UNIQUE(master_id, user_id)`. `discard` in `hooks/usePlanDraftSession.ts` clears that key and `DELETE /api/plans/drafts?masterId=` which runs `deleteWorkingDraft` for the caller's user id only. The DELETE has no `updated_at` check and no tab id. Presence is informational and excludes the signed-in user (`filterFreshPlanPresence`), and the presence module says it is never a lock.

Race: tab A is dirty on krusty002. Local save is about 3s after an edit; the server PUT is about 15s, or immediately on window blur. Tab C of the same user loads that same row and clicks "Keep the saved plan". That DELETE removes the row. Tab A's blur PUT, or its next 15s PUT, upserts the PO draft back with no generation check, so the discard does not stick while tab A is still editing. A local record tab A wrote and has not PUT yet is cleared by the same `clearLocalDraft` call. Another user's row is not deleted.

Create also relies on the `"auto"` result, so the classifier cannot change for everyone. `usePlanDraftSession` is the only caller of `classifyDraftLoad` outside tests, and Create (`app/mediaplans/create/page.tsx`, `masterId` null) and Edit both use it. The load effect auto-applies whenever the kind is `"auto"` and the offer is not `local_only`. Create is never `local_only` (`isOrphanLocalDraft` is false when `masterId` is null). The test "create page: opening one draft id restores that snapshot and not another client's shared MBA key" expects `loadKind` `"auto"` and a restore with no click. No copy flow calls the hook.

- Checks: none (stopped before the offer).
- Morning smoke: not run. krusty002 was not opened.
- Confidence the shared row is deleted by the existing discard: 96%.

## Split hub expected into platform and booked STOPPED

No commit. No product files changed. The month rows the expected tile clamps have already lost the channel label.

`normalizeDeliveryEntryMediaBreakdown` (`lib/api/dashboard/shared.ts`) still returns a label per media type (`MEDIA_TYPE_LABELS` for the costs shape, the schedule's own media type for the types shape). `getClientDashboardData` (`lib/api/dashboard/client.ts`, the booked/approved/completed loop around the `deliveryMonthlyCampaignMap` write) adds every label's amount into one number per campaign per month. `monthlySpendByCampaign` is then `{ month, data: [{ campaignName, amount }] }` (`lib/types/dashboard.ts`). The hub (`ClientDashboardPageContent`) maps that through `campaignMonthsFromStacked` onto `{ yearMonth, amount }` and `computePlannedSpendTotals` clamps those amounts. No label remains. Schedules were not re-fetched.

`monthlySpend` on the same payload still has `mediaType` per month (`deliveryMonthlyMap`). The expected tile does not clamp that series. Admin `/client/[slug]` and the client role `/dashboard/[slug]` both render `ClientDashboardPageContent`, so they share the hero. That was not the stop.

Fixed-cost television, radio, and newspaper were not counted on Golf Australia or Krusty Krab. The label drop stops the change before that decision.

- Checks: none.
- Morning smoke: not run. `/dashboard/golf-australia` was not opened.
- Confidence the campaign month amount has no channel: 96%.

## Show live campaigns with platform delivery DONE f549d3f7

One commit on `localhost`. `lib/partner-ingest` was not staged.

Home's Live campaigns tile keeps the booked/approved/completed flight count as the headline. Beside "start in the next 14 days" it shows `{counts.live} with platform delivery` from the portfolio response Home already loads. The line is hidden when that fetch fails, the body is `building`, the snapshot is `stale`, or `counts.live` is missing, not finite, or not above 0. Zero is not shown. No second fetch.

Hard stop did not fire. Home calls `GET /api/pacing/portfolio` with no query. The route defaults `liveOnly` to true and `asOf` to `getAsOfDate()`. `scope_key` is `pacingScopeKey` of the caller on both Home and the pacing page. The pacing page's default request is `?asOfDate=<getAsOfDate()>&liveOnly=true`, and with empty client-side filters its displayed live count is `rows.length`, which is `body.counts.live`.

- Files: components/dashboard/DashboardOverview.tsx, components/dashboard/HomeStatTile.tsx, lib/dashboard/homeBrief.ts, components/dashboard/__tests__/HomeStatTile.platformDelivery.test.tsx, vitest.config.ts, docs/brain/modules/dashboards-charts-exports.md.
- SHA: f549d3f7
- Checks: typecheck 0. lint 0 on the touched files. vitest HomeStatTile.platformDelivery 2 pass (line shows for counts.live 33; hidden when absent, 0, or stale).
- Morning smoke: not run. Home was not opened. The Live campaigns tile should still read 38, with "33 with platform delivery" beside the 14-day line when the portfolio snapshot is current.
- Under 90%: none.

## Patch dependency alerts DONE af8bc87b

One commit on `localhost`. `lib/partner-ingest` was not staged. `npm audit fix` was not run.

AV-TF7 and the prompt name the same versions. The note also allows `smol-toml` `1.9.1`; the prompt pins `1.9.0`, which the note lists first, so that is what landed. No other version disagreed.

`moment` `2.31.0` and `source-map-js` `1.2.2` are new overrides. They were transitive with no pin, so the lockfile would not have moved without one. Left untouched: nodemailer, snowflake-sdk, uuid, image-size, Tailwind, postcss-selector-parser, drizzle-kit, mammoth.

`npm install` changed 17 packages. No major version moved. The only extra movement is `@img/sharp-libvips-*` `1.3.3` → `1.3.4`, which ships with `sharp` `0.35.5`. No peer dependency error.

Audit before (AV-TF7-audit.json): 36 (20 high, 14 moderate, 2 low). After (`AV-TG6-audit.json`, uncommitted): 22 (11 high, 11 moderate, 0 low).

Production build used `NODE_OPTIONS=--max-old-space-size=6144`. Next.js 15.5.27 finished in 140s and printed the route table (137 static pages). Largest sampled node working set was about 5,290 MB. The cap was not raised. No earlier build time was recorded in this session.

- Files: package.json, package-lock.json. Audit JSON is uncommitted.
- SHA: af8bc87b
- Checks: typecheck 0. lint 0 (existing hook warnings only). test:media-plan-excel 24 pass. Campaign report deck tests 10 pass (server-only shim). jsPDF path: test:mba-scope 8, test:mba-header-date 13, test:mba-live-dates 21, brandPdf 1, all pass.
- Morning smoke: not run.
- Under 90%: none.

## AV-TGZ DONE

`npm run gate:main` with no `NODE_OPTIONS` exit 0, 90.3s. `npm run test:all` once, exit 0, 124/124 suites, 513.8s. No suite was rerun. `lib/partner-ingest` was not staged.

### Prompts

| ID | Status | SHA |
| --- | --- | --- |
| AV-TG0 | DISCOVERY | none |
| Strip empty lines on publish | STOPPED | none |
| Round deliverables on save | DONE | `4c913162` then `f29c38d5` |
| Ask before restoring an edit draft | STOPPED | none |
| Split hub expected into platform and booked | STOPPED | none |
| Show live campaigns with platform delivery | DONE | `f549d3f7` |
| Patch dependency alerts | DONE | `af8bc87b` |
| AV-TGZ | DONE | this commit |

## Inverted quartiles warn instead of failing the file DONE 79adc5cc

One commit on `localhost`. The working-tree diff was still the five `lib/partner-ingest` files, +151 / −30, matching AV-TG0.

`npm run test:partner-ingest` passed 69, failed 0.

`ERROR_TEXT` is written by `ingestLogBinds` and defined on `PARTNER_FILE_INGEST_LOG`. No app route, partner inbox UI, or `sql/snowflake` query reads it back. The duplicate check selects `STATUS = 'loaded'` and ignores `ERROR_TEXT`, so a warning row still counts as loaded. `summary.failed` and the cron's 207 still follow the load gate, which is T1, T5, T6, a parse throw, an unknown `LOAD_MODE`, or zero data rows. `VW_PACING_PARTNER_FILE` reads `PARTNER_DELIVERY_DAILY`, not the log. Other `errorText` names in the app are HTTP response bodies.

- SHA: 79adc5cc82c99c519c602832d52bc1351c0e48f9
- Checks: test:partner-ingest 69 pass, 0 fail.
- Morning smoke: not run.
- Under 90%: none.

## Strip empty lines on publish STOPPED

No commit. No product files changed. A line added while the save is in flight can be given the same id as an empty line the response is about to remove.

Add and duplicate build the id from `lineItemFields.length + 1` (`buildLineItemId`). That is positional. `assignStableLineItemNumbers`, which runs on the save snapshot, keeps an existing number and never fills a gap. After a delete, a later line can sit above a hole. `length + 1` then lands on that later line's number.

Example: digital display holds a real line numbered 1 and an empty line numbered 3. Save starts. The empty line's id is in the payload and will come back on `removedIds`. During the request the user adds a line. The form length is 2, so the new line is numbered 3, the same id as the empty line. Filtering `removedIds` drops both. The new line is gone and the notice still says an empty line was removed.

The save payload itself is not a third store. Each container publishes the form through `onMediaLineItemsChange` into `*MediaLineItems`, and `useStableHydration` would reset that form when `initialLineItems` changes. That part can be wired. The id collision stops it first.

- Checks: none.
- Morning smoke: not run. krusty002 was not opened.
- Confidence the add path reuses a gapped number: 94%.

## Ask before restoring an edit draft DONE 312baf96

One commit on `localhost`. Create is unchanged. `masterId` is not the Create/Edit signal, because the create page sets it after the first save. Only the edit page passes `page: "edit"`. `classifyDraftLoad` is still pure.

Edit, matching base: the banner is "Restore your draft from {time}?" with Restore and Keep the saved plan. `{time}` is `Date#toLocaleString`, the same label as the orphan offer. Restore goes through `clickResume` and `flushWhenHydrationSettled`. Keep the saved plan clears the offer for this page load. It does not call `discard`, clear IndexedDB, or `DELETE /api/plans/drafts`. Until the next `subscribeDirty` (or the dirty flag flipping true after Keep), local writes and draft PUTs no-op, including blur.

Changed tests, and why:
- "auto-applies when base === tip after hydration, without a Resume click" is now "edit matching base offers and does not apply until Restore". Edit no longer applies a matching base on its own.
- "Discard after auto-apply reverts to the captured tip and deletes the server row" now clicks Restore first. Discard-after-restore still deletes; the old setup assumed the auto-apply that Edit no longer does.
- "deleted line: empty search array is in the auto-applied state" now clicks Restore before reading the applied channels. The empty array is still the deleted-line signal, and it arrives only after Restore.

Create tests were not edited. The create matching-base test still auto-restores. The orphan Apply/Discard test is unchanged.

- SHA: 312baf96d1cef6a123158c3673423ee8a4ffa9a9
- Checks: vitest usePlanDraftSession 16 pass, PlanWizardSaveMessages pass (matching banner included), drafts.test.ts 15 pass / 6 skip, typecheck 0, lint 0. Pre-existing hook `args` exhaustive-deps warnings and edit-page hook warnings remain.
- Morning smoke: not run. Nothing is listening on localhost:3000, so krusty002 Edit was not opened.

## Split expected into platform and booked DONE 0414c1c7

One commit on `localhost`. `lib/partner-ingest` was not staged. The run log stays uncommitted.

Hard stops did not fire.

Fixed-cost television, radio, and newspaper are not in Delivered for Golf Australia or Krusty Krab. The direct leg only loads snapshot rows with `FIXED_COST_MEDIA = TRUE`. Every version of those two clients has that flag false on television, radio, and newspaper, including golf025's `fixed_cost` buy-type lines (the flag is still false). Krusty Krab's published tips have no television, radio, or newspaper with the flag on.

`monthlySpendByCampaign` is built inside `getClientDashboardData` on the request. It is not wrapped in `unstable_cache`, and it is not written to a snapshot table, Blob, or KV. `exportDashboardData` JSON is the live payload. CSV does not include the series.

Other readers keep using `amount`. `SpendingInsightsSection` `toCampaignStacked` maps `campaignName` and `amount` only. The new field is optional.

`isPlatformMediaType` is the `collectChannelPlans` channel keys mapped once through `MEDIA_TYPE_LABELS`. Programmatic BVOD and Programmatic Audio are schedule labels and are not in that snapshot, so they stay booked. `amount` is still the full month. `platformAmount` rides beside it. `computePlannedSpendTotals` clamps that field with the same to-date window as `amount`. The headline is the platform figure. The tile adds "Booked, no platform delivery" for the remainder. A payload with no `platformAmount` keeps today's single figure and hides that line. Plan committed and the plan budget line stay on the full expected. Delivered is unchanged.

- SHA: 0414c1c783f5c5b17612b52df156f094d0192a9b
- Checks: typecheck 0. lint 0 on the touched files. test:client-dashboard-range pass (tsx 28, delivered range 3, vitest 34). Mapping, search/radio split, half-elapsed platform clamp, and the hero booked line are in that run.
- Morning smoke: not run. Nothing is listening on localhost:3000. On `/dashboard/golf-australia`, platform expected plus booked should be about $159.8K for the same range, and Delivered should stay about $59.2K. `/dashboard/krusty-krab` should show $0 with no errors.
- Under 90%: none.

## AV-THZ DONE

`npm run gate:main` exit 0, 124.4s. `npm run test:all` once, exit 0, 124/124 suites, 594.7s. No suite was rerun. Only this run log was staged.

### Prompts

| ID | Status | SHA |
| --- | --- | --- |
| Inverted quartiles warn instead of failing the file | DONE | `79adc5cc` |
| Strip empty lines on publish | STOPPED | none |
| Ask before restoring an edit draft | DONE | `312baf96` |
| Split expected into platform and booked | DONE | `0414c1c7` |
| AV-THZ | DONE | this commit |

## New line number from the max, then strip empty lines on publish

Two commits on `localhost`. `lib/partner-ingest` was not staged. The wrap-up commit below stages this section.

### Commit 1 — next line number from the max

`assignStableLineItemNumbers` was not changed. Add and duplicate now call `nextLineNumber` (highest `parseLineNumberFromLineItemId` suffix already in use, plus one). Existing lines are not renumbered.

Sites that mint on add or duplicate, now `nextLineFields`:

- `useMediaChannelContainer.handleDuplicateLineItem`
- `MediaChannelContainer.emptyPayload` (empty-state add and the last-row Add). Search and the Prog* containers go through this.
- Radio, Television, Newspaper, Cinema, Magazines add and duplicate
- OOH duplicate (still runs `assignStableLineItemNumbers` after the append)
- Digital Display, Digital Audio, BVOD, Digital Video, Social add and duplicate
- Integration and Influencers add and duplicate (they used to clear the id and wait for save)
- Production add and duplicate (no longer stamps a blank `lineItemId`)

Excel `onLineItemsChange` paths still use `lineItemIndex + 1` (Radio, Digital Audio, BVOD, Digital Video, Social, Integration, and the shared hook). Those lists are the export rows, not the save payload.

Card titles use `resolvedLineItemId` so the stamped id is what shows. The ExpertCard index circle is still the row position.

The radio container test does not mount `RadioContainer`. A full jsdom mount never quiesces. The test is a field-array harness that calls `nextLineFields` the same way the Add button does, plus a source read that the container calls `nextLineFields(` and not `lineItemFields.length + 1`.

No container builds the save payload from a ref or a store outside the form and `initialLineItems`. No container mints a uuid. No existing test pins `length + 1` as the line number.

- SHA: f1258793
- Checks: `nextLineNumber` tests pass. `radioAddAfterDelete` 2/2. typecheck 0. lint 0, with the pre-existing exhaustive-deps warnings.
- Morning smoke: not run in that commit. See below.

### Commit 2 — strip empty lines on publish

`stripEmptyLineItems` drops a line only when the buy type is blank and every burst budget, buy amount, and calculated value is 0 or blank (`$1,000.00`, `$0.00`, blank, null, and numbers through `parseMoneyInput`). Production uses the burst test only and stays exempt from the buy-type clause (C-91). If every line is empty, nothing is stripped.

`POST /api/plans/save` runs `stripEmptyLinesOnPublish` after `normaliseSaveLineDeliverables` and before `missingBuyTypeGateResult`, and only `mode === "publish"` strips. `removedIds` is on the 200 next to `deliverableWarnings`.

Create and edit drop a returned id only while that line is still empty. Only a channel that lost a line gets a new array. Create passes that array as `initialLineItems` (`emptyLineResume`); edit writes the fetch-state array the container already receives. An emptied channel is marked so the first `[]` hydrates. The toast is the count actually removed: `Removed {n} empty lines with no buy type, budget, or rate.`

- SHA: cce10f75a4d8e26bf230af4879240f8315e1c392
- Checks: `stripEmptyLineItems` tests 11/11. typecheck 0. lint 0 on the touched files. Pre-existing exhaustive-deps warnings on create and edit remain.
- Morning smoke: not run. Nothing is listening on localhost:3000, so krusty002 was not opened. The checks still to do there: delete line 2 of 3 and add (the line id should be 4), add one blank line and save (the notice), save again without reloading (no 422), reload (the blank line is gone).
- Under 90%: none.

## AV-TIZ DONE

`npm run gate:main` exit 0, 448.0s. `npm run test:all` once, exit 0, 124/124 suites, 694.5s. No suite was rerun. Only this run log was staged.

### Prompts

| ID | Status | SHA |
| --- | --- | --- |
| New line number from the max | DONE | `f1258793` |
| Strip empty lines on publish | DONE | `cce10f75` |
| AV-TIZ | DONE | this commit |

## AV-TK1

Part A is `docs/superpowers/overnight-av-fixes/discovery/AV-TK1.md`. The app does not set `statement_timeout`. The live pooler session is 2 minutes from the configuration file. The six `PARSE` cancels at 21:24:03 are that cap on `fetchLineItemsFromPostgres` (`readChannelLineItems`), not a statement that started at session start 21:18:08. Direct and the versions source do not issue that select. No write path holds a transaction across network I/O, so the fail-fast was built.

Portfolio masters, versions, and line-item reads each run in a short transaction with `SET LOCAL lock_timeout = '5s'` and `statement_timeout = '15s'`. `55P03` and `57014` retry once inside the existing 90s source cap. The cron logs `pacing_portfolio_pg_timeout` with source, code, and elapsed ms. Snowflake SQL and the 90s deadline are unchanged. `readPlanMasters` stays uncapped unless the caller passes `readLimits`.

- SHA: a7678c72
- Checks: `portfolioSourceTimeout` 8/8, including the lock_timeout retry. typecheck 0. lint 0 on the touched files.
- Morning smoke: not run. This is a server read path. Nothing was opened in the browser.
- Under 90%: the lock holder on 11 Oct is still unnamed. Next `55P03` or `57014` needs `pg_blocking_pids` plus `pg_locks` / `pg_stat_activity` (`query_start`, not only session start). Confidence on the 2-minute setting and the query identity is 95%. Confidence the six statements began about 21:22:03 is 90%.

## Second publish in the same tab

`tipVersionIdAtLoadRef` is read only when the edit page builds a save body (`handleSaveAll` and the draft-documents body). Draft restore uses `planDraft` / `restoreDraftFormValues`, not this ref, so advancing it after publish does not change the TH2 offer. Create has no ref and still sends `tipVersionIdAtLoad: null`.

On a successful publish (`mode === "publish"` and `published`), the edit page sets the ref through `tipVersionIdAfterSave` to the returned version id, beside `setPublishedVersionId`. Draft and `new_version` do not write it.

- SHA: fd2298a9
- Checks: `drafts.test.ts` 16 pass, 6 skipped (the new case is in the pass count). typecheck 0. lint 0 new findings. The edit page still has the pre-existing exhaustive-deps warnings.
- Morning smoke: not run. Nothing accepted a connection on localhost:3000, and no browser session was logged in. krusty002 was not published.
- Under 90%: none.

## Portfolio cron region and composer cache

Two commits on `localhost`. This section is uncommitted.

### Commit 1 — syd1

`vercel.json` `functions` sets `app/api/cron/pacing-portfolio/route.ts` to `"regions": ["syd1"]`. The `crons` array is unchanged, so both `0 21 * * *` and `30 21 * * *` (`?retry=1`) use that route. Project-level `regions` was not set. `export const preferredRegion = ["syd1"]` is still on the route. It has no effect on Node routes.

`next.config.mjs` has no `regions` or `functions` entry, and the route's `maxDuration` 300 stays on the export. The new key sets only `regions`, so it does not override duration. No conflict.

Doc relied on, from [Configuring regions](https://vercel.com/docs/functions/configuring-functions/region) and the [vercel.json functions schema](https://vercel.com/docs/project-configuration/vercel-json#functions):

> You can override regions for individual functions using the `functions` property in your project configuration.

> `regions` (optional): An array of region identifiers specifying where this specific function should be deployed. This overrides the project-level `regions` setting for the matched functions.

The schema marks `includeFiles` and `excludeFiles` as not supported in Next.js. `regions` is not in that exclusion. An older "Valid Next.js Function Pattern" note says only `memory` and `maxDuration` can be configured within `functions`; the current schema lists `regions` as a first-class optional property, and that is what this commit follows.

- SHA: a83fba1d
- Under 90%: none for the config itself. Whether the next deploy actually places the invocation in syd1 is the after-deploy check below.

### Commit 2 — skip the composer cache on the cron

The cron handler passes `{ cache: false }` into `buildAndStorePortfolioSnapshot`. Both attempts of each composer call `fetch*`. User GET and admin inline rebuild leave the flag unset, so the first attempt still uses the 4h `unstable_cache` wrappers. The retry schedule hits the same handler, so it does not sniff the URL.

Shared callers of `getCached*`: the five channel routes, overview, AVA `getPacingSnapshot`, `getDeliveredTotalsForClient`, and the pacing digest. A miss runs the composer. The digest prefers the same-day admin snapshot and only falls through to those wrappers when that snapshot is missing. The direct cache write already fails every run (4,018,521 bytes, over 2 MB), so nothing depends on the cron having stored that entry. None of these require the cron to warm the cache, so commit 2 was not stopped.

- SHA: d98dc41a
- Checks: `portfolioSourceTimeout` 10/10. The new cases: default build hits the five cache wrappers and not `fetch*`; `cache: false` is the reverse; the cron source passes `cache: false` and the user `buildArgs` does not. typecheck 0. lint 0 on the touched files.
- After deploy (not run): the next 21:00 UTC cron log should show `region=syd1` and no "items over 2MB" warning.
- Under 90%: none. Confidence the listed callers do not depend on a cron warm is about 92%, because a cold cache still fetches.

## Published tip live count, then AU draft clock

Two commits on `localhost`. This section is uncommitted.

### Commit 1 — expectedLive

`liveCampaignIdsFromVersions` now counts an MBA only when `is_published_tip` is true and that version passes `isLiveCampaignStatus`. The versions read sets the flag from `media_plan_masters.published_version_id`. An older approved or booked version no longer counts. The warning event and fields are unchanged. After the next unscoped build, `missingCampaignIds` should be the plans with no platform source: hartm016, qatar003, myhab001 (radio only), and noelj001 (ChatGPT social). That list was not replayed against Postgres in this commit.

Composers still gate on the master row's status and dates. For the three cancelled plans in AV-TJ1 the master matches the published tip, so the tip version's own status is the same rule.

- SHA: 5f61637d
- Checks: `portfolioSourceTimeout` includes the cancelled-tip case and the existing warning still upserts. `mapPlanVersionFromPostgres` keeps `is_published_tip`. Both files pass (17/17 together). typecheck 0. lint 0 on the touched files.
- Under 90%: none.

### Commit 2 — draft prompt date

`formatDateShort` is date-only (`1 Apr 2026`), so the restore prompt and the orphan offer use `formatDraftOfferTimestamp`: `toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })` with day, month, year, hour, and minute. `2026-10-11T22:01:00.000Z` formats as day/month `12/10/2026` and `9:01 am`.

Locale-less `toLocaleString` / `toLocaleDateString` in `components/mediaplan` and `app/mediaplans`: none. Left unchanged, and not those two APIs: `toLocaleTimeString()` with no locale on the "Draft saved" toast — `app/mediaplans/create/page.tsx` (one call) and `app/mediaplans/mba/[mba_number]/edit/page.tsx` (two calls).

- SHA: a5bacb15
- Checks: `drafts.test.ts` 17 pass, 6 skipped. The new case is in the pass count. typecheck 0. lint 0 on the touched files.
- Under 90%: none.

## One On track rule, 90 to 110

Two commits on `localhost`. This section is uncommitted. SQL was not run.

### Commit 1 — one source of truth

`PACING_STATUS_THRESHOLDS` in `lib/pacing/status.ts`: behind below 90, on track 90–110 inclusive, ahead above 110 and below 115, over-pacing at 115, KPI tolerance 0.1, chart band ±0.10. `computeStatus` reads those edges as projection variance (−0.10 / +0.10 / +0.15) and keeps the Snowflake CASE order. `statusFromExpectedPct` returns Over-pacing at 115. `deliveryStatusFromPct` maps 115 and above to Ahead.

Callers that cannot render Over-pacing, so the helper stays Ahead:

- `components/dashboard/delivery/shared/statusColours.ts` (progress cards, status pills, KPI tiles, search / social / programmatic / direct-digital adapters). Behind is labelled Off pace. There is no Over-pacing colour.
- Report deck `paceColour` in `lib/reports/campaignReport/buildCampaignReportDeck.ts`. Ahead is coral. Every other band is ink, so a new status would look On track.
- `evaluateOnTrack` (`lib/kpi/deliveryTargetCurve.ts`). The chart band is inside ±10% = on-track, outside = behind or ahead. No Over-pacing label.
- `CampaignStatusStrip` has an Over-pacing pill, but it calls `deliveryStatusFromPct`, so 115 and above still reads Ahead of plan.

Callers that do show Over-pacing, from the same table: portfolio `isOverPacing`, line cards `isLineOverPacing`, `computeStatus` / overview, AVA nudge. The old extra gate (projected finish strictly above 115% of budget, and spend percent strictly above 110) is gone. Over-pacing is now 115% of expected and above.

- SHA: cf71ce35
- Checks: status, delivery helper, band table, AVA nudge, overview map, KPI pacing, line cards, portfolio fixtures (67 node tests), vitest `statusUi` + `PacingStatusSummary` (6). typecheck 0. lint 0 on the touched files. No browser. Morning smoke was not run.

Tests changed, and why:

- `lib/pacing/__tests__/statusBands.test.ts` — new table: 89.9 behind, 90 on track, 110 on track, 110.1 ahead, 114.9 ahead, 115 over-pacing, on `statusFromExpectedPct`.
- `lib/pacing/__tests__/deliveryStatusFromPct.test.ts` — 114.9 and 115 stay Ahead in this helper, because its callers have no Over-pacing colour.
- `lib/pacing/maths/__tests__/status.test.ts` — ±0.10 is on track (90 and 110). −0.08 (92%) is on track, where it used to be slightly under. −0.101 is slightly under. 0.101 and 0.149 are slightly over. ±0.15 stays under / over.
- `lib/ava/__tests__/resolveAvaPacingNudge.test.ts` — under is below 90, not 85. 115 is over, not silent. 90 and 114.9 stay silent (the nudge has no Ahead copy).
- `components/pacing/__tests__/PacingStatusSummary.test.tsx` — legend text is now "90–110% of expected" and "115% of expected and above". This pins legend copy, not a campaign snapshot.
- `lib/kpi/__tests__/kpiPacing.test.ts` — title only. The assertion was already "on track or a mild band" and still passes.

Snapshot tests: `components/dashboard/campaign/__tests__/SpendChartsRow.test.tsx` has `toMatchSnapshot`. It was not opened and not updated. It does not pin a pacing status.

Not changed, because the number is not percent of expected:

- Client hub Plan committed bar (`lib/dashboard/budgetUtilKpi.ts`, `HeroKPIBar`). Colour at 25 and 50 of planned-to-date ÷ plan budget. Left as it is.
- Direct digital and BVOD progress cards pass percent of total planned impressions or clicks into the shared helper. The basis is unchanged. 115 and above still paints Ahead.
- KPI review (`lib/kpi/kpiReview.ts`) is rate vs target through the same helper. Hidden spend stays no-data. Basis unchanged.
- Finance forecast RAG (`lib/finance/forecast/variance/targetVsActual.ts`): on track within 5% shortfall, behind within 15%, else critical. Left as it is.
- Search `compareCpcStatus` / `compareHigherIsBetter` stay ±8% of a rate vs target.
- Ad-serving overview maps `serving` to on-track. Not a percent.
- Direct fixed-cost `deriveLineItemStatus` rolls up burst statuses. Not a percent.
- `PacingBandChart` fallback `tolerance = 8` is percentage points when the chart is not given a band. Live `DeliveryPacingChart` passes the ±10% curve. The 8 was not changed.
- `statusSentence` still mentions impressions running 15 points ahead of spend. That is a sentence, not a status band.
- Ops digest still folds Ahead and Over-pacing into one "ahead" bucket. It has no 90/110 number of its own.

Under 90%, listed and left:

- Live `V_LINE_ITEM_PACING` matching this file: 65% in TL0. The file is updated. The live view was not read and the SQL was not run.
- Campaign strip expected matching the snapshot dollar for the same day: 88%. The expected builder was not changed.
- AVA "on track" prose beyond the skill sentence: 80%. The skill sentence now says 90 / 110 / 115. No campaign-read classifier was found to retune.
- golf026 line-card observation: 72%. That page was not loaded. Not a code surface.

Social and programmatic `pacingPct` is spend ÷ should-spend × 100. That row is percent of expected. Confidence is about 92% after reading the assignment. The expected builder was not changed.

Morning smoke (not run): one campaign should show the same status on Home, the pacing portfolio, pacing detail, and the client dashboard channel card. BICAU002 on snapshot 17 is 91.9% of schedule expected (On track on Home, portfolio, and the strip) and about 86.5% of budget on a straight-line projection (Behind on `computeStatus`, variance about −13.5%). Those two expecteds can still disagree after this commit. A single linear channel on a Krusty Krab plan is the check that should match.

### Commit 2 — Snowflake CASE, text only

The only pacing-status CASE is `sql/snowflake/pacing/16_capture_v_line_item_pacing_pre_retirement.sql`. It is not under `sql/snowflake/mart`. `sql/snowflake/mart/README.md` says Pattern A objects, including `V_LINE_ITEM_PACING`, are kept out of that folder. No `lib/` or `app/` code selects the view. Home, portfolio, pacing detail, and the client dashboard already use the app bands from commit 1. They do not wait on Snowsight.

- SHA: 73573ae2
- Not run. Paste the block below into Snowsight as `ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING`.

```sql
USE SCHEMA ASSEMBLEDVIEW.VW_PACING;

create or replace view V_LINE_ITEM_PACING(
	CLIENTS_ID,
	AV_LINE_ITEM_ID,
	MEDIA_PLAN_ID,
	AV_LINE_ITEM_LABEL,
	MEDIA_TYPE,
	START_DATE,
	END_DATE,
	AS_OF_DATE,
	CAMPAIGN_DAYS,
	DAYS_PASSED,
	DAYS_REMAINING,
	LINE_ITEM_BUDGET,
	SPEND_TO_DATE,
	SPEND_YESTERDAY,
	EXPECTED_SPEND,
	EXPECTED_PCT,
	SPEND_VARIANCE,
	SPEND_VARIANCE_PCT,
	DAILY_PACE,
	REQUIRED_DAILY,
	PROJECTED_TOTAL,
	PROJECTION_VARIANCE_PCT,
	IMPRESSIONS_TO_DATE,
	CLICKS_TO_DATE,
	CONVERSIONS_TO_DATE,
	REVENUE_TO_DATE,
	CTR,
	CPC,
	CPA,
	CR,
	ROAS,
	STATUS
) as
WITH today AS (
  SELECT CONVERT_TIMEZONE('UTC','Australia/Melbourne', CURRENT_TIMESTAMP())::DATE AS today_date
),
li AS (
  SELECT
    clients_id,
    av_line_item_id,
    ANY_VALUE(media_plan_id)        AS media_plan_id,
    ANY_VALUE(av_line_item_label)   AS av_line_item_label,
    ANY_VALUE(media_type)           AS media_type,
    ANY_VALUE(line_item_budget)     AS line_item_budget,
    ANY_VALUE(line_item_start_date) AS start_date,
    ANY_VALUE(line_item_end_date)   AS end_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN spend       ELSE 0 END) AS spend_to_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN impressions ELSE 0 END) AS impressions_to_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN clicks      ELSE 0 END) AS clicks_to_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN conversions ELSE 0 END) AS conversions_to_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN revenue     ELSE 0 END) AS revenue_to_date,
    SUM(CASE WHEN date  = (SELECT today_date FROM today) - 1 THEN spend   ELSE 0 END) AS spend_yesterday
  FROM ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY
  GROUP BY clients_id, av_line_item_id
),
maths AS (
  SELECT
    li.*,
    (SELECT today_date FROM today)                                              AS as_of_date,
    DATEDIFF('day', li.start_date, li.end_date) + 1                             AS campaign_days,
    GREATEST(0, LEAST(
      DATEDIFF('day', li.start_date, li.end_date) + 1,
      DATEDIFF('day', li.start_date, (SELECT today_date FROM today)) + 1
    ))                                                                          AS days_passed,
    GREATEST(0,
      DATEDIFF('day', li.start_date, li.end_date) + 1
      - GREATEST(0, LEAST(
          DATEDIFF('day', li.start_date, li.end_date) + 1,
          DATEDIFF('day', li.start_date, (SELECT today_date FROM today)) + 1
        ))
    )                                                                           AS days_remaining
  FROM li
),
pacing AS (
  SELECT
    m.*,
    DIV0(m.days_passed::FLOAT, m.campaign_days)                                 AS expected_pct,
    m.line_item_budget * DIV0(m.days_passed::FLOAT, m.campaign_days)            AS expected_spend,
    m.spend_to_date - (m.line_item_budget * DIV0(m.days_passed::FLOAT, m.campaign_days)) AS spend_variance,
    DIV0(
      m.spend_to_date - (m.line_item_budget * DIV0(m.days_passed::FLOAT, m.campaign_days)),
      m.line_item_budget * DIV0(m.days_passed::FLOAT, m.campaign_days)
    )                                                                           AS spend_variance_pct,
    DIV0(m.spend_to_date, m.days_passed)                                        AS daily_pace,
    DIV0(m.line_item_budget - m.spend_to_date, m.days_remaining)                AS required_daily,
    DIV0(m.spend_to_date, m.days_passed) * m.campaign_days                      AS projected_total,
    DIV0(
      (DIV0(m.spend_to_date, m.days_passed) * m.campaign_days) - m.line_item_budget,
      m.line_item_budget
    )                                                                           AS projection_variance_pct
  FROM maths m
)
SELECT
  p.clients_id,
  p.av_line_item_id,
  p.media_plan_id,
  p.av_line_item_label,
  p.media_type,
  p.start_date,
  p.end_date,
  p.as_of_date,
  p.campaign_days,
  p.days_passed,
  p.days_remaining,
  p.line_item_budget,
  p.spend_to_date,
  p.spend_yesterday,
  p.expected_spend,
  p.expected_pct,
  p.spend_variance,
  p.spend_variance_pct,
  p.daily_pace,
  p.required_daily,
  p.projected_total,
  p.projection_variance_pct,
  p.impressions_to_date,
  p.clicks_to_date,
  p.conversions_to_date,
  p.revenue_to_date,
  DIV0(p.clicks_to_date, p.impressions_to_date)        AS ctr,
  DIV0(p.spend_to_date,  p.clicks_to_date)             AS cpc,
  DIV0(p.spend_to_date,  p.conversions_to_date)        AS cpa,
  DIV0(p.conversions_to_date, p.clicks_to_date)        AS cr,
  DIV0(p.revenue_to_date, p.spend_to_date)             AS roas,
  -- Status order matches computeStatus. Do not reorder.
  -- projection_variance_pct = projected/budget - 1 (= spend/expected - 1 on a linear flight).
  -- on_track is -0.10 to 0.10 (90–110% of expected). over_pacing is >= 0.15 (115%).
  CASE
    WHEN p.as_of_date < p.start_date                                                          THEN 'not_started'
    WHEN p.as_of_date > p.end_date                                                            THEN 'completed'
    WHEN p.spend_to_date = 0 AND p.days_passed >= 2                                           THEN 'no_delivery'
    WHEN p.projection_variance_pct >= -0.10 AND p.projection_variance_pct <= 0.10             THEN 'on_track'
    WHEN p.projection_variance_pct < -0.10 AND p.projection_variance_pct > -0.15              THEN 'slightly_under'
    WHEN p.projection_variance_pct <= -0.15                                                   THEN 'under_pacing'
    WHEN p.projection_variance_pct > 0.10 AND p.projection_variance_pct < 0.15                THEN 'slightly_over'
    WHEN p.projection_variance_pct >= 0.15                                                    THEN 'over_pacing'
    ELSE 'unknown'
  END                                                                                        AS status
FROM pacing p;
```

## Estimated spend for CM360 direct digital

Commit `633d7660` on `localhost`. This section is uncommitted.

CM360 direct digital (digital display, digital video, digital audio, BVOD) now shows estimated spend from `estimateDirectDigitalSpend`, which calls `deriveSpendFromPlanRate`. Rate is planned media ÷ planned deliverables. CPM uses impressions. Direct-digital CPV maps `video3sViews` onto the helper's `results` field before the call. Programmatic CPV still uses `results`. Other buy types use the helper's own units and its warning. Spend is capped at planned media. `spendMode` is `estimated`, `actual`, or `reported`. The UI label comes from that flag. Planned deliverables of 0 return no estimate and the copy "No planned impressions". Fixed-cost lines keep `REPORTED_SPEND`. Reported replaces the estimate. `delivery_source_map` programmatic behaviour (Quantcast, Twitch, `derive_spend_from_plan`) is unchanged and stays labelled modelled.

Fact grain: placement-day. `TSK_REFRESH_PACING_FACT` merges `VW_PACING_CM360` into `MART.PACING_FACT`. Dedup grain is channel + date_day + platform_line_item_id. Each row also carries `line_item_id` after `LINE_ITEM_LABEL_MAP`. Daily impressions exist at placement grain and are stamped with a plan line id. `aggregatePacingRows` already sums by cleaned line id, so the estimate at plan-line grain is the sum of those rows. Confidence about 95%.

Finance: `lib/finance` and `lib/billing` do not read `getDeliveredTotals`, `loadDeliverySnapshot`, `amountSpent`, or `PACING_FACT`. Billing, Xero, and invoice routes under `app/api` do not call the snapshot loader. Xero is invoice and contact matching. No path found that would carry this estimate into finance.

CPV warehouse column behind `VIDEO_3S_VIEWS`: 55% in AV-TL0 (`VW_PACING_CM360` DDL is not in the repo). The decision is to use the column TL0 named. Not aborted.

`deriveSpendFromPlanRate` falls back to burst `budget` when `mediaAmount` is missing, and warns. Live direct-digital bursts often have `budget` and no `mediaAmount`. Some lines have `budget_includes_fees`, so the cap can be gross budget. The wrapper does not strip a fee.

Left as verification counts, on purpose:

- Admin ad-serving line cards and `GET /api/pacing/ad-serving-campaigns`.
- Overview `mapOverviewItems` no-spend row shapes. `computePacing` is not run on these lines.
- Placement entity table (`columns: "delivery"`). The estimate is a line total.
- Gantt stays deliverable-based.

Checks: helper 6, derive 10, KPI review including estimated CPM, portfolio fixtures, snapshot hub-total test (module mocks), delivered totals 19, direct-digital chart and hero caption. typecheck 0. lint 0 on the touched files. No browser.

Morning smoke was not run. `/dashboard/golf-australia` and a CM360 line card were not loaded. The hub Delivered tile should rise by the estimated CM360 spend and say Estimated. A CM360 line card should show spend and a CPM close to the planned CPM.

## Direct digital estimate uses lib/money

`gate:main` failed in `check:money-inline` because `estimateDirectDigitalSpend` rounded the summed days with `Math.round(... * 100) / 100`. That line is now `roundMoney2` from `lib/money` (`fromCents(toCents(...))`, half-up away from zero). No new helper.

- SHA: fd3e7380
- Checks: `check:money-inline` ok (248 hits, 2 under baseline). `estimateDirectDigitalSpend` tests 6/6. typecheck 0. lint 0 on the file.
- Under 90%: none.

## Flighting grouped by media channel

Two commits on `localhost`. This section is uncommitted.

- `6f13ec4a` `refactor(dashboard): gantt rows carry their media channel`. Each `GanttRow` now has `channelKey` (the media-type key already in the reshape loop). `sub` is still `getMediaLabel`. Normalised bursts already have `budget`, so each row also gets `plannedMedia`: in-window burst budgets parsed with `parseMoney` and summed with `sumCents` / `fromCents`. A budget outside the campaign window is left out. Nothing new is fetched.
- `e0668ff9` `feat(dashboard): flighting grouped by media channel, collapsed at 20+ lines`. `groupGanttRowsByChannel` keeps plan order (first-seen `channelKey`). A group is `{ channelKey, label, lineCount, start, end, plannedMedia?, rows }`. `collapsed` is true when the line count is 20 or more. `MediaPlanVizSection` passes `grouped`. `MediaContainerTimelineCollapsible` does not, so the plan editor stays one row per line. The summary is a button with `aria-expanded`, the channel label, "{n} lines", `plannedMedia` when the rows have it, and a bar from the earliest start week to the latest end week. That bar has no delivered overlay. Child rows are the existing chart (sideline wrap, week columns, delivered `fillRatio`). Expand all and Collapse all sit above the chart. Below 20 lines the groups start open.

Checks: reshape 10/10 (every row has `channelKey`; two in-window budgets 10.1 + 20.2 = 30.3, a burst outside the window is excluded). Grouping 3/3 (22 lines across 3 channels collapsed; 19 open; span is min start to max end). Render 2/2 (expand one channel shows its lines and the delivered label; Collapse all hides them; the editor timeline has no Expand all and still shows each line). typecheck 0. lint 0 on the touched files.

Morning smoke was not run. A client campaign with 20 or more lines was not opened. It should open collapsed by channel, and Expand all should show every line.

## Pacing detail vs the delivery schedule — stopped

No commit. Pacing detail does not load the inputs `resolveCampaignExpectedSpendToDate` needs.

That helper (`lib/spend/resolveCampaignExpectedSpend.ts`) is the one Home and the portfolio use. Order: delivery-schedule months, then monthly plan, then the API metric, then the legacy delivery parser, then the billing schedule. Portfolio calls it from `expectedForCampaign` in `assembleCampaignPacingRows.ts`. Home Needs attention reads the portfolio row. The campaign strip uses the same resolver.

| Surface | Basis today | Status |
|---|---|---|
| Home, portfolio, campaign strip | Spend ÷ `resolveCampaignExpectedSpendToDate` | `deliveryStatusFromPct` / `statusFromExpectedPct` (90 / 110 / 115) |
| Pacing detail lines (search, social, programmatic) | `computePacing` on the current burst: projected finish vs that burst's budget | `computeStatus` → `pacingStatus` |
| Pacing detail line cards | Spend ÷ straight-line expected (`spendVsExpectedPct`) | `deliveryStatusFromPct`, Over-pacing via `statusFromExpectedPct` |
| Pacing detail campaign | Snapshot row when present (already the schedule figure). If the snapshot is missing, `buildCampaignDetail` calls `assembleCampaignPacingRows` with `schedulesByMba: new Map()` | Portfolio pace, with expected 0 when no schedule is passed |

`resolveCampaignExpectedSpendToDate` needs `deliverySchedule`, `billingSchedule`, `monthlySpend`, and optional `metricsExpectedSpendToDate`, plus campaign start and end. Portfolio loads those from `readPublishedOrLivePlanVersions` (`legacy_schedules`). Pacing detail does not. `readPacingVersions` / `PACING_VERSION_COLUMNS` leave `legacy_schedules` off. Channel composers load line bursts only.

Line bursts are already on the search, social, and programmatic rows. That is not this helper's input. Using them would be a different calculator (`computeToDateFromBursts`), which Home and the portfolio do not use for the campaign pill.

Snowflake `V_LINE_ITEM_PACING` stays straight-line. No app route reads it. The name appears only as a comment on `computeStatus` in `lib/pacing/maths/index.ts`. Left as-is.

BICAU002 was not opened. Morning smoke was not run.

## is_published_tip on the published version

`5f61637d` added `is_published_tip` in `lib/data/readMediaPlans.ts` so `liveCampaignIdsFromVersions` counts a campaign only when the flag is true and the tip is live. `readPublishedOrLivePlanVersions` sets it in SQL from `media_plan_masters.published_version_id`. The only reader is that live-count filter. It does not feed the stale-tip guard (`tipVersionIdAtLoad` / `STALE_BASE_VERSION`) or the same-tab publish ref.

MBA detail maps every version without that flag, and the mapper treats a missing flag as `false`. The published version (id equals `published_version_id`) therefore came back false. That is a wrong value. `loadMasterAndVersions` now stamps `isPublishedTip` with `isPublishedTipVersion` before the map. The parity test lists `is_published_tip` and `versionData.is_published_tip` with the other Postgres-only fields. Xano never returns them.

- Checks: `test:mba-plan-detail` 17/17. Mapper test keeps the select flag (6/6). `portfolioSourceTimeout` 11/11, including the cancelled published tip. typecheck 0. lint 0 on the touched files.
- Under 90%: none.
- Morning smoke: not run.

## Direct digital estimate uses the version fee snapshot

`mba_fee_snapshots.fees` is the client fee loading: a flat object keyed by `feedigidisplay`, `feedigivideo`, `feedigiaudio`, `feebvod`, and the other client fee fields. One row per version. The new read is `loadDirectDigitalFeePcts`: one autocommit `getDb().select()` on those version ids. It is not inside `withPgReadLimits`.

`estimateDirectDigitalSpend` takes the channel percent. When `budget_includes_fees` is true and a burst has no media amount, `netFromGross` rewrites the budget the rate helper reads, so the cap is planned net media. No snapshot row, and no client fee loading already on the path, keeps the gross budget and logs `[direct-digital-estimate] no fee snapshot for version {id}; using gross`. The flag false is unchanged. `deriveSpendFromPlanRate` is unchanged, including Quantcast and Twitch.

The campaign page loads the map once and passes it into the delivered snapshot and the four channel sections. The portfolio builder, and the pacing-detail fallback that assembles a row when the snapshot is missing, each do their own select after the line reads return.

- Commit: `e06090a9` `fix(delivery): direct digital estimate uses net media from the version fee snapshot`. This section is uncommitted.
- Checks: estimate tests 12/12 ($10,000 gross at 15% and 100,000 of 500,000 impressions is $1,700; no snapshot is $2,000 plus the log line; the flag false stays $2,000). Fee-channel tests 2/2. Snapshot tests 5/5, including the existing $2,000 hub total. Portfolio fixtures 10/10. typecheck 0. lint 0 on the touched files.
- Under 90%: none.
- Morning smoke was not run. A fee-inclusive CM360 line was not opened.

## Pacing detail campaign rates against the delivery schedule

Campaign level landed. Line level stopped.

`buildCampaignDetail` now reads `legacy_schedules` for the version ids on the page's search, social, programmatic, and ad-serving lines. The read is `readPlanVersionSchedulesByIds`: one autocommit `getDb().select()`, `planVersionColumns(true)`, mapped with `mapPlanVersionFromPostgres`. It is not `readPublishedOrLivePlanVersions` and not `withPgReadLimits`. `PACING_VERSION_COLUMNS` still omits `legacy_schedules`. Those rows become `schedulesByMba` and `assembleCampaignPacingRows` calls `resolveCampaignExpectedSpendToDate` with basis media, the same call the portfolio makes. A snapshot whose expected is within $1 of that figure is kept. A larger gap logs `[pacing-detail] campaign expected differs from snapshot for {mba}: snapshot {a} fresh {b}` and the page uses the fresh row. No loaded schedule keeps the snapshot, so a missed read cannot zero expected. Admin status stays `campaignDisplayBand`: spend ÷ expected through `PACING_STATUS_THRESHOLDS`, Over-pacing at 115.

- Commit: `53792f09` `fix(pacing): pacing detail campaign rates against the delivery schedule`. This section is uncommitted.
- Checks: `chooseCampaignDetailRow` 3/3. BICAU002 assembled from the portfolio fixture with that MBA's sources and the same `schedulesByMba` matches the portfolio row's expected, pace, and `campaignDisplayBand`. typecheck 0. lint 0 on the touched files.
- Under 90%: none on the campaign read.

Line level was not committed. `computeToDateFromBursts` (`normalizeBursts`) prorates `media_investment ?? budget_number ?? spend ?? amount ?? budget`. It does not read `media_amount`, `budget_includes_fees`, or a fee percent, and it does not call `netFromGross` or `computeBurstAmounts`. The portfolio's campaign expected is the delivery schedule on basis media. Those months are `deliveryMediaAmount` from `computeBurstAmounts`: when `budget_includes_fees` is true that figure is net media, not the entered gross. `expectedSpendToDateFromBursts` prefers a stored `mediaAmount` and otherwise uses `budget` (`budget_number` first). It also does not apply the fee percent when `mediaAmount` is absent. Rating a fee-inclusive line with `computeToDateFromBursts` would use gross. The portfolio rates the same money as net. Stopped before the line-card change. Projected finish, the current-burst `computePacing` status, and the straight-line line-card expected are unchanged.

- Morning smoke was not run. BICAU002 was not opened on Home, the portfolio, pacing detail, or its client dashboard card.

## AU time on the Draft saved toast

The three "Draft saved" toasts called `toLocaleTimeString()` with no locale, so the clock followed the browser. They now use `formatDraftSavedTime`, next to `formatDraftOfferTimestamp`: en-AU, Australia/Melbourne, time only. `2026-10-11T22:01:00Z` is `9:01 am`.

- Commit: `6fdff942` `fix(plans): AU time on the Draft saved toast`. This section is uncommitted.
- Checks: draft tests 18 pass, 6 skipped. The new case asserts the exact string. typecheck 0. lint 0 on the touched files (existing hook warnings on the create and edit pages, none on these lines).
- Under 90%: none.
- Morning smoke was not run. The Draft saved toast was not opened.

## Pacing detail lines rate against net burst media — stopped

No commit. Line expected on the BICAU002 fixture does not reconcile to the campaign expected from `53792f09` within $1.

Campaign expected is `p6FixtureRows()` for BICAU002: **$51,243.36**. That is `resolveCampaignExpectedSpendToDate` on basis media. The fixture schedule is one July 2026 search bucket equal to `BICAU002_SPEND_TO_DATE`. July is fully elapsed by the fixture as-of `2026-09-16`, so the whole bucket counts. Spend to date on that row is the same $51,243.36.

The lines have empty `bursts` arrays. The specified no-burst path is a straight line of the line's net budget across the line dates. There is no fee snapshot on the fixture, so a fee-inclusive budget stays gross (the `e06090a9` fallback). Dates are `2026-07-01` to `2026-12-31`. At `2026-09-16` that is 78 of 184 days.

| Line | Budget used | Expected |
|---|---|---|
| Social `BICAU002SM1` | $11,894.36 | $5,042.17 |
| Programmatic `BICAU002PV1` (stub) | $5,000 | $2,119.57 |
| Direct Channel Factory | $20,376 | $8,637.65 |
| Direct BVOD | $19,500 | $8,266.30 |
| Direct UMG | $9,120 | $3,866.09 |
| Sum | | **$27,931.78** |

Gap: **−$23,311.58** (line sum minus campaign expected). Ad-serving cards add no money. Dropping the $5,000 programmatic stub, which is not in the schedule, leaves $25,812.22 and a gap of −$25,431.14.

The schedule is a July lump of reported and actual spend. The line budgets are a Jul–Dec flight, BVOD's budget is $19,500 against reported spend of $9,853, and the programmatic stub is a second Channel Factory budget beside the direct reported line. `computeToDateFromBursts`, line-card status, and projected finish are unchanged.

## Fee snapshot read no longer fails the portfolio

One commit on `localhost`. The run log stays uncommitted.

`buildCampaignPacingRows` takes `loadFeePcts` and threads it through `buildAndStorePortfolioSnapshot`. Unset calls `loadDirectDigitalFeePcts`. `loadDirectDigitalFeePctsOrGross` wraps that call: a throw logs `[direct-digital-estimate] fee snapshot read failed: {message}; using gross` once and the build continues with an empty map. The campaign page and the pacing-detail fallback use the same wrapper. `loadDeliverySnapshot` still calls the throwing loader when the caller does not pass a map.

The four portfolio tests that reached the real select now pass an empty stub. A fifth passes a loader that throws `DATABASE_URL is not set`. That build upserts, and the Lets Go digital-display estimate is $2,000 on a $10,000 gross budget (15% would have been $1,700 on $8,500).

- SHA: ab57ef02
- Checks: `test:pacing-portfolio` exit 0. Node 28 pass, then `portfolioSourceTimeout` 12 pass, then vitest 7 pass. typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none.
- Morning smoke was not run. A fee-inclusive CM360 line was not opened.

## White line item cards in the plan editor

One commit on `localhost`. The run log stays uncommitted.

The shared line item card is `ExpertCard` in `components/media-containers/ExpertCard.tsx`. Every media container renders card-entry lines through it. The card fill is `bg-card`, the existing `border-border/50` stays, radius stays `rounded-card` from the Card primitive, and `shadow-none` stays. The title row is `bg-card`. The collapsed summary strip (`summaryRow`) is wrapped in `bg-surface-muted`. Field inputs are unchanged (`border-input`).

Burst rows use `MP_BURST_CARD` in `lib/mediaplan/burstSectionLayout.ts`: `bg-card`, the existing `border-border`, `shadow-none`. `ExpertCard` and `BurstRowCard` (Television and Production `burstsSlot`) both use that token. The burst column header is `MP_BURST_HEADER_SHELL`: `bg-surface-muted` with the existing hairline. Container header cards and `ExpertGrid` were not touched.

No snapshot or class test pinned `bg-surface-muted` on the line item card or `MP_BURST_CARD`. `expertCardFields.test.ts` asserts field keys and labels only. Nothing to update.

- SHA: edb21ebb
- Checks: typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none on the class change.
- Smoke: hartm017 edit was not opened. `http://localhost:3000/mediaplans/mba/hartm017/edit` redirected to the Auth0 login. Nothing was saved.

## Pacing detail lines rate against net burst media

One commit on `localhost`. The run log stays uncommitted. This is the line-level change that stopped above. BICAU002 is still not required to reconcile: its lines have empty bursts and its schedule is one July lump, and campaign expected includes channels pacing detail does not rate. That fixture still only asserts the same campaign status as the portfolio.

The fee-snapshot read returns the fee percent for every editor channel through `resolveFeePctFromFeeLoading`. The four direct-digital keys stay on the map for the estimate. Campaign detail loads it once per request, for every version id on the page, through `loadDirectDigitalFeePctsOrGross`.

`netBurstMediaForPacing` uses `mediaAmount` when it is present. Otherwise a fee-inclusive burst is `netFromGross(budget, true, feePct)`, and a non-fee burst is the budget. `lineExpectedNetToDate` prorates those amounts across the line's bursts via `computeToDateFromBurstAmounts`. `computeToDateFromBursts` is unchanged. A line with no bursts logs `[pacing-detail] no bursts for {id}; straight-line net budget` and uses a straight line of the line's net budget across the line dates.

Each spend line's status is spend to date ÷ that expected, through `PACING_STATUS_THRESHOLDS`. Search, social, programmatic, and direct line cards use that percent. The straight-line expected no longer sets the line card status. Projected finish is still computed and shown; it does not set the status. Ad-serving cards stay verification counts.

The new fixture is MBA `netrec001`: search and social only, every line has a full July burst, and every channel is a platform channel. Line expected sums to the campaign expected within $1.

- SHA: d5f3092f
- Checks: `test:pacing-detail` exit 0 (node 23, vitest 8). `lineExpectedNet` 5/5, including the fee-inclusive $11,500 at 15% on track at $4,887.50, the non-fee line on the burst budget, week 1 on track, the card and the line row agreeing, and `netrec001` within $1. Fee-channel tests 2/2. Line card model 7/7. typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none.
- Morning smoke was not run. A fee-inclusive line was not opened on pacing detail.

## Assumed spend daily cents for offline lines

One commit on `localhost`. The run log stays uncommitted. This is step 1 of AV-S26, with Luke's 12 Oct overrides: the spread is the burst's exact days, not the month window; the label is Assumed spend, `spendMode` `assumed`, `CAP_APPLIED` `assumed_spend`. Channels stay television, radio, newspaper, magazines, static OOH, cinema, and digital lines with no source. Nothing is wired into pacing rows, the warehouse, or the dashboard yet.

`assumedDailyCents` walks the inclusive window and gives each day through the as-of date the same integer cents. Half-up is `toCents` of the dollar amount divided by the day count. The remainder sits on the last day only once that day is on or before the as-of date. Later days are 0. `$1,000` over 7 days is 14286 cents on day 1 and 14284 on day 7, and the seven days sum to 100000 cents. A 3 July as-of on that week is 14286, 14286, 14286, then zeros.

`assumedSpendForBurst` takes `computeBurstAmounts` `deliveryMediaAmount` and converts it with `toCents`. Bonus and `package_inclusions` return nothing. A client-pays line with fees inside a `$1,000` budget uses the net delivery media, not the invoiced media of 0. Panel flights replace the burst dates. Several flights share one delivery-media amount across their days, without filling the gaps.

Published offline lines with panel flights: 0. `line_item_panels` and `line_item_panel_flights` are empty in the connected database (0 rows), so no television, radio, newspaper, magazines, OOH, or cinema line on a published version has a flight, and no other channel does either.

- SHA: 09d68dec
- Checks: `test:assumed-spend` 6/6. typecheck 0. lint 0 (existing warnings only; none on these files). `check:money-inline` ok.
- Under 90%: none on the cents split. The panel count is this database; it is empty, not a sample of one campaign.
- Morning smoke was not run. No offline line was opened.

## Line snapshot carries assume-spend flag and daily cents

One commit on `localhost`. The run log stays uncommitted. SQL was authored and not run.

Production `LINE_ITEM_SNAPSHOT_SOURCE` is `postgres`, so the nightly MERGE writes `fetchAllPgLineItems` rows. These two columns are computed in `mapPgLineItemToSnapshot`, not by the Xano crawl. A row that omits them binds null, and the MERGE uses `COALESCE` so that null does not clear a value already on the snapshot.

`ASSUME_SPEND` is true only when the buy type is not bonus or `package_inclusions`, line delivery-media cents are above 0, and either the source table is television, radio, newspaper, magazines, static OOH (`media_plan_ooh`), or cinema, or the line is digital (`digi_*` or `prog_*`), `no_adserving` is true, and `lookupActiveDeliverySource` finds no active row. The map check is the TypeScript seed, not a SELECT on `delivery_source_map`. Each burst in `BURSTS_JSON` gets `assumedDailyCents` from `assumedSpendForBurst` at sync time, using the version fee snapshot and Melbourne today as the as-of date.

The TypeScript flag cannot see Snowflake fact rows. A digital line that later gets facts stays `ASSUME_SPEND` true until the next sync only if it still has no map and `no_adserving` is still true. The procedure (TP6, not in this commit) has to delete that line's `CAP_APPLIED = 'assumed_spend'` rows when facts exist, so assumed spend is not added on top of a real source.

Luke, apply this in Snowsight. Do not re-run the `CREATE OR REPLACE` above it in the same file.

```sql
ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
  ADD COLUMN IF NOT EXISTS NO_ADSERVING BOOLEAN;

ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
  ADD COLUMN IF NOT EXISTS ASSUME_SPEND BOOLEAN;
```

- SHA: ecfa0086
- Checks: assume-spend snapshot tests 6/6 (radio paid true, radio bonus false, DV360 with a map row false, CM360 display with `no_adserving` false, digital with no map and `no_adserving` true). Parity map tests 6/6. typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none on the flag. The procedure that deletes assumed rows when facts arrive is not written yet.
- Morning smoke was not run. The ALTER was not applied.


## Assumed spend rows in the fixed-cost daily fact

One commit on `localhost`. The run log stays uncommitted. Nothing was executed in Snowflake. There is no JavaScript harness for this procedure logic, so no assumed-row or delete-on-fact cases were added. The procedure body was syntax-checked after unescaping the doubled quotes.

`fetchLineItems` keeps a line when `FIXED_COST_MEDIA` is true or `ASSUME_SPEND` is true. An assume-spend line skips `fetchDeliveryForBurst` and the CPM cap. Each burst day comes from `assumedDailyCents` already on `BURSTS_JSON`. `REPORTED_SPEND` is cents / 100. `CAP_APPLIED` is `assumed_spend`. `ACTUAL_PLATFORM_SPEND` and `ACTUAL_DELIVERABLES` are 0. The same call deletes `assumed_spend` rows when the latest snapshot row is no longer `ASSUME_SPEND`, or when that line id has a row in `PACING_FACT`, `SEARCH_PACING_FACT`, or `SOCIAL_PACING_FACT`. A line that still has the flag and now has facts is not written again.

The nightly procedure still calls the inner procedure once with a null id and `false` for the 3-day window. It then backfills partner-file and direct-digital lines as before. A second cursor calls the inner procedure with `BACKFILL_MODE` true once per `ASSUME_SPEND` id, and skips a null id. The return string reports that count separately.

Luke, apply these in this order. Do not re-run the snapshot `CREATE OR REPLACE`.

### (a) Snapshot columns

```sql
ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
  ADD COLUMN IF NOT EXISTS NO_ADSERVING BOOLEAN;

ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
  ADD COLUMN IF NOT EXISTS ASSUME_SPEND BOOLEAN;
```

### (b) Procedures

```sql
-- ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY
-- Rev 2026-09-16. Signature (VARCHAR DEFAULT NULL, BOOLEAN DEFAULT FALSE).
-- Reads MART.XANO_LINE_ITEMS_SNAPSHOT (frozen name). prog_* and digi_* route to PACING_FACT; cpv reads VIDEO_3S_VIEWS.
-- ASSUME_SPEND lines copy BURSTS_JSON assumedDailyCents into daily rows (cents / 100). They skip delivery and the CPM cap.
-- A line that is no longer ASSUME_SPEND, or that has a pacing fact row, loses its assumed_spend daily rows.
-- Safety (author only; Luke applies in Snowsight): LOWER filter on LINE_ITEM_ID; QUALIFY latest SYNCED_AT per id.
-- Do not CALL with a null id and BACKFILL_MODE true.
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE PROCEDURE "SP_REFRESH_FIXED_COST_REPORTED_DAILY"("LINE_ITEM_ID_FILTER" VARCHAR DEFAULT null, "BACKFILL_MODE" BOOLEAN DEFAULT FALSE)
RETURNS VARCHAR
LANGUAGE JAVASCRIPT
EXECUTE AS OWNER
AS '

const CAP_LOW = 0.5;
const CAP_HIGH = 1.3;
const ROLLING_WINDOW_DAYS = 3;
const DAILY_FACT_BATCH_SIZE = 500;

const lineItemIdFilter = LINE_ITEM_ID_FILTER;
const backfillMode = BACKFILL_MODE;

// =====================================================
// HELPERS
// =====================================================

function safeDiv(num, den) {
    if (!den || den === 0) return 0;
    const r = num / den;
    return Number.isFinite(r) ? r : 0;
}

function isFixedCostBuyType(buyType) {
    return (buyType || '''').toLowerCase() === ''fixed_cost'';
}

function metricColumnForBuyType(buyType) {
    const bt = (buyType || '''').toLowerCase();
    if (bt === ''cpm'') return ''IMPRESSIONS'';
    if (bt === ''cpc'') return ''CLICKS'';
    if (bt === ''cpv'') return ''VIDEO_3S_VIEWS'';
    if (bt === ''cpa'') return ''RESULTS'';
    if (bt === ''fixed_cost'') return null;  // no platform-side deliverable metric
    return ''IMPRESSIONS'';
}

function factTableForSource(sourceTable) {
    if (sourceTable === ''media_plan_search'') return ''ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT'';
    if (sourceTable === ''media_plan_social'') return ''ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT'';
    if (sourceTable === ''media_plan_prog_display'' ||
        sourceTable === ''media_plan_prog_video'' ||
        sourceTable === ''media_plan_prog_bvod'' ||
        sourceTable === ''media_plan_prog_audio'' ||
        sourceTable === ''media_plan_prog_ooh'' ||
        sourceTable === ''media_plan_digi_bvod'' ||
        sourceTable === ''media_plan_digi_video'' ||
        sourceTable === ''media_plan_digi_display'' ||
        sourceTable === ''media_plan_digi_audio'') return ''ASSEMBLEDVIEW.MART.PACING_FACT'';
    return null;
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function parseMoney(s) {
    if (s == null) return 0;
    if (typeof s === ''number'') return s;
    return parseFloat(String(s).replace(/[$,]/g, '''')) || 0;
}

function toDateString(d) {
    if (typeof d === ''string'') return d.slice(0, 10);
    return new Date(d).toISOString().slice(0, 10);
}

function dateRange(startStr, endStr) {
    const dates = [];
    const cur = new Date(startStr + ''T00:00:00Z'');
    const end = new Date(endStr + ''T00:00:00Z'');
    while (cur <= end) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return dates;
}

function daysBetween(startStr, endStr) {
    const s = new Date(startStr + ''T00:00:00Z'');
    const e = new Date(endStr + ''T00:00:00Z'');
    return Math.round((e - s) / 86400000) + 1;
}

function fetchLineItems() {
    let sql = `
        SELECT 
            LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME,
            BUY_TYPE, FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE, ASSUME_SPEND
        FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
        WHERE (
            FIXED_COST_MEDIA = TRUE
            OR ASSUME_SPEND = TRUE
        )
    `;
    if (lineItemIdFilter) sql += ` AND LOWER(LINE_ITEM_ID) = LOWER(?)`;
    sql += ` QUALIFY ROW_NUMBER() OVER (PARTITION BY LINE_ITEM_ID ORDER BY SYNCED_AT DESC) = 1`;
    sql += ` ORDER BY LINE_ITEM_ID`;

    const stmt = snowflake.createStatement({
        sqlText: sql,
        binds: lineItemIdFilter ? [lineItemIdFilter] : []
    });
    const rs = stmt.execute();
    const items = [];
    while (rs.next()) {
        items.push({
            lineItemId: rs.getColumnValue(1),
            mbaNumber: rs.getColumnValue(2),
            lineItemName: rs.getColumnValue(3),
            buyType: rs.getColumnValue(4),
            fixedCostMedia: rs.getColumnValue(5),
            burstsJson: rs.getColumnValue(6),
            sourceTable: rs.getColumnValue(7),
            assumeSpend: rs.getColumnValue(8) === true
        });
    }
    return items;
}

function parseBursts(burstsJson) {
    let bursts = burstsJson;
    if (typeof burstsJson === ''string'') {
        bursts = JSON.parse(burstsJson);
    }
    if (!Array.isArray(bursts)) return [];

    return bursts.map((b, idx) => {
        const budget = parseMoney(b.budget);
        const buyAmount = parseMoney(b.buyAmount);
        const calculatedValue = parseFloat(b.calculatedValue) || 0;
        return {
            index: idx,
            startDate: toDateString(b.startDate),
            endDate: toDateString(b.endDate),
            budget: budget,
            buyAmount: buyAmount,
            calculatedValue: calculatedValue,
            durationDays: daysBetween(toDateString(b.startDate), toDateString(b.endDate)),
            assumedDailyCents: Array.isArray(b.assumedDailyCents) ? b.assumedDailyCents : []
        };
    });
}

function assumedSpendDailyData(burst) {
    const series = burst.assumedDailyCents || [];
    const reported = {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const n = series.length;
    for (let i = 0; i < n; i++) {
        const point = series[i] || {};
        const day = toDateString(point.date);
        const cents = Number(point.cents);
        const reportedSpend = Number.isFinite(cents) ? cents / 100 : 0;
        const dayHasPassed = day <= todayStr;
        reported[day] = {
            reportedSpend: reportedSpend,
            actualSpend: 0,
            actualDeliverables: 0,
            shareToday: dayHasPassed ? safeDiv(i + 1, n) : 0,
            capApplied: ''assumed_spend'',
            isSquareup: false
        };
    }
    return reported;
}

function lineHasDeliveryFact(lineItemId) {
    const sql = `
        SELECT 1
        WHERE EXISTS (
            SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
        )
        OR EXISTS (
            SELECT 1 FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
        )
        OR EXISTS (
            SELECT 1 FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
        )
    `;
    const stmt = snowflake.createStatement({
        sqlText: sql,
        binds: [lineItemId, lineItemId, lineItemId]
    });
    const rs = stmt.execute();
    return rs.next();
}

function deleteStaleAssumedSpendRows() {
    let sql = `
        DELETE FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT f
        WHERE f.CAP_APPLIED = ''assumed_spend''
          AND (
            NOT EXISTS (
              SELECT 1
              FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
              WHERE LOWER(s.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
                AND s.ASSUME_SPEND = TRUE
                AND s.SYNCED_AT = (
                  SELECT MAX(s2.SYNCED_AT)
                  FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s2
                  WHERE LOWER(s2.LINE_ITEM_ID) = LOWER(s.LINE_ITEM_ID)
                )
            )
            OR EXISTS (
              SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT p
              WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
            )
            OR EXISTS (
              SELECT 1 FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT p
              WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
            )
            OR EXISTS (
              SELECT 1 FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT p
              WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
            )
          )
    `;
    const binds = [];
    if (lineItemIdFilter) {
        sql += ` AND LOWER(f.LINE_ITEM_ID) = LOWER(?)`;
        binds.push(lineItemIdFilter);
    }
    snowflake.createStatement({ sqlText: sql, binds: binds }).execute();
}

function fetchDeliveryForBurst(lineItemId, sourceTable, buyType, burstStart, burstEnd) {
    const factTable = factTableForSource(sourceTable);
    if (!factTable) return {};

    const metricCol = metricColumnForBuyType(buyType);
    let sql;

    if (metricCol === null) {
        // fixed_cost — fetch only platform spend; deliverables are not meaningful
        sql = `
            SELECT 
                DATE_DAY,
                SUM(AMOUNT_SPENT) AS ACTUAL_SPEND,
                0 AS ACTUAL_DELIVERABLES
            FROM ${factTable}
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
            AND DATE_DAY BETWEEN ? AND ?
            GROUP BY DATE_DAY
            ORDER BY DATE_DAY
        `;
    } else {
        sql = `
            SELECT 
                DATE_DAY,
                SUM(AMOUNT_SPENT) AS ACTUAL_SPEND,
                SUM(${metricCol}) AS ACTUAL_DELIVERABLES
            FROM ${factTable}
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
            AND DATE_DAY BETWEEN ? AND ?
            GROUP BY DATE_DAY
            ORDER BY DATE_DAY
        `;
    }

    const stmt = snowflake.createStatement({
        sqlText: sql,
        binds: [lineItemId, burstStart, burstEnd]
    });
    const rs = stmt.execute();
    const byDate = {};
    while (rs.next()) {
        const d = rs.getColumnValue(1);
        const dateStr = (d instanceof Date)
            ? d.toISOString().slice(0, 10)
            : String(d).slice(0, 10);
        byDate[dateStr] = {
            actualSpend: parseFloat(rs.getColumnValue(2) || 0),
            actualDeliverables: parseFloat(rs.getColumnValue(3) || 0)
        };
    }
    return byDate;
}

function computeBurstReportedSpends(burst, deliveryByDate, buyType) {
    const fixedCost = isFixedCostBuyType(buyType);
    const evenDailyRate = safeDiv(burst.budget, burst.durationDays);

    // ---------- fixed_cost branch: date-based linear smoothing ----------
if (fixedCost) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const burstComplete = todayStr > burst.endDate;
    const dates = dateRange(burst.startDate, burst.endDate);
    const reported = {};
    for (let i = 0; i < dates.length; i++) {
        const day = dates[i];
        const delivery = deliveryByDate[day] || { actualSpend: 0, actualDeliverables: 0 };
        const daysCompleted = i + 1;
        // Only accrue reported spend for days that have passed (day <= today)
        const dayHasPassed = day <= todayStr;
        const reportedSpend = dayHasPassed ? evenDailyRate : 0;
        reported[day] = {
            reportedSpend: reportedSpend,
            actualSpend: delivery.actualSpend,
            actualDeliverables: 0,
            shareToday: dayHasPassed ? safeDiv(daysCompleted, burst.durationDays) : 0,
            capApplied: ''fixed_cost'',
            isSquareup: false
        };
    }
    // Final-day rounding squareup ONLY when burst is fully complete
    if (burstComplete && dates.length > 0) {
        const totalReported = Object.values(reported)
            .reduce(function(s, r) { return s + r.reportedSpend; }, 0);
        const drift = burst.budget - totalReported;
        if (Math.abs(drift) > 0.0001) {
            reported[dates[dates.length - 1]].reportedSpend += drift;
            reported[dates[dates.length - 1]].isSquareup = true;
            reported[dates[dates.length - 1]].capApplied = ''fixed_cost_rounding'';
        }
    }
    return reported;
}

    // ---------- delivery-shaped logic for cpm/cpc/cpv/cpa ----------
    const expectedDaily = safeDiv(burst.calculatedValue, burst.durationDays);
    const capLowAmount = CAP_LOW * evenDailyRate;
    const capHighAmount = CAP_HIGH * evenDailyRate;

    const dates = dateRange(burst.startDate, burst.endDate);
    const reported = {};
    let runningReported = 0;

    for (let i = 0; i < dates.length; i++) {
        const day = dates[i];
        const daysCompleted = i + 1;
        const delivery = deliveryByDate[day] || { actualSpend: 0, actualDeliverables: 0 };

        if (delivery.actualDeliverables === 0) {
            reported[day] = {
                reportedSpend: 0,
                actualSpend: delivery.actualSpend,
                actualDeliverables: 0,
                shareToday: 0,
                capApplied: ''none'',
                isSquareup: false
            };
            continue;
        }

        // safeDiv guards against expectedDaily=0 (calculatedValue=0 data-entry case)
        const shareTodayRaw = safeDiv(delivery.actualDeliverables, expectedDaily);
        // Bound stored shareToday to fit NUMBER(8,4) regardless of plan-shape edge cases
        const shareToday = Math.min(shareTodayRaw, 9999.9999);
        const shareCapped = clamp(shareToday, CAP_LOW, CAP_HIGH);
        const initialReported = evenDailyRate * shareCapped;

        let adjustedReported;
        let capApplied = ''none'';

        if (shareToday < 1.0) {
            adjustedReported = initialReported;
            if (shareToday < CAP_LOW) capApplied = ''low'';
        } else {
            const paceTarget = burst.budget * (daysCompleted / burst.durationDays);
            const idealToday = paceTarget - runningReported;
            adjustedReported = clamp(idealToday, capLowAmount, capHighAmount);
            adjustedReported = Math.min(adjustedReported, initialReported);
            if (shareToday > CAP_HIGH) capApplied = ''high'';
        }

        adjustedReported = clamp(adjustedReported, capLowAmount, capHighAmount);

        reported[day] = {
            reportedSpend: adjustedReported,
            actualSpend: delivery.actualSpend,
            actualDeliverables: delivery.actualDeliverables,
            shareToday: shareToday,
            capApplied: capApplied,
            isSquareup: false
        };
        runningReported += adjustedReported;
    }

    let lastDeliveryDay = null;
    for (let i = dates.length - 1; i >= 0; i--) {
        if (reported[dates[i]].actualDeliverables > 0) {
            lastDeliveryDay = dates[i];
            break;
        }
    }

    const today = new Date().toISOString().slice(0, 10);
    const burstHasCompleted = today > burst.endDate;

    if (burstHasCompleted && lastDeliveryDay) {
        const totalActualDeliverables = Object.values(reported)
            .reduce(function(s, r) { return s + r.actualDeliverables; }, 0);
        const deliveryRatio = safeDiv(totalActualDeliverables, burst.calculatedValue);

        if (deliveryRatio >= 1.0) {
            const runningWithoutLast = runningReported - reported[lastDeliveryDay].reportedSpend;
            const squareupAmount = burst.budget - runningWithoutLast;
            reported[lastDeliveryDay].reportedSpend = squareupAmount;
            reported[lastDeliveryDay].isSquareup = true;
            reported[lastDeliveryDay].capApplied = ''squareup'';
        }
    }

    return reported;
}

function isLockedDay(dayStr, today, isBackfill) {
    if (isBackfill) return true;
    const dayDate = new Date(dayStr + ''T00:00:00Z'');
    const todayDate = new Date(today + ''T00:00:00Z'');
    const diffDays = Math.round((todayDate - dayDate) / 86400000);
    return diffDays >= ROLLING_WINDOW_DAYS;
}

// =====================================================
// BATCH MERGE FOR DAILY FACT
// =====================================================

function buildDailyFactBatchMergeSql(rowCount) {
    const placeholders = Array(rowCount)
        .fill(''(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'')
        .join('',\\n        '');

    return `
        MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT t
        USING (
          SELECT
            column1::VARCHAR AS LINE_ITEM_ID,
            column2::NUMBER AS BURST_INDEX,
            column3::DATE AS DATE_DAY,
            column4::DECIMAL(18,4) AS REPORTED_SPEND,
            column5::DECIMAL(18,4) AS ACTUAL_PLATFORM_SPEND,
            column6::DECIMAL(18,4) AS ACTUAL_DELIVERABLES,
            column7::DECIMAL(18,4) AS EXPECTED_DAILY_DELIVERABLES,
            column8::DECIMAL(18,4) AS BURST_BUDGET,
            column9::DATE AS BURST_START_DATE,
            column10::DATE AS BURST_END_DATE,
            column11::VARCHAR AS BUY_TYPE,
            column12::DECIMAL(18,4) AS BUY_AMOUNT,
            column13::DECIMAL(8,4) AS SHARE_TODAY,
            column14::VARCHAR AS CAP_APPLIED,
            column15::NUMBER::BOOLEAN AS IS_SQUAREUP_DAY,
            column16::NUMBER::BOOLEAN AS IS_LOCKED
          FROM VALUES
            ${placeholders}
        ) s
        ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
           AND t.BURST_INDEX = s.BURST_INDEX
           AND t.DATE_DAY = s.DATE_DAY
        WHEN MATCHED THEN UPDATE SET
            REPORTED_SPEND = s.REPORTED_SPEND,
            ACTUAL_PLATFORM_SPEND = s.ACTUAL_PLATFORM_SPEND,
            ACTUAL_DELIVERABLES = s.ACTUAL_DELIVERABLES,
            EXPECTED_DAILY_DELIVERABLES = s.EXPECTED_DAILY_DELIVERABLES,
            BURST_BUDGET = s.BURST_BUDGET,
            BURST_START_DATE = s.BURST_START_DATE,
            BURST_END_DATE = s.BURST_END_DATE,
            BUY_TYPE = s.BUY_TYPE,
            BUY_AMOUNT = s.BUY_AMOUNT,
            SHARE_TODAY = s.SHARE_TODAY,
            CAP_APPLIED = s.CAP_APPLIED,
            IS_SQUAREUP_DAY = s.IS_SQUAREUP_DAY,
            IS_LOCKED = s.IS_LOCKED,
            CALCULATED_AT = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (
            LINE_ITEM_ID, BURST_INDEX, DATE_DAY,
            REPORTED_SPEND, ACTUAL_PLATFORM_SPEND, ACTUAL_DELIVERABLES, EXPECTED_DAILY_DELIVERABLES,
            BURST_BUDGET, BURST_START_DATE, BURST_END_DATE,
            BUY_TYPE, BUY_AMOUNT, SHARE_TODAY, CAP_APPLIED,
            IS_SQUAREUP_DAY, IS_LOCKED, CALCULATED_AT
        ) VALUES (
            s.LINE_ITEM_ID, s.BURST_INDEX, s.DATE_DAY,
            s.REPORTED_SPEND, s.ACTUAL_PLATFORM_SPEND, s.ACTUAL_DELIVERABLES, s.EXPECTED_DAILY_DELIVERABLES,
            s.BURST_BUDGET, s.BURST_START_DATE, s.BURST_END_DATE,
            s.BUY_TYPE, s.BUY_AMOUNT, s.SHARE_TODAY, s.CAP_APPLIED,
            s.IS_SQUAREUP_DAY, s.IS_LOCKED, CURRENT_TIMESTAMP()
        )
    `;
}

function batchUpsertDailyFacts(allDailyRows) {
    let upserted = 0;
    for (let i = 0; i < allDailyRows.length; i += DAILY_FACT_BATCH_SIZE) {
        const batch = allDailyRows.slice(i, i + DAILY_FACT_BATCH_SIZE);
        const sql = buildDailyFactBatchMergeSql(batch.length);
        const binds = [];
        for (const row of batch) {
            binds.push(
                row.lineItemId,
                row.burstIndex,
                row.dateDay,
                row.reportedSpend,
                row.actualPlatformSpend,
                row.actualDeliverables,
                row.expectedDailyDeliverables,
                row.burstBudget,
                row.burstStartDate,
                row.burstEndDate,
                row.buyType,
                row.buyAmount,
                row.shareToday,
                row.capApplied,
                row.isSquareup ? 1 : 0,
                row.isLocked ? 1 : 0
            );
        }
        const stmt = snowflake.createStatement({ sqlText: sql, binds: binds });
        stmt.execute();
        upserted += batch.length;
    }
    return upserted;
}

// =====================================================
// PER-ROW MERGE FOR BURST FACT
// =====================================================

const BURST_FACT_MERGE_SQL = `
    MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_BURST_FACT t
    USING (
      SELECT
        ?::VARCHAR AS LINE_ITEM_ID,
        ?::NUMBER AS BURST_INDEX,
        ?::DATE AS BURST_START_DATE,
        ?::DATE AS BURST_END_DATE,
        ?::DECIMAL(18,4) AS BURST_BUDGET,
        ?::DECIMAL(18,4) AS BURST_EXPECTED_DELIVERABLES,
        ?::DECIMAL(18,4) AS BURST_ACTUAL_DELIVERABLES,
        ?::DECIMAL(8,4) AS BURST_DELIVERY_RATIO,
        ?::DECIMAL(18,4) AS BURST_REPORTED_SPEND,
        ?::DECIMAL(18,4) AS BURST_ACTUAL_PLATFORM_SPEND,
        ?::DECIMAL(18,4) AS BURST_VARIANCE,
        ?::VARCHAR AS BURST_STATUS
    ) s
    ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
       AND t.BURST_INDEX = s.BURST_INDEX
    WHEN MATCHED THEN UPDATE SET
        BURST_START_DATE = s.BURST_START_DATE,
        BURST_END_DATE = s.BURST_END_DATE,
        BURST_BUDGET = s.BURST_BUDGET,
        BURST_EXPECTED_DELIVERABLES = s.BURST_EXPECTED_DELIVERABLES,
        BURST_ACTUAL_DELIVERABLES = s.BURST_ACTUAL_DELIVERABLES,
        BURST_DELIVERY_RATIO = s.BURST_DELIVERY_RATIO,
        BURST_REPORTED_SPEND = s.BURST_REPORTED_SPEND,
        BURST_ACTUAL_PLATFORM_SPEND = s.BURST_ACTUAL_PLATFORM_SPEND,
        BURST_VARIANCE = s.BURST_VARIANCE,
        BURST_STATUS = s.BURST_STATUS,
        LAST_CALCULATED_AT = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
        LINE_ITEM_ID, BURST_INDEX, BURST_START_DATE, BURST_END_DATE,
        BURST_BUDGET, BURST_EXPECTED_DELIVERABLES, BURST_ACTUAL_DELIVERABLES, BURST_DELIVERY_RATIO,
        BURST_REPORTED_SPEND, BURST_ACTUAL_PLATFORM_SPEND, BURST_VARIANCE, BURST_STATUS,
        LAST_CALCULATED_AT
    ) VALUES (
        s.LINE_ITEM_ID, s.BURST_INDEX, s.BURST_START_DATE, s.BURST_END_DATE,
        s.BURST_BUDGET, s.BURST_EXPECTED_DELIVERABLES, s.BURST_ACTUAL_DELIVERABLES, s.BURST_DELIVERY_RATIO,
        s.BURST_REPORTED_SPEND, s.BURST_ACTUAL_PLATFORM_SPEND, s.BURST_VARIANCE, s.BURST_STATUS,
        CURRENT_TIMESTAMP()
    )
`;

function upsertBurstFact(lineItemId, burst, dailyData, today, buyType) {
    const fixedCost = isFixedCostBuyType(buyType);

    const burstReported = Object.values(dailyData)
        .reduce(function(s, r) { return s + r.reportedSpend; }, 0);
    const burstActual = Object.values(dailyData)
        .reduce(function(s, r) { return s + r.actualSpend; }, 0);
    const burstActualDeliverables = Object.values(dailyData)
        .reduce(function(s, r) { return s + r.actualDeliverables; }, 0);

    // For fixed_cost: deliverables and ratio are not meaningful
    const burstExpectedDeliverables = fixedCost ? 0 : burst.calculatedValue;
    const burstActualDeliverablesForBind = fixedCost ? 0 : burstActualDeliverables;
    const deliveryRatioRaw = fixedCost ? 0 : safeDiv(burstActualDeliverables, burst.calculatedValue);
    const deliveryRatio = Math.min(deliveryRatioRaw, 9999.9999);  // bound to NUMBER(8,4)

    let burstStatus;
    if (today < burst.startDate) burstStatus = ''pending'';
    else if (today <= burst.endDate) burstStatus = ''in_progress'';
    else if (fixedCost) burstStatus = ''completed'';  // no over/under for fixed_cost
    else if (deliveryRatioRaw >= 1.0) burstStatus = ''completed_over'';
    else burstStatus = ''completed_under'';

    const stmt = snowflake.createStatement({
        sqlText: BURST_FACT_MERGE_SQL,
        binds: [
            lineItemId, burst.index,
            burst.startDate, burst.endDate,
            burst.budget,
            burstExpectedDeliverables,
            burstActualDeliverablesForBind,
            deliveryRatio,
            burstReported,
            burstActual,
            burstReported - burstActual,
            burstStatus
        ]
    });
    stmt.execute();
}

// =====================================================
// PER-ROW MERGE FOR LINE ITEM FACT
// =====================================================

const LINE_ITEM_FACT_MERGE_SQL = `
    MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT t
    USING (
      SELECT
        ?::VARCHAR AS LINE_ITEM_ID,
        ?::VARCHAR AS MBA_NUMBER,
        ?::VARCHAR AS LINE_ITEM_NAME,
        ?::NUMBER::BOOLEAN AS IS_CURRENTLY_FIXED_COST,
        ?::DECIMAL(18,4) AS LINE_ITEM_TOTAL_BUDGET,
        ?::DECIMAL(18,4) AS LINE_ITEM_TOTAL_REPORTED,
        ?::DECIMAL(18,4) AS LINE_ITEM_TOTAL_ACTUAL,
        ?::DECIMAL(18,4) AS LINE_ITEM_VARIANCE,
        ?::NUMBER AS BURST_COUNT,
        ?::NUMBER AS BURSTS_DELIVERED_OVER,
        ?::NUMBER AS BURSTS_DELIVERED_UNDER
    ) s
    ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
    WHEN MATCHED THEN UPDATE SET
        MBA_NUMBER = s.MBA_NUMBER,
        LINE_ITEM_NAME = s.LINE_ITEM_NAME,
        IS_CURRENTLY_FIXED_COST = s.IS_CURRENTLY_FIXED_COST,
        WAS_EVER_FIXED_COST = COALESCE(t.WAS_EVER_FIXED_COST, FALSE) OR s.IS_CURRENTLY_FIXED_COST,
        LINE_ITEM_TOTAL_BUDGET = s.LINE_ITEM_TOTAL_BUDGET,
        LINE_ITEM_TOTAL_REPORTED = s.LINE_ITEM_TOTAL_REPORTED,
        LINE_ITEM_TOTAL_ACTUAL = s.LINE_ITEM_TOTAL_ACTUAL,
        LINE_ITEM_VARIANCE = s.LINE_ITEM_VARIANCE,
        BURST_COUNT = s.BURST_COUNT,
        BURSTS_DELIVERED_OVER = s.BURSTS_DELIVERED_OVER,
        BURSTS_DELIVERED_UNDER = s.BURSTS_DELIVERED_UNDER,
        LAST_CALCULATED_AT = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
        LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME,
        IS_CURRENTLY_FIXED_COST, WAS_EVER_FIXED_COST,
        LINE_ITEM_TOTAL_BUDGET, LINE_ITEM_TOTAL_REPORTED, LINE_ITEM_TOTAL_ACTUAL, LINE_ITEM_VARIANCE,
        BURST_COUNT, BURSTS_DELIVERED_OVER, BURSTS_DELIVERED_UNDER,
        LAST_CALCULATED_AT
    ) VALUES (
        s.LINE_ITEM_ID, s.MBA_NUMBER, s.LINE_ITEM_NAME,
        s.IS_CURRENTLY_FIXED_COST, s.IS_CURRENTLY_FIXED_COST,
        s.LINE_ITEM_TOTAL_BUDGET, s.LINE_ITEM_TOTAL_REPORTED, s.LINE_ITEM_TOTAL_ACTUAL, s.LINE_ITEM_VARIANCE,
        s.BURST_COUNT, s.BURSTS_DELIVERED_OVER, s.BURSTS_DELIVERED_UNDER,
        CURRENT_TIMESTAMP()
    )
`;

function upsertLineItemFact(lineItem, allBurstData, today) {
    const fixedCost = isFixedCostBuyType(lineItem.buyType);

    let totalBudget = 0;
    let totalReported = 0;
    let totalActual = 0;
    let burstsOver = 0;
    let burstsUnder = 0;
    const burstIndices = Object.keys(allBurstData);

    for (const idx of burstIndices) {
        const { burst, dailyData } = allBurstData[idx];
        totalBudget += burst.budget;
        totalReported += Object.values(dailyData).reduce(function(s, r) { return s + r.reportedSpend; }, 0);
        totalActual += Object.values(dailyData).reduce(function(s, r) { return s + r.actualSpend; }, 0);

        // Skip over/under counting for fixed_cost (no delivery concept)
        if (!fixedCost && today > burst.endDate) {
            const burstActualDeliverables = Object.values(dailyData)
                .reduce(function(s, r) { return s + r.actualDeliverables; }, 0);
            const ratio = safeDiv(burstActualDeliverables, burst.calculatedValue);
            if (ratio >= 1.0) burstsOver++;
            else burstsUnder++;
        }
    }

    const stmt = snowflake.createStatement({
        sqlText: LINE_ITEM_FACT_MERGE_SQL,
        binds: [
            lineItem.lineItemId, lineItem.mbaNumber, lineItem.lineItemName,
            lineItem.fixedCostMedia ? 1 : 0,
            totalBudget, totalReported, totalActual, totalReported - totalActual,
            burstIndices.length, burstsOver, burstsUnder
        ]
    });
    stmt.execute();
}

// =====================================================
// MAIN
// =====================================================

const today = new Date().toISOString().slice(0, 10);
deleteStaleAssumedSpendRows();
const lineItems = fetchLineItems();
const result = {
    line_items_processed: 0,
    line_items_errored: 0,
    daily_rows_upserted: 0,
    burst_rows_upserted: 0,
    daily_batches: 0,
    errors: [],
    backfill_mode: backfillMode,
    line_item_filter: lineItemIdFilter,
    today: today
};

for (const li of lineItems) {
    try {
        const assumeSpend = li.assumeSpend === true;
        if (assumeSpend && lineHasDeliveryFact(li.lineItemId)) {
            continue;
        }
        const fixedCost = isFixedCostBuyType(li.buyType);
        const bursts = parseBursts(li.burstsJson);
        const allBurstData = {};
        const dailyRowsForLineItem = [];

        for (const burst of bursts) {
            let dailyData;
            if (assumeSpend) {
                dailyData = assumedSpendDailyData(burst);
            } else {
                const delivery = fetchDeliveryForBurst(
                    li.lineItemId, li.sourceTable, li.buyType,
                    burst.startDate, burst.endDate
                );
                dailyData = computeBurstReportedSpends(burst, delivery, li.buyType);
            }
            allBurstData[burst.index] = { burst: burst, dailyData: dailyData };

            // For fixed_cost and assumed spend, expectedDailyDeliverables is meaningless → 0
            const expectedDaily = (assumeSpend || fixedCost) ? 0 : safeDiv(burst.calculatedValue, burst.durationDays);

            for (const [day, data] of Object.entries(dailyData)) {
                const locked = isLockedDay(day, today, backfillMode);
                if (!backfillMode && locked) continue;

                dailyRowsForLineItem.push({
                    lineItemId: li.lineItemId,
                    burstIndex: burst.index,
                    dateDay: day,
                    reportedSpend: data.reportedSpend,
                    actualPlatformSpend: data.actualSpend,
                    actualDeliverables: data.actualDeliverables,
                    expectedDailyDeliverables: expectedDaily,
                    burstBudget: burst.budget,
                    burstStartDate: burst.startDate,
                    burstEndDate: burst.endDate,
                    buyType: li.buyType,
                    buyAmount: burst.buyAmount,
                    shareToday: data.shareToday,
                    capApplied: data.capApplied,
                    isSquareup: data.isSquareup,
                    isLocked: locked
                });
            }
        }

        if (dailyRowsForLineItem.length > 0) {
            const upserted = batchUpsertDailyFacts(dailyRowsForLineItem);
            result.daily_rows_upserted += upserted;
            result.daily_batches += Math.ceil(dailyRowsForLineItem.length / DAILY_FACT_BATCH_SIZE);
        }

        for (const idx of Object.keys(allBurstData)) {
            const { burst, dailyData } = allBurstData[idx];
            upsertBurstFact(li.lineItemId, burst, dailyData, today, li.buyType);
            result.burst_rows_upserted += 1;
        }

        upsertLineItemFact(li, allBurstData, today);
        result.line_items_processed += 1;
    } catch (err) {
        result.line_items_errored += 1;
        result.errors.push(li.lineItemId + '': '' + (err.message || err));
        if (result.errors.length >= 10) {
            break;
        }
    }
}

return JSON.stringify(result);

';
```

```sql
-- ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY
-- Wrapper: 3-day window for all lines, then a full backfill for every fixed-cost
-- line on a partner-file or direct-digital source so late files never leave locked zeros,
-- then a full backfill per ASSUME_SPEND line id.
-- Never calls the inner procedure with a null id and BACKFILL_MODE true.
-- AUTHOR ONLY — Luke applies in Snowsight (S1, 2026-09-16).
create or replace procedure ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY()
returns varchar
language sql
execute as owner
as
$$
begin
  let none varchar := null;
  call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(:none, false);

  let n integer := 0;
  let c cursor for
    select distinct lower(LINE_ITEM_ID) as id
    from ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
    where FIXED_COST_MEDIA = true
      and (
        SOURCE_TABLE in ('media_plan_prog_ooh','media_plan_digi_bvod','media_plan_digi_video',
                         'media_plan_digi_display','media_plan_digi_audio')
        or lower(PLATFORM) in ('channel factory','vistar','broadsign')
      );
  for r in c do
    let id varchar := r.id;
    call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(:id, true);
    n := n + 1;
  end for;

  let assumed integer := 0;
  let c2 cursor for
    select distinct lower(LINE_ITEM_ID) as id
    from ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
    where ASSUME_SPEND = true
      and LINE_ITEM_ID is not null;
  for r2 in c2 do
    let id2 varchar := r2.id;
    if (id2 is not null) then
      call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(:id2, true);
      assumed := assumed + 1;
    end if;
  end for;

  return 'window refresh done; full backfill on ' || n::varchar
    || ' partner-file / direct-digital lines; assumed spend backfill on '
    || assumed::varchar || ' lines';
end;
$$;
```

### (c) Backfill

```sql
CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY();
```

### (d) Confirm

```sql
select SOURCE_TABLE, count(*)
from ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT f
join ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
  on lower(s.LINE_ITEM_ID) = lower(f.LINE_ITEM_ID)
where f.CAP_APPLIED = 'assumed_spend'
group by 1;
```

Expected families: television, radio, newspaper, magazines, ooh, cinema, plus any digital line whose `ASSUME_SPEND` is still true and which has no pacing fact row. golf025 social, DV360, and the CM360 display and video lines must not appear.

- SHA: c17f89ea
- Checks: no procedure-logic harness in the repo. Unescaped procedure JavaScript passes `node --check`. The nightly script has no null-id call with `true`.
- Under 90%: none on the row shape. Direct still reads every `REPORTED_SPEND` on this table, so once this is applied those dollars count before the pacing label change.
- Morning smoke was not run. Snowflake was not called.

## Assumed spend for offline channels in pacing

One commit on `localhost`. The run log stays uncommitted. This is S26 section 2, with the Assumed spend rename. Snowflake was not called. The client dashboard, reports, and AVA are not wired.

The direct reader still reads `FIXED_COST_REPORTED_DAILY_FACT`. A line whose daily caps are `assumed_spend`, and not `fixed_cost`, becomes one channel row per family. The pacing card and the pacing detail print Assumed spend. `spendMode` is `assumed`. Line ids stay on the row.

Those dollars count in spend to date and pace. Campaign expected stays `resolveCampaignExpectedSpendToDate`. An assumed channel with daily rows is `reporting`, so it is rated on the 90/110/115 ladder and does not force campaign `no_source`. A sibling channel with no source still does.

A line id already on search, social, programmatic, or ad-serving is skipped, so its assumed dollars are not added. CM360 stays on the direct-digital estimate. Programmatic `fixed_cost` stays on the reported path.

- SHA: b425343b
- Checks: assumed spend pacing 5/5. Line card model 8/8. Campaign pacing card vitest 3/3, including the Assumed spend caption. typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none on the row shape. The warehouse procedures from the previous entry are still authored and not applied, so no `assumed_spend` rows exist in Snowflake until they are run.
- Morning smoke was not run. Snowflake was not called.

## Assumed spend section and hub totals

One commit on `localhost`. The run log stays uncommitted. This is S26 section 3, with the Assumed spend rename. Snowflake was not called. Reports and AVA are not wired.

Television, radio, newspaper, magazines, static OOH, and cinema get one campaign delivery section titled Assumed spend. Progress is assumed-to-date divided by the line delivery media. The cards do not show impressions, clicks, or CPM. Awaiting delivery is unchanged.

A direct digital or BVOD plan with no ad-serving rows and ASSUME_SPEND lines uses that same title. When ad-serving rows exist, the section stays on the current estimate. Those assumed dollars are not added on top of the ad-serving rows.

The client hub Delivered tile counts assumed spend that is already inside the delivered sum, and labels it includes `$X` assumed. Booked, no platform delivery falls by the non-platform part of that sum. An overlay line whose snapshot spend is already positive is not added again.

- SHA: ac4e1880
- Checks: assumed spend section 5/5. Direct digital chart vitest 8/8. Client hub hero vitest 9/9. typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none on the section or the hub split. The warehouse procedures are still authored and not applied, so the hub label stays at zero until those rows exist. The campaign section computes from the plan bursts either way.
- Morning smoke was not run. Snowflake was not called.

## Assumed spend excluded from rate metrics

One commit on `localhost`. The run log stays uncommitted. This is S26 section 4, with the Assumed spend rename. Snowflake was not called.

The report deck counts assumed spend in campaign spend and in the "Rates exclude $X of spend with no reported impressions or clicks." footnote. It is not in the impression, click, or view spend. The channel is labelled Assumed spend. A direct-digital estimate that has impressions stays in CPM. The footnote still names only the spend that has neither impressions nor clicks when both an estimate and assumed spend are present.

AVA carries `assumedSpend` separately, includes it in the spend the tool names, and passes only reported or estimated delivery spend into CPM, CPC, and CTR. The tool text says assumed spend is booked media assumed delivered to plan, not reported. The snapshot's plan total still omits the assumed channel so the hub does not add it twice.

- SHA: c6780ede
- Checks: campaign report figures 9/9, including the deck footnote. AVA tools 13/13, including CPM unchanged when assumed spend is added. typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none on the rate split. The warehouse procedures are still authored and not applied. The deck and AVA use plan-burst assumed spend, so they can show dollars before the hub fact does.
- Morning smoke was not run. Snowflake was not called.

## Assume-spend rule in a client-safe module

One commit on `localhost`. The run log stays uncommitted. Snowflake was not called.

`gate:main` failed `check:client-server-only` because the campaign page client reached `db/schema` through `assumedSpendAdapter` → `pgLineItemSnapshotMap` → `planShapes`. The adapter only needed `assumeSpendForSnapshotLine`. That rule is a pure lookup against the in-memory delivery-source seed, so it now lives in `lib/spend/assumeSpendRule.ts`. The snapshot map, the dashboard adapter, and `loadDeliverySnapshot` import it from there. The flag logic is unchanged.

- SHA: e1b61a55
- Checks: client-server-only OK. Assumed spend 6/6. Snapshot 6/6. Assumed-spend section 5/5. typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none. The rule does not read the database.
- Morning smoke was not run. Snowflake was not called.

## Report dump closes its pools

One commit on `localhost`. The run log stays uncommitted.

`scripts/reports/dump-report.mjs` is the TP10 dump that wrote both September fixtures and then stayed open on the Snowflake pool. `pool.ts` had no closer, so `closeSnowflakePool` drains the existing pool and destroys its connections. The script's `finally` calls that and `closeDb`. The dump logic is unchanged.

Ran once for hema007, September 2026 (`last_month` as of 2026-10-12). It wrote the fixture and exited 0 on its own in 17.4 seconds. The rewritten fixture is uncommitted.

- SHA: 71ee571c
- Checks: the hema007 dump, exit 0, 17.4s. typecheck 0.
- Under 90%: none on the exit. The 17.4s is this run with a warm warehouse, not the earlier hung attempt.
- Morning smoke was not run. Snowflake was read for the dump and then closed.

## Report deck skill spike stopped on API credits

No commit. The deck was not built, so the spike commit was not made. The scripts and wrapper skill are in the working tree. Decks and renders were not produced. `scripts/spikes/report-deck-skill/out/` is gitignored.

SDK `@anthropic-ai/sdk` 0.97.1 supports `container.skills`, the Skills API, and the `container_upload` input block. `ANTHROPIC_REPORT_MODEL` is unset. `ANTHROPIC_MODEL` is `claude-opus-5.5`, which the API rejects. The calls used `claude-opus-5-5`.

Container paths, from a code-execution probe with the Anthropic pptx skill: `/mnt/skills/public/pptx/SKILL.md` is missing, `/mnt/user-data/outputs/` is missing, `/usr/bin/soffice` exists, and finished files go in `$OUTPUT_DIR` (`/files/output/...`). The wrapper text uses those paths. General pptx mechanics are at `/skills/pptx/SKILL.md`.

The first deck request, with the 16MB template inside the custom skill, was rejected: prompt 1,177,171 tokens, over the 1,000,000 maximum. The template stays in the skill folder and is omitted from the API bundle. The run script sends it with a second `container_upload` block. A replacement skill then fit: 3,943 input tokens with both skills loaded.

Custom skill: `skill_01JF9e5zWXC9oo7sdddVgga4`, version `1791786474444362`.

The hema007 deck call uploaded `report-data.json` and `assembled-template.pptx` as `container_upload`, then the API returned 400: credit balance too low. No pptx, no number check, no render. Claude did not get as far as running soffice on a deck. The path probe had already shown `/usr/bin/soffice`.

curatif004 September was regenerated with `scripts/reports/dump-report.mjs` so the fixture has `notLive`. That fixture is uncommitted.

LibreOffice 26.8.1.1 was installed locally so the PNG step can run once a deck exists. It was not used.

- SHA: none
- Path probe: 8,544 input tokens, 709 output tokens. Prompt-fit probe: 3,943 input tokens. Estimated at $5 / $25 per million tokens, about $0.08 for those two probes. The deck call returned no usage.
- Under 90%: the dollar estimate. These are Opus-class published rates, not a pricing-API quote for `claude-opus-5-5`.
- Morning smoke was not run. Snowflake was read only for the curatif004 fixture dump.

## Lean deck payload and token guardrails

One commit on `localhost`. The run log stays uncommitted. No Messages API call.

`run-deck.ts` kept none of the three console runs. It wrote `out/{mba}-container.log` only after the loop finished, and `scripts/spikes/report-deck-skill/out/` was not on disk. The command that added about 370k tokens is not in the repo.

The fixtures cannot be that jump. hema007 is 4,626 bytes, about 1,200 tokens. curatif004 is 5,974 bytes, about 1,500 tokens. The largest keys are `channels`, then `totals`, then `kpis`. Neither file has a daily series. `placeholders()` over all 68 template slides is about 421 lines and about 13k tokens. The 68 slide XML parts are 277 KB, about 69k tokens. The template is the only input large enough: slide layout XML is 4.25 MB, about 1.1M tokens, and base64 of `image6.png` or `image8.png` is about 430k or 550k tokens.

The deck upload is now `slimDeckPayload` from the assembled fixture: campaign summary, channel totals, weekly points only when the source has day rows, KPIs, commentary, and `notLive`. hema007 slim is 3,355 bytes. curatif004 slim is 4,318 bytes. The app assembler is unchanged.

`run-deck.ts` logs input, output, cache read, and cache write on every call, including each continuation. It aborts when one call's `input_tokens` exceeds `ANTHROPIC_SPIKE_MAX_INPUT` (default 150000) or the run's cumulative input exceeds `ANTHROPIC_SPIKE_MAX_RUN_INPUT` (default 600000), and prints the previous tool command. At most 8 continuations. HTTP timeout is 10 minutes. A 499 is logged with elapsed time. The model is `ANTHROPIC_REPORT_MODEL` only.

The hema007 dry run exited before any API call. `ANTHROPIC_REPORT_MODEL` is unset. No per-call tokens, no pptx. Wall time was the process exit, 789ms. curatif004 was not run. The custom skill on Anthropic was not re-uploaded, so the container copy of `SKILL.md` is still the previous version until `upload-skill.ts` runs.

- SHA: e9ff1e88
- Checks: slim payload and guardrail tests 5/5.
- Under 90%: the exact tool command behind the 370k jump. The transcript was not saved.
- Morning smoke was not run. Snowflake was not called.

## Delivery snapshot as-of test sees the totals note

One commit on `localhost`. The run log stays uncommitted.

`git log -S DELIVERY_SNAPSHOT_TOTALS_NOTE` has one hit. `c6780ede` added the export on `summaries.ts` and the import in `getDeliverySnapshot.ts`, next to the assumed-spend wording. Nothing later removed or renamed it. The constant is still that sentence.

The as-of test failed on import because `mock.module` replaces `@/lib/ava/tools/summaries` and its `namedExports` listed only `summariseDeliverySnapshot`. The tool import of `DELIVERY_SNAPSHOT_TOTALS_NOTE` then had nothing to link. The mock now passes the real note through. The tool is unchanged.

- SHA: 6afd4f10
- Checks: `npm run test:ava-tools` exit 0. First process 104 pass, 1 skipped (live golden, `AVA_DATABASE_URL` unset). Second process: the Melbourne as-of test passes. typecheck 0. lint 0 (existing warnings only; none on this file).
- Under 90%: none. The failure was the mock's export list, reproduced before the change.
- Morning smoke was not run. Snowflake was not called.

## OOH expert grid keeps package inclusion and bonus quantities

One commit on `localhost`. The run log stays uncommitted.

`appendOohBurstFromExpertQty` now stores `roundDeliverables` of the week quantity on `calculatedValue` for `package_inclusions` and `bonus`. Budget and buy amount stay `"0"`. Reopen no longer substitutes 1 when that stored value is 0. A stored 0 shows as 0. The burst `buyType: "bonus"` stamp is unchanged.

Other Expert Apply paths do not assign `calculatedValue = 0` for those buy types, so they were left. Television, radio, BVOD, and digital audio already store `roundDeliverables` of the week quantity. Digital display, digital video, and cinema use `bvodCalculatedDeliverables`, which returns 1 for `package_inclusions` and the week quantity for bonus. Newspaper and magazines use `newspaperCalculatedDeliverables`, which does the same. Their reopen mappers also substitute 1 when a stored `package_inclusions` quantity is 0. That is a different path from the OOH apply zero.

Money stays 0. `computeBurstAmounts` for `package_inclusions` is still all zeros, and the stored budget is `"0"`. Static OOH is outside the ad-serving schedule. The export gross and delivery media for the fixture are 0. The OOH average-rate cell is gross divided by deliverables, so a zero gross with quantity 4 prints 0 there. That is not a billing, MBA, or delivery-media total.

- SHA: 024bdfd2
- Checks: inclusion quantity tests 5/5, including the workbook Deliverables cell and the flighting cell. typecheck 0. lint 0 (existing warnings only; none on these files).
- Under 90%: none on the stored quantity or the zero money. The other channels were read and left.
- Morning smoke was not run. Snowflake was not called.

## Reordering OOH lines keeps their line ids

One commit on localhost. The run log stays uncommitted.

Part A. Joins on `line_item_id` with no version, which would attach v1 facts to whoever holds that id after a reorder:

- Snowflake pacing facts (`PACING_FACT`, `SEARCH_PACING_FACT`, `SOCIAL_PACING_FACT`) group and match on `LINE_ITEM_ID` only (`lib/snowflake/search-pacing-service.ts`).
- `MART.XANO_LINE_ITEMS_SNAPSHOT` merges on `LINE_ITEM_ID` (`lib/snowflake/syncXanoLineItems.ts`).
- Partner files: `vw_pacing_partner_file` projects `AV_LINE_ITEM_ID` as `LINE_ITEM_ID` with no version (`sql/snowflake/mart/views/vw_pacing_partner_file.sql`). `partner_line_map` stores the same id.
- Pacing relabels key `platform_line_item_id` (`lib/pacing/relabel/shared/channels.ts`).
- Platform naming puts `line_item_id` last on the pacing grain (naming invariant). CM360 and DV360 names follow that id.
- Publish copies `billing_overrides` onto the next version by living line id (`savePlan.ts`).

Version-scoped, so a reorder does not move them onto another line of the same version: `campaign_kpi` (mba + version_number + line id) and `schedule_months` (version id). `delivery_source_map` is a platform-to-source seed. It does not join on `line_item_id`.

Not only OOH. Expert reorder still calls `reassignLineItemNumbers` (or the digital-display wrapper) in Television, Radio, Newspaper, Magazines, Cinema, BVOD, Digital Video, Digital Audio, Digital Display, Social, Production, Integration, Influencers, and `useMediaChannelContainer`. Those were left.

`line_items.position` already exists (`db/schema/planCore.ts`). Save writes it as the 0-based array index. On read, `mapLineItemFromPostgres` copies that column onto `line_item`, so the editor was treating display order as the id suffix. Nothing required `OH1..OHn` with no gaps. `nextLineNumber` and `assignStableLineItemNumbers` already leave gaps.

Part B. OOH expert apply now calls `keepOohLineIdsOnReorder`. The id stays with the line it was minted for. `position` is the new array order. Hydrate sorts by the persisted position, then puts the id suffix back on `line_item` before the stable assign, so a later open does not rebuild the id from the display index. Excel OOH rows sort by that position, and the "Line N" label is position + 1. Add and duplicate still use `nextLineNumber`.

- SHA: e74f6767
- Checks: `tests/lib/oohLineItemOrder.test.ts` 7/7. typecheck 0. `next lint` on the touched files, 0.
- Under 90%: none on the OOH path. Other channels still renumber; that was listed and left.
- Morning smoke was not run. Snowflake was not called.

## Package inclusion bursts keep their own buy type

One commit on localhost. The run log stays uncommitted.

The round-trip ran before the stamp changed. The same `package_inclusions` OOH line was saved, reloaded, and saved again with the burst labelled `bonus`, then with `package_inclusions`. Billing month totals, MBA totals, the snapshot row, and the Excel rows matched. The only difference was the burst `buyType` string. `assume_spend` stayed false. `assumedSpendForBurst` still returns nothing for both labels, including a non-zero raw budget.

`appendOohBurstFromExpertQty` now stamps that line buy type. A `package_inclusions` week stays `package_inclusions`. A bonus week stays `bonus`. Reopen still shows a stored 0 for either label. Excel still reads the line, so a row saved with the old bonus stamp still prints Package Inclusions. Day-detail bursts in the same mapper were already unstamped and still fall back to the line.

- SHA: 42e99a60
- Checks: `lib/mediaplan/__tests__/oohPackageInclusionBurstLabel.test.ts` 2/2, inclusion quantity tests 5/5, Excel buy-type tests 6/6. typecheck 0. `next lint` on the touched files, 0.
- Under 90%: none. The round-trip totals matched, so the stamp changed.
- Morning smoke was not run. Snowflake was not called.

## AV-TS wrap-up

`npm run gate:main` with `NODE_OPTIONS=--max-old-space-size=6144` for that run only, exit 0, 153.2s. `npm run test:all` once, exit 0, 125/125 suites, 599.9s. `test:codex-stage1-templates` passed. No suite was rerun. Only this run log was staged.

### Prompts

| ID | Status | SHA |
| --- | --- | --- |
| AV-TK1 portfolio lock timeout | DONE | `a7678c72` |
| Second publish in the same tab | DONE | `fd2298a9` |
| Portfolio cron in syd1 | DONE | `a83fba1d` |
| Skip the composer cache on the cron | DONE | `d98dc41a` |
| Published tip live count | DONE | `5f61637d` |
| AU date on the draft restore prompt | DONE | `a5bacb15` |
| One On track rule, 90 to 110 | DONE | `cf71ce35` |
| V_LINE_ITEM_PACING CASE | DONE | `73573ae2` |
| Estimated spend for CM360 direct digital | DONE | `633d7660` |
| Direct digital estimate uses lib/money | DONE | `fd3e7380` |
| Gantt rows carry their media channel | DONE | `6f13ec4a` |
| Flighting grouped by media channel | DONE | `e0668ff9` |
| Pacing detail vs the delivery schedule | STOPPED | none |
| is_published_tip on the published version | DONE | `1493b4fc` |
| Direct digital estimate uses the version fee snapshot | DONE | `e06090a9` |
| Pacing detail campaign rates against the delivery schedule | DONE | `53792f09` |
| AU time on the Draft saved toast | DONE | `6fdff942` |
| Pacing detail lines rate against net burst media | STOPPED | none |
| Fee snapshot read no longer fails the portfolio | DONE | `ab57ef02` |
| White line item cards | DONE | `edb21ebb` |
| Pacing detail lines rate against net burst media | DONE | `d5f3092f` |
| Assumed spend daily cents | DONE | `09d68dec` |
| Line snapshot assume-spend flag | DONE | `ecfa0086` |
| Assumed spend rows in the fixed-cost daily fact | DONE | `c17f89ea` |
| Assumed spend for offline channels in pacing | DONE | `b425343b` |
| Assumed spend section and hub totals | DONE | `ac4e1880` |
| Assumed spend excluded from rate metrics | DONE | `c6780ede` |
| Report data uses one pace basis | DONE | `674c6325` |
| Assume-spend rule in a client-safe module | DONE | `e1b61a55` |
| Report dump closes its pools | DONE | `71ee571c` |
| Report deck skill spike | STOPPED | none |
| Lean deck payload and token guardrails | DONE | `e9ff1e88` |
| Delivery snapshot as-of totals note | DONE | `6afd4f10` |
| OOH expert grid package inclusion quantities | DONE | `024bdfd2` |
| Reordering OOH lines keeps their line ids | DONE | `e74f6767` |
| Package inclusion bursts keep their own buy type | DONE | `42e99a60` |
| AV-TS wrap-up | DONE | this commit |

## Flighting expands from the channel row

One commit on `localhost`. The run log stays uncommitted.

The separate channel header is gone. The summary row is the only channel row: chevron, colour tick, channel name, and "N lines · $planned". The label cell is the button (`aria-expanded`, Enter, Space). Expanded lines sit under that row in plan order, indented, one bar each. One axis for the chart, sticky while the page scrolls. Weekly columns are Monday week-start dates (`5 Oct`) with the month name on the first week of each month. Monthly bands are unchanged. Under 20 lines start open; 20 or more start collapsed. Expand all, Collapse all, Download PNG, and the Table and Summary tabs stay.

Download PNG cannot keep `position: sticky`. The existing clone prep sets `.sticky` to `position: relative`, so the axis is in normal flow at the top of the PNG and is not stuck to the viewport.

- SHA: c0dca3d6
- Checks: `GroupedMediaGantt.test.tsx` 7/7. `mediaGanttReshape.test.ts` and `groupGanttRowsByChannel.test.ts` 15/15. typecheck 0. eslint on the touched files, 0.
- Under 90%: none on the row, the single axis, or the Monday labels. The PNG sticky limitation is the clone behaviour above.
- Morning smoke was not run. Snowflake was not called.

## Reordering lines keeps their line ids in every channel

One commit on `localhost`. The run log stays uncommitted.

Expert reorder no longer renumbers. `keepLineIdsOnReorder` stamps `position` and leaves `line_item_id` on the line it was minted for. That replaces `reassignLineItemNumbers` on Expert Apply for television, radio, newspaper, magazines, cinema, digital display, digital audio, digital video, BVOD, integration, social, production, influencers, and the shared shell (search, programmatic display, video, BVOD, audio, OOH). OOH uses the same helper. A row Expert Apply did not already have a minted id for, a new line, and a duplicate take max suffix + 1. Excel, the MBA workbook, and the on-screen "Line N" label follow position.

Load sorts by the number stored on `line_item`. Postgres copies `position` onto that field, so the sort follows position and does not rewrite ids. Digital display used to run `assignStableLineItemNumbers` on that copy during hydrate, which would rebuild the id from the display index. Hydrate now restores the id suffix first (`prepareEditorLines`).

`reassignLineItemNumbers` remains for tests and for `normalizeLineItemsForSave`. No container calls it. Nothing in Excel, the MBA workbook, billing, naming, or the Snowflake sync requires ids to be contiguous `XX1..XXn`.

- SHA: c900cde9
- Checks: `tests/lib/lineItemReorderKeepsIds.test.ts` 120/120 (20 channels × 6). Existing OOH and line-order tests 11/11. typecheck 0. eslint on the touched files, 0.
- Under 90%: none. No ingest re-import renumber was found. A missing-id fallback in a few live Excel syncs still mints from the row index when a line has no id yet. That path is not reorder.
- Morning smoke was not run. Snowflake was not called.

## Channel cards pace against expected to date

Stopped. No commit. golf025 published version 17009, as of 2026-10-12: headline media expected to date `$75,838.65`. The sum of line expected net to date was `$75,051.31`, gap `-$787.34`. That is outside `$1`, so the channel-card change was not built.

## AV-TT wrap-up

`npm run gate:main` with `NODE_OPTIONS=--max-old-space-size=6144` for that run only, exit 0, 284.3s. `npm run test:all` once, exit 0, 125/125 suites, 681.2s. `test:codex-stage1-templates` passed. No suite was rerun. Only this run log was staged.

krusty002 `snapshot_checksum` is the same on v2, v3, v4 and v5 (`33258dc74159c385deb5dbbd4f489c5f03cc60582cefab3f72ce7259e6be93ff`). v5 (version id 19136) is the only one of those with line `krusty002RA3`. The hash is `computeSnapshotChecksum` in `lib/docs/snapshotChecksum.ts:69`, over the canonical payload at line 60: `schedule_months` (each row's `lineItemId`, component, basis, month, amount cents, source), `approved_slice`, and the fee snapshot. Publish writes it in `lib/data/savePlan.ts:1294`. It does not hash the `line_items` table. A line changes the checksum only when it changes a schedule row, the approved slice, or fees. `krusty002RA3` has zero `schedule_months` rows, and v2 through v5 each have 24 schedule rows, so the equal checksum matches the contract. Not fixed in this pack.

### Prompts

| ID | Status | SHA |
| --- | --- | --- |
| Channel cards pace against expected to date | STOPPED | none |
| Flighting expands from the channel row | DONE | `c0dca3d6` |
| Reordering lines keeps their line ids in every channel | DONE | `c900cde9` |
| krusty002 snapshot checksum covers schedule, slice, and fees | REPORTED | none |
| AV-TT wrap-up | DONE | this commit |

## Report deck reads model and effort from env

One commit on `localhost`. The run log stays uncommitted. No Messages API call.

Before this commit, `run-deck.ts` sent no effort setting. The only `messages.create` is the continuation loop, and that body was model, max tokens, betas, the code execution tool, container skills, and messages.

`package.json` depends on `@anthropic-ai/sdk` `^0.97.1`. The installed package is `0.97.1`.

`ANTHROPIC_REPORT_EFFORT` is read the same way as the model. Unset throws and names the variable. The allowed values are `low`, `medium`, and `high`. There is no default.

Every `messages.create` in that loop, including each `pause_turn` continuation, sends `output_config`. The field is `effort` on `Anthropic.Beta.BetaOutputConfig` (`output_config` on `MessageCreateParamsBase` in `@anthropic-ai/sdk` 0.97.1). That params type also carries `container` and the code execution tool, and `tsc` accepted them together.

The opening log and each usage line include the model and the effort. The caps stay 150000 per call, 600000 per run, and 8 continuations.

- SHA: 0cde81df
- Checks: `deck-guardrails.test.ts` 4/4. `tsc --noEmit` 0. eslint on the three spike files, 0.
- Under 90%: none on the field shape.
- Morning smoke was not run. Snowflake was not called. No API call.

## Save every deck call and download before the caps

The instrumentation commit was already on `localhost`. This pass did not add another messages path. No `messages.create`. Files API list and one download only. TT0 was already `0cde81df`, so the effort field was not added again. Effort is still logged at the start and on every usage line. The `out/` ignore was still unstaged, so it landed in a follow-up commit. The run log stays uncommitted.

Files created on 12 Oct after 09:00 UTC:

| id | filename | size | created_at | downloadable |
| --- | --- | --- | --- | --- |
| `file_01MBYe1roqMexnMBU64dqmYX` | report-data.json | 3355 | 2026-10-12T09:04:16.387765Z | false |
| `file_011yKikUGoh3rgptudaV4uhd` | assembled-template.pptx | 16008075 | 2026-10-12T09:04:20.665052Z | false |
| `file_01JpifExCJmA43hbpfV4tbQE` | hema007.pptx | 15044155 | 2026-10-12T09:06:47.501975Z | true |

`hema007.pptx` is not one of the uploads. It is at `scripts/spikes/report-deck-skill/out/hema007-run2.pptx`. The number check against `out/hema007-report-data.json` found 9 slides. The missing-number list is empty. LibreOffice wrote `out/hema007-run2.png` (35,664 bytes). That filter exports the first slide only: the Assembled Media cover.

`run-deck.ts` now writes `out/{mba}-call{n}.json` as soon as a response returns, downloads any new output file before the caps, then applies the caps. `ANTHROPIC_SPIKE_MAX_INPUT` (150000) applies to a `pause_turn` continuation only. `ANTHROPIC_SPIKE_MAX_RUN_INPUT` (600000) still covers the whole run. Both are printed at the start as `continuation_input_cap` and `run_input_cap`. `scripts/spikes/report-deck-skill/out/` is gitignored, so `out/*.json` is covered.

Server tool calls are `BetaServerToolUseBlock` (`type: "server_tool_use"`). The SDK has no `bash_code_execution_tool_use` or `text_editor_code_execution_tool_use` block. Those names are the `name` on `server_tool_use`: `bash_code_execution`, `text_editor_code_execution`, `code_execution`, plus `web_search`, `web_fetch`, `advisor`, `tool_search_tool_regex`, and `tool_search_tool_bm25`. Results paired by `tool_use_id` are `BetaBashCodeExecutionToolResultBlock`, `BetaTextEditorCodeExecutionToolResultBlock`, `BetaCodeExecutionToolResultBlock`, `BetaWebSearchToolResultBlock`, `BetaWebFetchToolResultBlock`, `BetaAdvisorToolResultBlock`, `BetaToolSearchToolResultBlock`, and `BetaMCPToolResultBlock`. `BetaMCPToolUseBlock` is included as a call. Each call prints a step table (step, tool, command trimmed to 200 characters, result characters, error) and the five largest results, each clipped at 4000 characters.

`assembled-template.pptx` is 16,008,075 bytes. No embedded font parts. 68 slides. 123 layouts, of which 67 are referenced by those slides. The ten largest zip entries, uncompressed (compressed size in parentheses):

| entry | uncompressed | compressed |
| --- | --- | --- |
| ppt/media/media1.mp4 | 6455794 | 5547357 |
| ppt/media/image8.png | 1647243 | 1647508 |
| ppt/media/image6.png | 1291988 | 1292364 |
| ppt/media/image12.png | 955332 | 955603 |
| ppt/media/image10.png | 819034 | 819255 |
| ppt/media/image11.png | 703132 | 703330 |
| ppt/media/image2.jpeg | 670380 | 670332 |
| ppt/media/image60.jpg | 607761 | 606699 |
| ppt/media/image5.jpeg | 315265 | 314039 |
| ppt/media/image4.jpeg | 292924 | 292763 |

Media is 16,469,243 bytes uncompressed across 71 files (15,204,963 compressed). The slide is 13.333 by 7.5 inches (`cx="12192000" cy="6858000"`), so 150 dpi full-bleed is 2000 by 1125 pixels. `image60.jpg` is 2560 by 1707. `image2.jpeg` is 987 by 1493, taller than the slide. The 6.5 MB video sits on the Title 1, Title with client, and End Slide layouts (slides 1, 2, and 20), so a catalogue-preserving copy keeps it. 56 layouts are unreferenced (2,627,326 bytes of layout XML, about 246 KB once zipped with their rels). Media used only by those layouts is 956,368 bytes uncompressed across 18 files (730,457 compressed).

Dropping unreferenced layouts and their exclusive media, and downsampling kept rasters to fit 2000 by 1125, keeps every layout a slide uses. The file spells two catalogue rows differently, and both are referenced: slide 24 is `Demeand Flow Planning`, slide 67 is `Caste Study - Black`. Six catalogue names use a hyphen where the layout name uses an en dash (`1_Title 1 – Light`, `2_Title 1 – Light`, `Total Addressable Market – Dark`, `Next step – Dark`, `4_Quote – Dark`, `Business model – Dark`). Those layouts are referenced too. `Narrative / flexible content` is the catalogue label for slides 27-32. Their layouts are `14_Custom Layout`, `22_Custom Layout`, `17_Custom Layout`, `18_Custom Layout`, `19_Custom Layout`, and `20_Custom Layout`, and those six parts stay. Other unreferenced parts share some of those names and would be removed. Expected size is about 14.4 MB (14,398,712 bytes): the current file, minus 730 KB of exclusive media, 246 KB of zipped unused layout XML, and about 633 KB from scaling the two kept oversized rasters by pixel area. The video remains 5.5 MB compressed. That copy was not built.

- SHA: c246335f (save each call, log steps, download before caps). 28c93265 (ignore `scripts/spikes/report-deck-skill/out/`).
- Checks: `deck-guardrails.test.ts` 5/5. `tsc --noEmit` 0. eslint on the three spike files, 0.
- Under 90%: the 14.4 MB figure is an area-ratio estimate from compressed entry sizes, not a rebuilt pptx.
- Morning smoke was not run. Snowflake was not called. No Messages API call.

## Full render and outline of the run 2 deck

One commit on `localhost`. The run log stays uncommitted. No Messages API call. No package install. No app code.

LibreOffice wrote `scripts/spikes/report-deck-skill/out/hema007-run2.pdf` (13,111,777 bytes) from `hema007-run2.pptx`. `pdftoppm` is not on this machine (not on PATH, not under Program Files, WinGet, scoop, or chocolatey). It was not installed. `out/hema007-run2/slide-NN.png` was not written.

`out/hema007-run2-outline.md` lists the 9 slides: number, layout name, and each non-empty text frame. `out/hema007-call1.json` does not exist. `out/hema007-calls.jsonl` has the usage line and the guardrail line only. `last_tool_command` is `(none recorded)`. The 14 container steps were not saved, so they are not listed.

Prompt caching: a `cache_control` marker on the request is what turns on automatic breakpoints between server-tool iterations of that same request. The code-execution doc does not say this. The tool-use caching doc does.

The in-app builder is `buildCampaignReportDeck` (`lib/reports/campaignReport/buildCampaignReportDeck.ts:490`), called at `generateCampaignReportForMba.ts:262`. It uses `pptx-automizer` 0.9.3 (MIT), already installed. It opens `am-template-deck-16x9.pptx`, copies a slide by layout name, clears sample text, and draws new text. It does not build a blank deck. The three generate routes set `maxDuration` 300. `vercel.json` does not set function memory. Peak RSS and wall time on the 16 MB template were not measured.

- SHA: edc57386
- Checks: `outline-run2.ts` wrote 9 slides. No typecheck. No test suite. The outline script is the only new code.
- Under 90%: none on the missing step list (the response was never saved) or on the caching quote. Function memory for the 16 MB template was not measured.
- Morning smoke was not run. Snowflake was not called. No Messages API call.

## Channel and line expected follow the delivery schedule

One commit on `localhost`. The run log stays uncommitted. Postgres was read for golf025 v37 and the 12 Oct portfolio snapshot. Snowflake was not called.

Discovery did not stop the build. The campaign page does not pass yesterday. `resolveCampaignExpectedSpendToDate` uses the same Melbourne as-of as delivered spend. On 12 Oct, golf025 v37 media basis is $75,838.65. On 11 Oct it is $74,289.15. Neither formats as $71.8K. The closest figure in 1–12 Oct is 9 Oct at $71,190.15 ($71.2K). The 11→12 move is one more day of every October month bucket, not a Newspaper insertion on the 12th. Newspaper's −$774.19 is the October $2,000 bucket counted from 1 Oct while NP7's burst starts 25 Oct, so the line figure is September only. Display's −$13.14 is burst windows against even Aug/Sep/Oct buckets, plus a cent on three lines. Not fees. Not a resolver or schedule bug.

Delivered and expected now share an as-of on the campaign page, portfolio `expectedForCampaign`, and `attachStripExpected`.

golf025 on 12 Oct, after the change. Delivered is the 12 Oct portfolio snapshot (`scope all`, live only), summed onto the schedule key. Expected is `channelExpectedToDate`. Status is `deliveryStatusFromPct(delivered ÷ expected)`.

| Channel | Delivered | Expected | Status |
| --- | ---: | ---: | --- |
| Social | $37,349.49 | $38,472.46 | On track (97%) |
| Digital Video | $0.00 | $14,025.61 | Behind |
| Newspaper | $0.00 | $12,952.09 | Behind, Assumed spend |
| Digital Display | $0.00 | $8,721.83 | Behind |
| Programmatic Video | $0.00 | $1,666.66 | Behind |

Those five sum to $75,838.65. The headline is $75,838.65. Gap is 0 cents. OOH and Radio expected $0, so they do not get a card.

- SHA: 45b96bac
- Checks: `channelExpectedToDate.test.ts`, portfolio pacing rows, line cards, campaign detail row choice, and `ChannelsAtAGlance` all passed. `tsc --noEmit` 0. eslint on the touched files, 0.
- Under 90%: the $71.8K figure on the campaign page is not this function on 11 Oct or 12 Oct. Display and video delivered $0 are the stored snapshot, which matches a non-positive CM360 estimate (spend stays 0; budget is now planned media).
- Morning smoke was not run. Snowflake was not called.

## v5 brand report deck skill and a lean run

One commit on `localhost`, files under `scripts/spikes/report-deck-skill/` only. The run log stays uncommitted. No app code. curatif004 was not run.

The brand kit and library zips downloaded into `kit/` (gitignored). `Assembled-Media-Template-v5.potx` is 7,171,587 bytes. `am_rebrand.py` is 18,850 bytes, copied unchanged into `av-campaign-report-v5/scripts/`. New skill id `skill_0161kNqwJPn1Cm4jRd5yWKtZ`. The old `av-campaign-report` skill was left in place. Cover photos, portrait, from `family-and-outdoors` and `road-trips-and-travel`: 6299928, 6786367, 13935909.

hema007 ran once. Model `claude-opus-5-5`, effort `high`. One call, `stop_reason` `end_turn`. 20 container steps. Input 126, output 16,383, cache write 405,703, cache read 699,961. Run cost $2.4967. That is over $1.00, so the model was not called again. Wall time of the call was 188,987 ms. Deck saved to `out/hema007-v5.pptx` (5,198,904 bytes).

Local LibreOffice was already locked by another conversion, so this machine's PDF came from PowerPoint and the PNGs from `pdftoppm -r 40`. Eight slides, 534 by 300. Contact sheet: `scripts/spikes/report-deck-skill/out/hema007-v5-sheet.png`.

Number check. Dollar figures and delivery numbers on the slides are the formatted payload strings (`$3,484.79`, `394,863`, `2.31%`, and the rest). Two stray groups:

| Slide | Part | Figures | What they are |
| --- | --- | --- | --- |
| 2 | slide30.xml | 2, 4 | Stat-row number dots. 1 and 3 on the same row match other payload tokens. |
| 8 | slide36.xml | 71, 3205, 2, 97, 2008 | Thank-you address cloned from the template: 71 Palmerston Crescent, South Melbourne 3205, and Level 2, 97 Rose St, Chippendale NSW 2008. |

Brand check. No `gradFill`. Fonts are Plus Jakarta Sans, Instrument Serif, or the template theme fonts. Every title ends with a full stop. No text below 8pt. Two palette misses:

| Slide | Part | Colour | Source |
| --- | --- | --- | --- |
| 6 | slide34.xml | AEB9B0 | `mutedB` in `am_rebrand.py`, and the v5 template master |
| 8 | slide36.xml | C9D3C8 | `soft` in `am_rebrand.py`, and the cloned thank-you slide |

- SHA: 511a6e05
- Checks: `slim-deck-payload.test.ts` and `deck-guardrails.test.ts`, 8/8. Payload is 3,427 bytes.
- Under 90%: none on the token line or the cost. The skill id is the id printed when `av-campaign-report-v5` was created.
- Morning smoke was not run. Snowflake was not called. The Messages API was called once.

## Deck skill with a tested builder

One commit on `localhost`, files under `scripts/spikes/report-deck-skill/` only. The run log stays uncommitted. No app code. curatif004 was not run.

`build_report.py` resolves every figure from a key in `report-data.json` and fails on a missing key. `check_deck.py` and `summarise.py` print at most 1,500 characters. The five font TTFs are bundled in the skill (about 431 KB on the skill filesystem). They were not container-uploaded, because five upload blocks would be prompt tokens and the fonts are not, unless a script reads them.

Local, no API. Both hand-written contents use every variant at least once. `check_deck.py` printed `OK` for both. `test_checks.py` printed `tests OK`: a missing key fails, a 300-character title is overflow, and `00FFFF` is a palette miss. Contact sheets: `scripts/spikes/report-deck-skill/out/test-hema007-sheet.png` and `scripts/spikes/report-deck-skill/out/test-hema007-b-sheet.png`.

New skill id `skill_01Asrj2k6jP3xQeytLTwDKvk` (replaced `av-campaign-report-v5`). hema007 ran once. Model `claude-opus-5-5`, effort `high`. One call, `stop_reason` `end_turn`. No server-tool result exceeded 20,000 characters.

| Step | Tool | Chars | Status | Command |
| --- | --- | ---: | --- | --- |
| 1 | text_editor_code_execution | 4,583 | ok | view SKILL.md |
| 2 | bash_code_execution | 1,429 | ok | ls and summarise.py |
| 3 | bash_code_execution | 561 | error | jq (bad quoting) |
| 4 | bash_code_execution | 543 | error | jq (bad quoting) |
| 5 | bash_code_execution | 1,853 | ok | python print of formatted values |
| 6 | bash_code_execution | 46 | error | content.json heredoc |
| 7 | bash_code_execution | 59 | error | KPI labels were typed text |
| 8 | bash_code_execution | 21 | ok | shortened the Search note, rebuild, check OK |

Input 110, output 7,089, cache write 14,299, cache read 67,880. Run cost $0.2273. Under $0.60, so the model was not called again. Wall time of the call was 90,508 ms. Deck saved to `out/hema007-v5.pptx` (5,202,729 bytes).

The container check ended `OK` on the third build. The first failed on a missing key (`CTR` used as a label). The second flagged overflow on the Search note. The skill allows one fix pass; this run used two. It did not view an image and did not read the builder scripts. Step 5 did print formatted payload values.

Local LibreOffice failed to convert, so the PDF came from PowerPoint and the PNGs from `pdftoppm -r 50`. Eight slides. Local `check_deck.py` printed `OK`. Contact sheet: `scripts/spikes/report-deck-skill/out/hema007-v5-sheet.png`.

- SHA: a1235698
- Checks: local `check_deck.py` OK on both test decks and on the API deck. `test_checks.py` OK.
- Under 90%: none on the token line or the cost. The skill id is the id printed when `av-campaign-report-v5` was replaced.
- Morning smoke was not run. Snowflake was not called. The Messages API was called once.

## Assumed spend expected follows the bursts

One commit on `localhost`. The run log stays uncommitted. Home and portfolio attention counts stay in the app (`countPortfolioRows` / `isAttentionRow`, `homeAttentionLede`). They do not read Snowflake `V_LINE_ITEM_PACING` STATUS.

Assumed-spend lines (no source, offline family or digital with no source, not bonus or package inclusions) take expected to date from `assumedDailyCents` through the as-of. Delivered is that same sum when Snowflake has no positive `assumed_spend` row, so `deliveryStatusFromPct` is On track. The label stays Assumed spend. Reported lines keep the delivery-schedule split. Channel expected is the sum. Headline expected is that same sum through `resolveCampaignExpectedSpendToDate`.

golf025, published version 17009, as of 13 Oct 2026. NP7 is booked 24–30 Oct, so October newspaper contributes $0. The schedule slice that drops is 13/31 of the $2,000 October bucket, $838.71. Digital video is also assumed (four `no_adserving` lines). Its fee snapshot percent is 0, and its burst sum is $398.49 above the even slice, so the headline does not drop by the full newspaper gap.

| Channel | Expected before | Expected after | Assumed delivered | Status |
| --- | ---: | ---: | ---: | --- |
| Social | $38,842.32 | $38,842.32 | reported, unchanged | unchanged |
| Digital video | $14,423.91 | $14,822.40 | $14,822.40 | On track |
| Newspaper | $13,016.61 | $12,177.90 | $12,177.90 | On track |
| Digital display | $9,355.31 | $9,355.31 | reported, unchanged | unchanged |
| Programmatic video | $1,750.00 | $1,750.00 | reported, unchanged | unchanged |
| Radio | $0.00 | $0.00 | $0.00 | On track |
| OOH | $0.00 | $0.00 | $0.00 | On track |
| Headline | $77,388.15 | $76,947.93 | | drop $440.22 |

Channel cents after the change equal the headline. Snowflake `FIXED_COST_REPORTED_DAILY_FACT` returned no rows for these assumed line ids through 13 Oct, so both figures are the app sum. A positive Snowflake row is left as delivered.

golf025 Newspaper is not a mixed reported channel. The other two newspaper lines are package inclusions. Radio and OOH on this plan mix assumed lines with bonus or package inclusions, and those value-add lines stay off the assumed path. Five other live plans have a digital channel with both `no_adserving` and ad-served lines (BICAU006 programmatic video, sinch001 digital audio, BOSS010 programmatic display, PENFOLD018 programmatic video, BOSS011 programmatic display). A no-adserving line is assumed only when it also has no delivery source.

What each surface reads. Portfolio delivered is Snowflake `FIXED_COST_LINE_ITEM_FACT` when that spend is already above zero, and the app burst sum otherwise. Expected is `channelExpectedToDate` with the assumed lines. The campaign page, the strip, AVA, and reports all use `resolveCampaignExpectedSpendToDate` with those same lines. Campaign delivered adds snapshot assumed spend for line ids Snowflake has not already counted. Glance cards use the adjusted slice and, for an assumed card, the burst sum as delivered.

- SHA: 11828f61
- Checks: `channelExpectedToDate.test.ts`, `assumedSpendPacing.test.ts`, `assumedSpendSection.test.ts`, `channelCoverage.test.ts`, 34/34. Eslint on the touched files passed. `tsc --noEmit` still fails on `scripts/spikes/report-deck-skill/run-deck.ts`, which this commit does not touch.
- Under 90%: none on the burst rule or the golf025 figures.
- Morning smoke was not run. Snowflake was queried and returned no assumed-spend rows for golf025.

## Assumed spend refresh is set-based

One commit on `localhost`. The run log stays uncommitted. Nothing was applied in Snowflake.

`SP_REFRESH_ASSUMED_SPEND_DAILY` flattens `BURSTS_JSON.assumedDailyCents` once for every qualifying line. The nightly wrapper calls it with scope `changed` and no longer loops `SP_REFRESH_FIXED_COST_REPORTED_DAILY` per assume-spend id. The 3-day window and the partner-file / direct-digital loop stay. A filtered call of the inner procedure delegates that one line (`CALL ...('all', id)`) and then continues, so the JavaScript branch does not write a second copy. The unfiltered window skips assume-spend lines.

Scope `changed` with an empty `ASSUMED_SPEND_RUN_LOG` selects every qualifying line. Daily rows for a line in scope are deleted and inserted, so a day that left the JSON is removed. The old per-line MERGE kept those days. Burst and line-item facts are merged from the same rows.

Cancel the `SP_REFRESH_FIXED_COST_NIGHTLY` call that is still running before the rebuild, so two sessions do not write the same rows.

- SHA: efa49513
- Checks: no SQL linter in the repo. The inner procedure's JavaScript body passes `node --check` after the SQL quotes are unescaped. Snowflake was not called.
- Under 90%: none. The daily row is a flatten of `assumedDailyCents` (UTC today, cents / 100, last duplicate date wins, `IS_LOCKED` true).
- Morning smoke was not run.

## Deck builder insight cards, whole-number pace, content writer

One commit on `localhost`, files under `scripts/spikes/report-deck-skill/` only. The run log stays uncommitted. No API call.

KPI table and appendix slides take an `insight` field (max 160 characters) and paint a sand card with an Insight tag in the space under the table. A not-live list of one or two channels is rejected by `write_content.py` (`use cards`). The builder still falls back to cards, and those cards show planned budget, status when the row has one, and the note. `spendPacePct` is a whole-number percent in `slim-deck-payload.ts` (`35%`, `116%`). CTR, conversion rate, VTR and time elapsed stay at two decimal places, so the number check still matches the JSON the model sees. A label whose text is "Spend pace" is rendered as "Spend pace of expected to date". Step 2 of the skill is a pipe into `write_content.py`. No jq and no heredoc.

The local rebuild used the saved run 4 content (`out/hema007-v5-call1.json`, extracted to `out/hema007-v5-content.json`) plus the two insight lines the new slides require. That saved report-data was slimmed before this commit, so the rebuilt PDF still prints `34.85%` and `116.16%`. A new slim prints `35%` and `116%`.

`test_checks.py` printed `tests OK`. `tsx --test slim-deck-payload.test.ts` passed 3. `check_deck.py` printed `OK` on the rebuilt hema deck and on both hand-written decks. LibreOffice did not rewrite the PDF, so the PDF came from PowerPoint and the PNGs from `pdftoppm -r 50`. Contact sheet: `scripts/spikes/report-deck-skill/out/hema007-v5-sheet.png`.

- SHA: 3c07c2a5
- Checks: `test_checks.py` OK. `slim-deck-payload.test.ts` 3/3. `check_deck.py` OK on hema007-v5, test-hema007 and test-hema007-b. `write_content.py` printed OK on the cards fixture and the short-list error on the run 4 content.
- Under 90%: none on the formatter or the fallback. The rebuilt PDF still shows the old two-decimal pace strings because it was rendered from the saved report-data, not a new slim.
- Morning smoke was not run. Snowflake was not called. The Messages API was not called.

## Deck skill, Claude writes content.json

One commit on `localhost`, files under `scripts/spikes/report-deck-skill/` only. The run log stays uncommitted. No app code. curatif004 was not run.

Step 2 is write `content.json`. `write_content.py` is gone. The five font TTFs stay bundled in the skill (about 431 KB on the skill filesystem). They were not container-uploaded. A font upload would add five user-message blocks. The files are not prompt tokens unless a script reads them. `cache_control` is on the text block, which is the last block in the user message.

Local, no API. Both hand-written contents use every variant at least once. `check_deck.py` printed `OK` for both. `test_checks.py` printed `tests OK`: a missing key fails, a 300-character title is overflow, and `00FFFF` is a palette miss. Contact sheets: `scripts/spikes/report-deck-skill/out/test-hema007-sheet.png` and `scripts/spikes/report-deck-skill/out/test-hema007-b-sheet.png`.

New skill id `skill_01XxEgip7pYGXpUpHujs5d2s` (replaced `av-campaign-report-v5`). hema007 ran once. Model `claude-opus-5-5`, effort `high`. One call, `stop_reason` `end_turn`. No server-tool result exceeded 20,000 characters.

| Step | Tool | Chars | Status | Command |
| --- | --- | ---: | --- | --- |
| 1 | text_editor_code_execution | 4,876 | ok | view SKILL.md |
| 2 | bash_code_execution | 1,429 | ok | ls and summarise.py |
| 3 | bash_code_execution | 1,189 | ok | jq of formatted values |
| 4 | bash_code_execution | 46 | error | content.json heredoc; missing key CTR |
| 5 | bash_code_execution | 47 | ok | KPI labels changed to keys, rebuild, check OK |

Input 14, output 4,421, cache write 11,059, cache read 35,211. Run cost $0.1508. Under $0.60, so the model was not called again. Wall time of the call was 53,851 ms. Deck saved to `out/hema007-v5.pptx` (5,200,854 bytes).

The container check ended `OK` on the second build. The first failed because the KPI labels were typed text (`CTR`). The skill allows one fix pass. It did not view an image and did not read the builder scripts. Step 3 did print formatted payload values. That result was 1,189 characters, under the 20,000 breach line.

LibreOffice failed to convert, so the PDF came from PowerPoint and the PNGs from `pdftoppm -r 50`. Seven slides. Local `check_deck.py` printed `OK`. Contact sheet: `scripts/spikes/report-deck-skill/out/hema007-v5-sheet.png`.

- SHA: 306de315
- Checks: local `check_deck.py` OK on both test decks and on the API deck. `test_checks.py` OK.
- Under 90%: none on the token line or the cost. The skill id is the id printed when `av-campaign-report-v5` was replaced.
- Morning smoke was not run. Snowflake was not called. The Messages API was called once.

## Deck builder insight cards, content writer restored

One commit on `localhost`, files under `scripts/spikes/report-deck-skill/` only. The run log stays uncommitted. No API call.

`write_content.py` is back. Step 2 of the skill pipes content into it. No jq and no heredoc. A one or two channel not-live list is rejected (`use cards`). The builder still falls back to cards, and those cards show planned budget, status when the row has one, and the note. KPI table and appendix slides take an `insight` field (max 160 characters) and paint a sand card with an Insight tag in the space under the table. `spendPacePct` stays a whole-number percent in `slim-deck-payload.ts`. A label whose text is "Spend pace" is rendered as "Spend pace of expected to date".

Run 4 content was taken from `out/hema007-v5-call1.json`, with the KPI labels rewritten to `kpis.N.label` the way that run's fix pass did. `write_content.py` printed `OK`. The same script printed the short-list error and did not write the file. `test_checks.py` printed `tests OK`. `tsx --test slim-deck-payload.test.ts` passed 3. `check_deck.py` printed `OK` on hema007-v5, test-hema007 and test-hema007-b.

The PDF came from PowerPoint and the PNGs from `pdftoppm -r 50`. hema007-v5 is 7 slides. Social pace reads 116% and "Spend pace of expected to date". CTR stays 2.31%. The KPI slide has the sand Insight card. Search is one card with the planned budget, status and note. Contact sheets: `scripts/spikes/report-deck-skill/out/hema007-v5-sheet.png`, `test-hema007-sheet.png` and `test-hema007-b-sheet.png`.

- SHA: a34693db
- Checks: `test_checks.py` OK. `slim-deck-payload.test.ts` 3/3. `check_deck.py` OK on hema007-v5, test-hema007 and test-hema007-b. `write_content.py` OK on the run 4 content and the short-list error.
- Under 90%: none on the cards, the pace label, or the writer.
- Morning smoke was not run. Snowflake was not called. The Messages API was not called.

## Delivery data beats the assume-spend flag

One commit on `localhost`. The run log stays uncommitted. Snowflake was read, not written.

`isAssumedSpendLine` is true only when the snapshot rule says assume and the line has no loaded row with impressions, clicks, or spend through the as-of. Portfolio, campaign detail, the dashboard page, the delivery client, and the delivery snapshot all pass presence from data they already load. The snapshot map still writes `ASSUME_SPEND` without reading facts. The spike folder stays in the app tsconfig. `run-deck.ts` annotated the empty composites array so it is not inferred as `never[]`.

golf025, published version 17009, as of 13 Oct 2026. Digital video is the CM360 estimate again. Expected is the schedule slice, $14,423.91. Delivered is `estimateDirectDigitalSpend` on the four CPM lines (114,656 / 146,639 / 63,593 / 43,552 impressions): $5,503.52 + $8,211.79 + $1,060.09 + $726.02 = $15,501.42. Fee snapshot percent on those lines is 0. Newspaper, radio, and OOH stay assumed. Radio and OOH bursts contribute $0 through the 13th, so both cents are 0 and the pace is On track.

| Channel | Delivered | Expected | Status |
| --- | ---: | ---: | --- |
| Social | $38,602.00 | $38,842.32 | On track |
| Digital video | $15,501.42 | $14,423.91 | On track |
| Newspaper | $12,177.90 | $12,177.90 | On track |
| Digital display | $4,142.18 | $9,355.31 | Behind |
| Programmatic video | $0.00 | $1,750.00 | Behind |
| Radio | $0.00 | $0.00 | On track |
| OOH | $0.00 | $0.00 | On track |
| Headline | $70,423.50 | $76,549.44 | On track |

Channel expected cents equal the headline (7,654,944). Social delivered is `SOCIAL_PACING_FACT` spend. Display delivered is the CPM estimate on DD3 and DD4. Programmatic video (PV1, PV2) has no impressions, clicks, or spend through the 13th. The portfolio loader already bulk-loads ad-serving `PACING_FACT`, so no new per-line query was added.

Live plans on 13 Oct where the latest snapshot row has `NO_ADSERVING` and a fact row has impressions, clicks, or spend. Platform is the snapshot value. golf025's four rows have a blank platform.

| MBA | Line | Platform | Impressions |
| --- | --- | --- | ---: |
| bicau002 | bicau002pv1 | Channel Factory | 421,376 |
| bicau002 | bicau002pv2 | Channel Factory | 429,488 |
| bicau002 | bicau002pv3 | Channel Factory | 106,191 |
| bicau002 | bicau002pv4 | Channel Factory | 122,373 |
| bicau006 | bicau006pv1 | Channel Factory | 738,843 |
| bicau006 | bicau006pv5 | Channel Factory | 172,646 |
| golf025 | golf025dv1 | | 114,656 |
| golf025 | golf025dv2 | | 146,639 |
| golf025 | golf025dv3 | | 63,593 |
| golf025 | golf025dv4 | | 43,552 |
| penfold015 | penfold015pv1 | Channel Factory | 1,602,774 |
| penfold018 | penfold018pv1 | Channel Factory | 690,409 |

- SHA: 5f468a9e
- Checks: `tsc --noEmit` exit 0. `assumeSpendRule.test.ts`, `assumedSpendPacing.test.ts`, `channelExpectedToDate.test.ts`, `assumedSpend.test.ts`, `assumedSpendSection.test.ts`, 33/33. Eslint on the touched files passed.
- Under 90%: none on the predicate or the golf025 figures.
- Morning smoke was not run. Snowflake was queried read-only.

## Deck runs on the updated skill

One commit on `localhost` for the harness only. The run log stays uncommitted. The skill was not edited. The uploaded files are the `av-campaign-report-v5` tree at `3c07c2a5`. Skill id `skill_01RuYsGshDAyYM7GUKPiZ67j`, version `1791886105849032`. Model `claude-opus-5-5`, effort `high`. Payloads for September 2026 were rewritten with whole-number pace (`hema007-v6-report-data.json`, `curatif004-v6-report-data.json`).

hema007. One call, `stop_reason` `end_turn`. Wall time of the call 49,763 ms. Input 14, output 4,893, cache read 37,528, cache write 11,269. Cost $0.1618. Under $0.60.

| Step | Tool | Chars | Status | Command |
| --- | --- | ---: | --- | --- |
| 1 | text_editor_code_execution | 5,287 | ok | view SKILL.md |
| 2 | bash_code_execution | 1,429 | ok | summarise.py |
| 3 | bash_code_execution | 526 | error | content.json; titles were arrays |
| 4 | bash_code_execution | 3 | ok | write_content.py |
| 5 | bash_code_execution | 21 | ok | build_report.py |

The container did not run `check_deck.py`. Step 5 printed the pptx path and `OK` from the builder. Local `check_deck.py` printed `OK`. The number check failed. Shown slides are slide29–slide35. Stray figures: slide30 `2`, `4`; slide35 `71`, `3205`, `2,`, `97`, `2008`. LibreOffice failed to convert the pptx. PowerPoint wrote the PDF and `pdftoppm -r 50` wrote the PNGs. Contact sheet: `scripts/spikes/report-deck-skill/out/hema007-v6-sheet.png`.

curatif004 was not called. The number check failed, so the second run stopped.

- SHA: 1f6db688
- Checks: local `check_deck.py` OK. Number check failed, 7 stray figures. Container `check_deck.py` was not run.
- Under 90%: none on the cost or the stray list. The `2,` token is a text run, not a recomputed figure.
- Morning smoke was not run. Snowflake was not called. The Messages API was called once.

## Shared number check, check inside the build

One commit on `localhost`, files under `scripts/spikes/report-deck-skill/` only. The run log stays uncommitted. Skill id `skill_01R7k33HzDG28QY4xkUBEvAy`, version `1791888913381921` (replaced `av-campaign-report-v5` after the commit, before the run). Model `claude-opus-5-5`, effort `high`.

`stray_figures` in `check_deck.py` is the number check. `check()` and the run-deck local check both call it. It skips text in shapes named `Number dot`, and every text frame on the cloned thank-you slide's contact placeholder (body idx 102). A card with `$9,999` still fails, and a `42` in the thank-you title still fails. `build_report.py` runs that check at the end and exits non-zero when it finds an issue. Skill step 3 is the build command only.

hema007-v6, local, no API. `check_deck.py` printed `OK`. `--numbers` returned no stray figures, 7 slides. Rebuilding that saved content through `build_report.py` printed `OK` and exited 0.

curatif004, September 2026. One call, `stop_reason` `end_turn`. Wall time of the call 82,827 ms. Input 26, output 6,042, cache read 96,155, cache write 13,035. Cost $0.2053. Under $0.60, so the model was not called again. No server-tool result exceeded 20,000 characters.

| Step | Tool | Chars | Status | Command |
| --- | --- | ---: | --- | --- |
| 1 | text_editor_code_execution | 5,155 | ok | view SKILL.md |
| 2 | bash_code_execution | 1,601 | ok | ls and summarise.py |
| 3 | bash_code_execution | 403 | ok | summarise.py --help; stdout is a FileNotFoundError |
| 4 | bash_code_execution | 283 | ok | od of the summarise tail |
| 5 | bash_code_execution | 432 | ok | python print of keys and KPI labels |
| 6 | bash_code_execution | 256 | error | commentary is null; `len()` raised TypeError |
| 7 | bash_code_execution | 122 | ok | pace and channel figures |
| 8 | text_editor_code_execution | 74 | ok | create draft.json |
| 9 | bash_code_execution | 204 | error | write_content.py; KPI labels were typed text |
| 10 | bash_code_execution | 3 | ok | sed rewrote the labels; write_content.py printed OK |
| 11 | bash_code_execution | 3 | ok | build_report.py; stdout OK |

The container did not run `check_deck.py`. Step 11 is the build alone, and its stdout is `OK`, which is the check inside the build. The first write failed because the KPI labels were typed text (`CTR`). The skill allows one fix pass. It did not view an image and did not read the builder scripts. Steps 5 to 7 did print formatted payload values.

Local `check_deck.py` printed `OK`. `--numbers` returned no stray figures, 8 slides. Deck saved to `out/curatif004-v6.pptx` (5,203,244 bytes). LibreOffice failed to convert the pptx. PowerPoint wrote the PDF and `pdftoppm -r 40` wrote the PNGs. Contact sheet: `scripts/spikes/report-deck-skill/out/curatif004-v6-sheet.png`.

- SHA: 6a909d6f
- Checks: `test_checks.py` OK, including a card `$9,999` flagged and number dots plus the thank-you contact lines skipped. hema007-v6 local check OK. curatif004 local check OK. Container build stdout `OK`.
- Under 90%: none on the cost or the empty stray list. The harness process then exited on the LibreOffice convert, after the deck was saved.
- Morning smoke was not run. Snowflake was not called. The Messages API was called once.

## Deck text colours, cover, thank-you and headings

One commit on `localhost`: `lib/reports/campaignReport/buildCampaignReportDeck.ts` and its tests. The run log stays uncommitted. No other source file.

pptx-automizer opens `ppt/slides/slideN.xml` by that part number. The builder was passing the presentation-order index, so the data slides landed on Title Only - Black and the close landed on Blank - White. It now passes the part number for the layout it already named (Two Column 26, Statement - Sky 7, Thank You - Black 17, Cover - Sand 3, Title and Text 1).

On a layout whose name contains Black, or whose background is dark, titles and body are white and captions are `mutedOnBlack` (`#AEB9B0`). White and sand grounds stay ink. Headings are Plus Jakarta Sans ExtraBold, 36pt, or 32pt when the line is wider than the box, sentence case with a full stop. Body stays Plus Jakarta Sans. The cover title is the client and campaign (`Curatif FY27 campaign report.`) in the template title box, with MBA, period and as-of in the subtitle box. Spend pace is forest. A channel with $0 delivered and no impressions gets no channel slides and one `Not yet live` line on the summary. Empty lime pills are removed from the data slide.

- SHA: 4756f478
- Checks: `npx tsc --noEmit` exit 0. `next lint` on the four files, no warnings. Deck tests 10/10 (`deckGround`, `keyMetricsDeck`, `coverPhotoDeck`).
- Under 90%: none on the part-number map or the colours. The wrap threshold is an average ExtraBold advance of 0.56 em, checked by the 32pt and 36pt assertions.
- Browser smoke: localhost:3000 redirected to the Auth0 login. The September download was not taken from the app. The same builder was run on `AV-TP10-curatif004-2026-09.json` and PowerPoint exported the slides. Slide 1 is sand, logo clear, title `Curatif FY27 campaign report.` in the title position, details underneath. Slide 4 is white, `Social (Meta) data.` in ink, forest table header, no lime pills. There is no slide 11: TikTok is $0 with no impressions, so the deck is 9 slides and the thank-you is slide 9, white on the black thank-you layout. Slide 2 shows `Not yet live. Social (TikTok).` and spend pace `83.6%` in forest.
- Snowflake was not called. The Messages API was not called.

## Brand kit URLs from env

One commit on `localhost`: `scripts/spikes/report-deck-skill/fetch-kit.ts`. The run log stays uncommitted.

`scripts/check-hardcoded-urls.mjs` scans `app`, `lib`, `components`, and `scripts` (line 22). A URL literal is allowed only in `lib/config/endpoints.ts` (line 33, skipped at line 169), plus tests, comments, and the exemptions in `isExemptMatch` (line 127). `scripts/spikes` is not in `SKIP_DIRS` (lines 24–31). No exemption was added. App code passes by reading `process.env` through `withDefault` in that endpoints module. The spike has no code default: `BRAND_KIT_BASE_URL` is the host, and `assembled-brand-kit-v1.zip` and `assembled-brand-library-v1.zip` are appended. If the variable is unset, the script throws a message that names it and exits 1.

`.env.example` has the public host, matching the filled-URL convention in that file. `.gitignore` line 21 (`.env*`) ignores `.env.example`, so it is not in the commit. `env.local.example` is the tracked template and was left alone.

- SHA: 7f46ddd1
- Checks: `npm run check:hardcoded-urls` exit 0. `npx tsc --noEmit` exit 0. `next lint` on `fetch-kit.ts`, no warnings. With the variable unset, the script printed `BRAND_KIT_BASE_URL is unset. Set it to the public brand kit host.` and exited 1.
- Under 90%: none on the check rule or the env read.
- Snowflake was not called. The Messages API was not called.
