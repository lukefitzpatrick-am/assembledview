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
  - Night 1 `db/migrations/0092_revoke_published_pointer_fn_execute.sql` is still not applied.
- The Night 1 money questions are already in the code. C-155: full-scope Total Ex GST includes client-pays net media. Billing months exclude it. The agency still bills the fee. C-156 (`c1e7d75c`): cinema Avg. Rate is gross divided by screens. Biddable CPM still multiplies by 1000.
- `test:mba-live-dates` is a new failure on HEAD. See the checks below. It was not fixed in this wrap-up.

Migrations authored tonight, all NOT applied: `0093_overdue_digest_sends.sql`, `0094_campaign_insights_action_outcome.sql`, `0095_report_runs.sql`. `0090` and `0091` are marked authored, not applied, in the brain. They were not part of tonight's prompt list.

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

