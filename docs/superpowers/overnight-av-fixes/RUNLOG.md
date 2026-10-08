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

