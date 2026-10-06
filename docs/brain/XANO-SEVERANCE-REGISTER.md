# Xano Severance Register

Living inventory of every Next.js surface that still depends on Xano. Built by X-AUDIT-1 (report-only). Source audit `av-review/xano-severance-audit-2026-08-02.md` was **not present in the repo** — structure and X1–X8 owner prompts below are synthesized from grepped call graphs + brain T6 checklist; replace if the audit file is restored.

**Scope (HEAD re-audit):** every file under `app/`, `lib/`, `components/`, and `scripts/` that imports `lib/api/xano`, `lib/api/xanoClients`, `lib/api/xanoPagination`, `lib/xano/*`, or reads `process.env.XANO*`, or contains `xano.io`. `components/` matched **0** files. `scripts/_archive/xano/` is historical and excluded from the live inclusion set. §1, §5, and §7 below are the August record and were not re-audited. XS-1 removed `lib/data/mirrorToXano`.

**Verdict key**

| Verdict | Meaning |
|---|---|
| **DEAD** | `app/api` route with no in-repo caller and no cron entry, or a lib HTTP function with zero callers |
| **MIRROR** | Non-authoritative Xano write-back after Postgres |
| **PORT** | Product path still contains a Xano serve or mutate branch |
| **TOOLING** | Cron, admin probe, script, transport, or test — not product UX |
| **VAULT** | `a2.xano.io/vault` file URL |
| **NAME-ONLY** | Frozen name, or the file parses a Xano-shaped payload and makes no Xano HTTP call |
| **DONE** | XS-1 or XS-2a removed the Xano call. The row stays as the severance record. |

---

## Tallies

Re-audited inclusion set was **112** files (app 13, lib 75, scripts 24, components 0). XS-1 marks **36** of those rows **DONE**. XS-2a marks **6** more **DONE** (`xanoReferenceCache`, deleted `xanoFinanceApi`, `xero-queue`, `readFinance`, `relevantPlanVersions`, `loadFinanceForecastDataset`). That archive is history and is excluded from the live inclusion set. Live remainder is **70** files that still match the scope above.

| Verdict | Files |
|---|---|
| PORT | 34 |
| TOOLING | 16 |
| NAME-ONLY | 13 |
| MIRROR | 0 |
| VAULT | 7 |
| DEAD | 0 |
| DONE | 42 |

**Production env** (`vercel env ls production --non-interactive`, names only). XANO_* present: XANO_API_KEY, XANO_CLIENT_DASHBOARDS_BASE_URL, XANO_CLIENTS_BASE_URL, XANO_DASHBOARDS_BASE_URL, XANO_EXPORT_INSTANCE_URL, XANO_MEDIA_CONTAINERS_BASE_URL, XANO_MEDIA_DETAILS_BASE_URL, XANO_MEDIA_PLANS_BASE_URL, XANO_MEDIAPLANS_BASE_URL, XANO_METADATA_TOKEN, XANO_OVERALL_TIMEOUT_MS, XANO_PUBLISHERS_BASE_URL, XANO_SAVE_FILE_BASE_URL, XANO_SCOPES_BASE_URL, XANO_TIMEOUT_MS.

**Preview env:** the same set minus XANO_EXPORT_INSTANCE_URL.

Not set in either environment: XANO_BASE_URL, XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL, XANO_FINANCE_FORECAST_TARGETS_BASE_URL, XANO_WORKSPACE_ID. `XANO_MIRROR_ENABLED` is deleted from code (XS-1).

**Backend flags** (same value on production and preview; not secrets):

| Name | Value |
|---|---|
| DATA_BACKEND | postgres |
| DATA_BACKEND_APPROVALS | postgres |
| DATA_BACKEND_FINANCE_SCHEDULE | shadow |
| WRITE_BACKEND | postgres |

No other DATA_BACKEND_* exists. Unset domains fall back to DATA_BACKEND, so plans, clients, publishers, finance, kpi, pacing, and reference reads take the Postgres branch. DATA_BACKEND_FINANCE_SCHEDULE=shadow is the schedule-months serve mode (blob vs rows); it does not call Xano. XS-1 removed the Postgres-then-Xano mirror writes in `lib/data/writeClients.ts`, `writePublishers.ts`, `writeKpi.ts`, `writeMediaContainerBestPractice.ts`, `writeReferenceMediaDetail.ts`, and `writeMediaPlanMasters.ts`. The Postgres write is the whole function.

LINE_ITEM_SNAPSHOT_SOURCE is set on production (secret). Its value was not read. The code default is xano, which calls fetchAllXanoLineItems. Reach for that cron is **unknown**.

XS-2b reads KPI, publishers, clients, pacing, approvals, best practice, and publisher market share from Postgres, and writes `publisher_kpi` and `pacing_orphan_fixes` to Postgres. `lib/xano/pacingOrphanFixes.ts` is deleted. `lib/api/publishers.ts` still has `fetchPublishersFromXano` for the archived backfill script. `getClientBySlug` and the admin hub client list in `lib/api/dashboard/client.ts` read `readClientsList`. XS-2a removed finance HTTP. Tallies below are not recounted.

**Ten largest PORT files by non-test importers** (direct imports of the file; tests excluded). Dual-read modules rank high because many callers exist; those callers take the Postgres branch today.

| Importers | Production | File |
|---|---|---|
| 20 | only if flag flipped | lib/data/readMediaPlans.ts |
| 18 | only if flag flipped | lib/api.ts |
| 12 | only if flag flipped | lib/data/readClients.ts |
| 11 | only if flag flipped | lib/api/media-containers.ts |
| 9 | only if flag flipped | lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts |
| 7 | only if flag flipped | lib/clients/fetchClientRowByUrlSlug.ts |
| 6 | only if flag flipped | lib/data/readKpi.ts |

Tied at 6 and not in the ten: lib/data/readPublishers.ts. The ranking is not recounted after XS-2a; `readFinance`, `xanoReferenceCache`, `relevantPlanVersions`, and `loadFinanceForecastDataset` are DONE and left the list. lib/api/dashboard/client.ts has two non-test direct importers because pages import it through lib/api/dashboard.ts; getClientDashboardData is still called from the client and campaign dashboard pages and from /api/dashboard/[slug] and /delivered.

**Live a2.xano.io counts** (column::text ILIKE, same technique as §2; §2 byte totals are unchanged). media_plan_versions:

| Column | Non-null | Contains a2.xano.io | Contains /vault |
|---|---:|---:|---:|
| channel_flags | 1232 | 0 | 0 |
| legacy_schedules | 1232 | 0 | 0 |
| approved_slice | 217 | 0 | 0 |
| mba_scope | 28 | 0 | 0 |
| mi_resolution | 1232 | 0 | 0 |
| media_plan_file | 960 | 819 | 819 |
| mba_pdf_file | 960 | 819 | 819 |
| aa_media_plan_file | 286 | 261 | 261 |

Every other public jsonb/json column, plus text/varchar columns whose names match url, file, path, logo, blob, vault, pdf, image, or href (71 columns), returned 0 hits.

## §1 Suspected-dead verification

| Suspect | Proof | Verdict |
|---|---|---|
| **`XANO_DASHBOARDS_BASE_URL`** | Defined in `lib/api/xanoClients.ts`. Only runtime consumer: `lib/api/dashboard/global.ts` → `dashboard_monthly_{publisher,client}_spend` when `DATA_BACKEND_PLANS !== postgres`. Product routes `/api/dashboard/global-monthly-*-spend` call those helpers via cache. **Not dead.** Under local `DATA_BACKEND=postgres` the Xano branch is cold but code remains live for xano/shadow. | **PORT** (cold when plans=postgres) / product dual via `dashboardMonthlySpend.ts` |
| **`/api/finance/xero-queue`** | Callers: `components/finance/sections/xero/XeroExceptionsPanel.tsx` GET+POST. Exceptions, `assign_mba`, resolve, and dismiss are Postgres. | **DONE** (XS-2a) |
| **`/api/dashboard/spend-parity`** | Zero `fetch('/api/dashboard/spend-parity')` outside its own file. `NODE_ENV===production` → 404. | **TOOLING** (dev harness; no product callers) |
| **`XANO_CODEX_*` remnant** | `rg XANO_CODEX` over `*.ts/tsx/js/mjs` → **0 hits**. F-27 FIXED — Postgres Codex + `CODEX_V2`. | **Gone** |
| **Channel-route dead exports (S2 extend)** | Browser GETs: `lib/api.ts` `fetchLineItemsFromApi` → `/api/media_plans/{channel}`. Creates hit Xano direct from `lib/api.ts` (X7). Dedicated channel POSTs + `television/[id]` + TV CRUD exports **deleted (X2)**. Catch-all channel writes → 410 under `WRITE_BACKEND=postgres`. | Channel **POST RETIRE executed**; GETs **DUAL-DONE**; TV mutate **RETIRE executed** |

---

## §2 STORAGE COUNT (sizes X6 vault migration)

Columns: `media_plan_versions.{media_plan_file,mba_pdf_file,aa_media_plan_file}` (ETL from Xano `media_plan` / `mba_pdf` / `aa_media_plan`). Creative `blob_url`, Xero `pdf_file`, `clients.client_logo` scanned too.

### Postgres (`DATABASE_URL`, live query 2026-08-02)

| Column / table | Rows with vault | Σ `size` bytes | MiB |
|---|---:|---:|---:|
| `media_plan_versions.media_plan_file` | 819 | 33,069,082 | 31.5 |
| `media_plan_versions.mba_pdf_file` | 819 | 492,637,484 | 469.8 |
| `media_plan_versions.aa_media_plan_file` | 261 | 11,477,607 | 10.9 |
| **Plan files subtotal** | **1,899 field-hits** | **537,184,173** | **512.3** |
| `creative_asset.blob_url` | 0 | 0 | 0 |
| `xero_ar_invoices.pdf_file` | 0 | 0 | 0 |
| `xero_ap_bills.pdf_file` | 0 | 0 | 0 |
| `clients.client_logo` | 0 | 0 | 0 |

Every non-null plan file jsonb in PG currently carries `a2.xano.io/vault` (`mp_nonnull=819=mp_full_url`, same for mba/aa). Path-only `/vault` without host: 0.

### Xano export snapshot `exports/xano/2026-08-01` (second store)

| Field | Rows with vault | Σ `size` bytes | MiB |
|---|---:|---:|---:|
| `media_plan` | 847 | 33,920,379 | 32.3 |
| `mba_pdf` | 847 | 509,469,295 | 485.9 |
| `aa_media_plan` | 265 | 11,593,807 | 11.1 |
| **Subtotal** | **1,959 field-hits** | **554,983,481** | **529.3** |
| `creative_asset` export | 0 / 17 rows | 0 | 0 |
| `xero_ar_invoices` / `xero_ap_bills` | 0 | 0 | 0 |

**Delta export → PG:** ~28 fewer plan/mba file rows and ~17 MB — ETL lag / filtered versions, not a second vault population. **X6 migration volume ≈ 0.5–0.53 GiB**, almost entirely MBA PDFs + media-plan workbooks on `media_plan_versions`. Creative/Xero already off vault in both stores.

SQL used (Postgres):

```sql
-- see scripts/_tmp-vault-count.ts (ephemeral) / recreate from plan_hits CTE
-- WHERE *::text ILIKE '%a2.xano.io/vault%' OR path ILIKE '%/vault%'
```

---

## §3 Route register

In-repo callers grepped under components/, app/, and lib/. A route with no caller and no cron entry is DEAD.


| File | Fetches / writes | Flag | Production | Postgres equivalent | Verdict | Callers |
|---|---|---|---|---|---|---|
| `app/api/admin/users/mba-numbers/route.ts` | parses readClientsList body | DATA_BACKEND_CLIENTS (inside readClientsList) | no | lib/data/readClients.ts readClientsList | **NAME-ONLY** | app/admin/users/new/NewAdminUserForm.tsx |
| `app/api/admin/users/route.ts` | parses readClientsList body | DATA_BACKEND_CLIENTS (inside readClientsList) | no | lib/data/readClients.ts readClientsList | **NAME-ONLY** | app/admin/users/new/NewAdminUserForm.tsx |
| `app/api/admin/xano-mirror/retry/route.ts` | deleted (XS-1) | — | no | none | **DONE** | none; no cron |
| `app/api/finance/receivables/aa-media-plan/route.ts` | proxies aa_media_plan file URL with Xano auth header | unconditional | yes | media_plan_versions.aa_media_plan_file via resolveRelevantVersionAaMediaPlan | **VAULT** | components/finance/MediaPlanActionBar.tsx |
| `app/api/finance/xero-queue/route.ts` | GET open xero_sync_exceptions; assign_mba writes xero_ar_invoices and resolves the exception | — | no | lib/finance/xeroQueue.ts | **DONE** | XeroExceptionsPanel.tsx, XeroPageClient.tsx |
| `app/api/media-details/[...path]/route.ts` | GET reference tables from Postgres; POST reference writes; any other path returns 410 with the path | none | no | lib/data/referenceTables.ts fetchReferenceTableFromPostgres; createReferenceMediaDetailPostgresFirst | **DONE** | lib/api.ts → container get* helpers |
| `app/api/mediaplans/mba/[mba_number]/documents/__tests__/documents.route.test.ts` | fixture URL a2.xano.io/vault | unconditional | no | none | **VAULT** | — |
| `app/api/mediaplans/mba/[mba_number]/route.ts` | GET plan detail from Postgres. PUT returns 410 with the path and does not reap. PATCH updates media_plan_masters and, on publish, stamps published_at and published_version_id. Dead `detectDuplicateLineItemWarning` / `fetchXanoTableForMediaType` crawls are removed | none | no | readMbaPlanDetailFromPostgres; stampVersionPublicationByMbaVersion | **DONE** | edit/create pages still call PUT/PATCH on the Xano write branch |
| `app/api/mediaplans/[id]/download/__tests__/download.route.test.ts` | fixture URL a2.xano.io/vault | unconditional | no | none | **VAULT** | — |
| `app/api/media_plans/[...path]/route.ts` | GET masters/versions/channel lines from Postgres; any other path returns 410 with the path | none | no | readPlanMasters / readPlanVersions; createChannelLineItemsGetHandler | **DONE** | lib/api.ts browser GET |
| `app/api/plans/save/route.ts` | Postgres save only; mirrorPlanToXano removed (XS-1) | — | no | lib/data/savePlan.ts savePlanVersion | **DONE** | lib/mediaplan/buildPostgresSavePayload.ts; create + edit pages |
| `app/dashboard/[slug]/[mba_number]/page.tsx` | origin for relative plan-file paths (XANO_SAVE_FILE_BASE_URL / media-plans bases) | unconditional | yes | none (file bytes stay in version jsonb) | **VAULT** | page |
| `app/mediaplans/[id]/edit/page.tsx` | Looks up media_plan_versions.id in Postgres and redirects to the MBA editor | none | no | media_plan_versions | **DONE** | page |

## §4 Lib and scripts

Lib files. `Production` is whether that file's Xano HTTP runs under the env in Tallies.

| File | Fetches / writes | Flag | Production | Postgres equivalent | Verdict |
|---|---|---|---|---|---|
| `lib/api/dashboard/client.ts` | Client row via `readClientsList`. Plan rows via `loadClientDashboardPlanRows` (`client_id` set, `readPlanVersionsForMbas` with schedules). Published cut is `published_version_id` with `published_at`. Campaign status is the master status | none | no | lib/data/readClients.ts; lib/api/dashboard/planRows.ts | **DONE** |
| `lib/api/dashboard/finance.ts` | FYTD totals from `loadPublishedDashboardPlanRows` (pointer versions, master status) | none | no | lib/api/dashboard/planRows.ts | **DONE** |
| `lib/api/dashboard/global.ts` | dashboard monthly publisher/client spend from Postgres | none | no | lib/data/dashboardMonthlySpend.ts fetchDashboardMonthly*FromPostgres | **DONE** |
| `lib/api/dashboard/publisher.ts` | Publisher spend from `loadPublishedDashboardPlanRows` (pointer versions, master status) | none | no | lib/api/dashboard/planRows.ts | **DONE** |
| `lib/api/dashboard/shared.ts` | axios client with Xano auth headers (no request until a caller uses apiClient) | unconditional | yes | none | **TOOLING** |
| `lib/api/fetchChannelLineItemsByMba.ts` | channel lines from Postgres line_items | none | no | fetchLineItemsFromPostgresByEndpoint | **DONE** |
| `lib/api/media-containers.ts` | delivery and container line items from Postgres line_items | none | no | fetchLineItemsFromPostgresByEndpoint | **DONE** |
| `lib/api/mediaContainerBestPracticeCache.ts` | media_container_best_practice from Postgres | — | no | fetchMediaContainerBestPracticeFromPostgres | **DONE** (XS-2b) |
| `lib/api/mediaPlansListCache.ts` | latest versions and masters from Postgres | none | no | readMediaPlans | **DONE** |
| `lib/api/mediaPlanVersionHelper.ts` | filterLineItemsByPlanNumber only; getVersionNumberForMBA deleted (XS-1) | — | no | none | **DONE** |
| `lib/api/mediaPlanVersionsCache.ts` | latest version per MBA from Postgres | none | no | readPlanVersions / readPlanMasters | **DONE** |
| `lib/api/publishers.ts` | market share is Postgres published lines; `fetchPublishersFromXano` remains for the archived backfill | market share none | `fetchPublishersFromXano` only | lib/publishers/marketShare.ts | **PORT** (`fetchPublishersFromXano`) |
| `lib/api/replaceChannelLineItems.ts` | list/DELETE/POST channel media_plan_* | unconditional in this file; callers sit on the xano write path | only if flag flipped | lib/data/savePlan.ts savePlanVersion | **PORT** |
| `lib/api/xano.ts` | URL, auth header, timeout (no table of its own) | unconditional | yes | none | **TOOLING** |
| `lib/api/xanoClients.ts` | URL builders for clients, media plans, dashboards | unconditional | yes | none | **TOOLING** |
| `lib/api/xanoPagination.ts` | paginated GET walk | callee-gated | yes | none | **TOOLING** |
| `lib/api/__tests__/xanoPaginationCompleteness.test.ts` | test double / env stub | unconditional | no | none | **TOOLING** |
| `lib/api.ts` | version GETs from Postgres or /api/media_plans. `getProgVideoLineItemsByMBA` uses the browser `/api/media_plans` path only (no server `fetchAllXanoPages`). replaceChannelLineItems and createMediaPlanVersion throw. Channel save/create helpers that still name Xano URLs throw or remain for the editor Xano branch | none for version GETs | channel save helpers if that branch runs | readMediaPlans; referenceTables fetchReferenceTableFromPostgres | **DONE** (version GETs, reference getters, prog-video GET) |
| `lib/ava/tools/getBestPractice.ts` | media_container_best_practice from Postgres | — | no | fetchMediaContainerBestPracticeFromPostgres | **DONE** (XS-2b) |
| `lib/ava/tools/getCampaignContext.ts` | getAvaXanoSummary | unconditional | no | lib/xano/ava.ts getAvaXanoSummary → fetchPlan*FromPostgres | **NAME-ONLY** |
| `lib/ava/tools/getMediaPlanSummary.ts` | getAvaXanoSummary | unconditional | no | lib/xano/ava.ts getAvaXanoSummary → fetchPlan*FromPostgres | **NAME-ONLY** |
| `lib/ava/tools/getPacingSnapshot.ts` | getAvaXanoSummary | unconditional | no | lib/xano/ava.ts getAvaXanoSummary → fetchPlan*FromPostgres | **NAME-ONLY** |
| `lib/clients/fetchClientRowByUrlSlug.ts` | parses readClientsList | — | no | lib/data/readClients.ts readClientsList | **DONE** (XS-2b) |
| `lib/config/endpoints.ts` | default export host xg4h-uyzs-dtex.a2.xano.io | unconditional | no | none | **TOOLING** |
| `lib/config/__tests__/endpoints.test.ts` | fixture URL a2.xano.io/vault | unconditional | no | none | **VAULT** |
| `lib/creative/adCopy/avContext.ts` | getAvaXanoSummary | unconditional | no | lib/xano/ava.ts getAvaXanoSummary | **NAME-ONLY** |
| `lib/creative/searchCopy/avContext.ts` | getAvaXanoSummary | unconditional | no | lib/xano/ava.ts getAvaXanoSummary | **NAME-ONLY** |
| `lib/data/backend.ts` | no longer reads XANO_MIRROR_ENABLED (XS-1); DATA_BACKEND / WRITE_BACKEND remain | — | no | none | **DONE** |
| `lib/data/mirrorToXano.ts` | deleted (XS-1) | — | no | none | **DONE** |
| `lib/data/readApprovals.ts` | mba_line_approvals from Postgres | — | no | same file | **DONE** (XS-2b) |
| `lib/data/readClients.ts` | clients from Postgres | — | no | same file | **DONE** (XS-2b) |
| `lib/data/readFinance.ts` | finance reads are the Postgres functions (XS-2a) | — | no | same file | **DONE** |
| `lib/data/readKpi.ts` | campaign_kpi, client_kpi, publisher_kpi from Postgres | — | no | same file | **DONE** (XS-2b) |
| `lib/data/readMediaPlans.ts` | masters, versions, and channel lines from Postgres. probePlansShadowDiffs is a no-op | none | no | same file *FromPostgres | **DONE** |
| `lib/data/readPacing.ts` | media_plan_versions, pacing_orphan_fixes from Postgres | — | no | same file | **DONE** (XS-2b) |
| `lib/data/readPublishers.ts` | publishers from Postgres | — | no | same file | **DONE** (XS-2b) |
| `lib/data/readReferenceMediaDetail.ts` | reference media-detail tables from Postgres | none | no | fetchReferenceTableFromPostgres | **DONE** |
| `lib/data/writeApprovals.ts` | mba_line_approvals Postgres upsert/delete | — | no | same file | **DONE** (XS-2b) |
| `lib/data/writeClients.ts` | Postgres insert/update is the whole function (XS-1) | — | no | same file create/update | **DONE** |
| `lib/data/writeKpi.ts` | Postgres write is the whole function (XS-1) | — | no | same file | **DONE** |
| `lib/data/writeMediaContainerBestPractice.ts` | Postgres write is the whole function (XS-1) | — | no | same file | **DONE** |
| `lib/data/writeMediaPlanMasters.ts` | Postgres insert is the whole function (XS-1) | — | no | same file | **DONE** |
| `lib/data/writePublishers.ts` | Postgres write is the whole function (XS-1) | — | no | same file | **DONE** |
| `lib/data/writeReferenceMediaDetail.ts` | Postgres insert is the whole function (XS-1) | — | no | same file createReferenceMediaDetailPostgresFirst | **DONE** |
| `lib/data/__tests__/mirrorToXano.test.ts` | deleted with mirrorToXano.ts (XS-1) | — | no | none | **DONE** |
| `lib/data/__tests__/shadowDiff.test.ts` | clients, campaign_kpi, finance_billing_records | DATA_BACKEND_PUBLISHERS | no | none | **TOOLING** |
| `lib/docs/__tests__/fixtures/xanoEnvStub.ts` | test double / env stub | unconditional | no | none | **TOOLING** |
| `lib/docs/__tests__/planVersionFiles.test.ts` | fixture URL a2.xano.io/vault | unconditional | no | none | **VAULT** |
| `lib/docs/__tests__/servePlanFile.test.ts` | fixture URL a2.xano.io/vault | unconditional | no | none | **VAULT** |
| `lib/finance/api.ts` | parseXanoListPayload on /api/finance responses; no Xano HTTP | unconditional | no | the /api/finance routes it calls | **NAME-ONLY** |
| `lib/finance/forecast/server/loadFinanceForecastDataset.ts` | readPlanMasters / readPlanVersions / readClientsList / readPublishersList (XS-2a) | — | no | same file | **DONE** |
| `lib/finance/forecast/snapshot/xanoPersistSnapshot.ts` | finance_forecast_snapshots create | unconditional | no | lib/finance/forecast/snapshot/pgSnapshots.ts persistFinanceForecastSnapshotToPostgres | **TOOLING** |
| `lib/finance/forecast/snapshot/xanoSnapshotQuery.ts` | list/lines names call Postgres; *Legacy functions GET Xano | unconditional for Legacy helpers | no | pgSnapshots.ts fetchFinanceForecastSnapshot*FromPostgres | **TOOLING** |
| `lib/finance/forecast/targets/xanoTargetLines.ts` | revenue_forecast_lines | unconditional | no | pgTargetLines.ts (app routes). Finance shadow probe no longer calls this (XS-2a) | **TOOLING** |
| `lib/finance/relevantPlanVersions.ts` | readPlanMasters / readPlanVersions (XS-2a) | — | no | same file | **DONE** |
| `lib/finance/xanoFinanceApi.ts` | deleted (XS-2a) | — | no | lib/data/writeFinance.ts insertFinanceEdit / insertFinanceSavedView; readFinance | **DONE** |
| `lib/finance/xanoReferenceCache.ts` | readClientsList / readPublishersList; no HTTP (XS-2a) | — | no | same exports | **DONE** |
| `lib/kpi/publisherKpi.ts` | publisher_kpi reads and writes via readKpi / writeKpi | — | no | lib/data/writeKpi.ts | **DONE** (XS-2b) |
| `lib/mediaplan/reapUnpublishedStagedVersions.ts` | Deletes unpublished Postgres versions above the published watermark. line_items cascade. MBA PUT no longer calls it | none | no | media_plan_versions / line_items | **DONE** |
| `lib/ops/health/checks.ts` | Xano clients liveness GET removed. Remaining checks are warehouse, methodology, and Xero | none | no | none | **DONE** |
| `lib/pacing/admin/assignOrphanLineItem.ts` | pacing_orphan_fixes insert via createPacingOrphanFix | — | no | lib/pacing/admin/pacingOrphanFixes.ts | **DONE** (XS-2b) |
| `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` | search lines from Postgres line_items. campaign_kpi via lib/xano/campaignKpi → readKpi | — | no | readKpi | **DONE** (XS-2b) |
| `lib/pacing/plans/resolveLivePlanLineItems.ts` | channel lines from Postgres line_items | none | no | resolveFromPostgres | **DONE** |
| `lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows.ts` | campaign_kpi via readKpi (Postgres) | — | no | lib/data/readKpi.ts | **DONE** (XS-2b) |
| `lib/pacing/social/fetchSocialPacingCampaignRows.ts` | campaign_kpi via readKpi (Postgres) | — | no | lib/data/readKpi.ts | **DONE** (XS-2b) |
| `lib/snowflake/fetchAllPgLineItems.ts` | type import only; rows from Postgres | LINE_ITEM_SNAPSHOT_SOURCE | no | same file fetchAllPgLineItems | **NAME-ONLY** |
| `lib/snowflake/lineItemSnapshotParity.ts` | type import; parity math, no HTTP | LINE_ITEM_SNAPSHOT_SOURCE | no | none | **NAME-ONLY** |
| `lib/snowflake/pgLineItemSnapshotMap.ts` | type import; row map, no HTTP | unconditional | no | none | **NAME-ONLY** |
| `lib/snowflake/syncPgLineItems.ts` | calls fetchAllXanoLineItems unless source normalises to postgres | LINE_ITEM_SNAPSHOT_SOURCE | unknown | lib/snowflake/fetchAllPgLineItems.ts fetchAllPgLineItems | **TOOLING** |
| `lib/snowflake/syncXanoLineItems.ts` | MERGE into MART.XANO_LINE_ITEMS_SNAPSHOT; no HTTP | unconditional | no | none | **NAME-ONLY** |
| `lib/snowflake/tipScopeLineItems.ts` | filters snapshot rows; no HTTP | unconditional | no | none | **NAME-ONLY** |
| `lib/snowflake/__tests__/syncPgLineItems.parity.test.ts` | media_plan_search, media_plan_social | unconditional | no | none | **TOOLING** |
| `lib/snowflake/__tests__/syncXanoLineItemsPrune.test.ts` | media_plan_search | unconditional | no | none | **TOOLING** |
| `lib/xano/fetchAllLineItems.ts` | GET all channel media_plan_* tables | LINE_ITEM_SNAPSHOT_SOURCE (caller) | unknown | lib/snowflake/fetchAllPgLineItems.ts fetchAllPgLineItems | **TOOLING** |
| `lib/xano/pacingOrphanFixes.ts` | deleted | — | no | lib/pacing/admin/pacingOrphanFixes.ts | **DONE** (XS-2b) |

### Scripts (archived by XS-1; not in the live inclusion set)

Kept under `scripts/_archive/xano/` for history. They do not run. npm scripts that invoked them are removed. Not on any cron, gate, or CI path.

| File | Fetches / writes | Flag | Production | Postgres equivalent | Verdict |
|---|---|---|---|---|---|
| `scripts/_archive/xano/backfill-campaign-kpi-from-publisher.ts` | campaign_kpi, publisher_kpi, media_plan_master | — | no | none | **DONE** |
| `scripts/_archive/xano/backfill-delivery-schedule-client-paid.ts` | media_plan_versions | — | no | none | **DONE** |
| `scripts/_archive/xano/bulk-import-kpi-best-practice.ts` | publisher_kpi, media_container_best_practice, get_publishers | — | no | none | **DONE** |
| `scripts/_archive/xano/inspect-xano-shapes.mjs` | media_plan_versions_trimmed, media_plan_versions, media_plan_versions_latest | — | no | none | **DONE** |
| `scripts/_archive/xano/measure-strip.mjs` | XANO_MEDIA_PLANS_BASE_URL, XANO_API_KEY | — | no | none | **DONE** |
| `scripts/_archive/xano/migration/export-xano.ts` | mba_line_approvals | — | no | none | **DONE** |
| `scripts/_archive/xano/migration/migrate-forecast-snapshots-xano-to-pg.ts` | XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL | — | no | none | **DONE** |
| `scripts/_archive/xano/migration/shadow-smoke-approvals.ts` | mba_line_approvals | — | no | none | **DONE** |
| `scripts/_archive/xano/migration/shadow-smoke-finance.ts` | finance_billing_records, finance_billing_line_items, finance_edits, finance_saved_views | — | no | none | **DONE** |
| `scripts/_archive/xano/migration/shadow-smoke-kpi.ts` | campaign_kpi, client_kpi, publisher_kpi | — | no | none | **DONE** |
| `scripts/_archive/xano/migration/shadow-smoke-pacing.ts` | media_plan_versions, pacing_orphan_fixes, media_plan_master | — | no | none | **DONE** |
| `scripts/_archive/xano/migration/shadow-smoke-publishers-clients.ts` | get_publishers, clients | — | no | none | **DONE** |
| `scripts/_archive/xano/normalize-kpi-percent-scale.ts` | publisher_kpi | — | no | none | **DONE** |
| `scripts/_archive/xano/page-speed-after.mjs` | XANO_MEDIA_PLANS_BASE_URL, XANO_MEDIAPLANS_BASE_URL, XANO_PUBLISHERS_BASE_URL | — | no | none | **DONE** |
| `scripts/_archive/xano/page-speed-baseline.mjs` | XANO_MEDIA_PLANS_BASE_URL, XANO_MEDIAPLANS_BASE_URL, XANO_PUBLISHERS_BASE_URL | — | no | none | **DONE** |
| `scripts/_archive/xano/repro-blob-private-get.ts` | XANO_CLIENTS_BASE_URL, XANO_API_KEY | — | no | none | **DONE** |
| `scripts/_archive/xano/scan-kpi-percent-units.ts` | campaign_kpi, client_kpi, publisher_kpi | — | no | none | **DONE** |
| `scripts/_archive/xano/verify/finance-sections-summary-recon.ts` | media_plan_versions, media_plan_master | — | no | none | **DONE** |
| `scripts/_archive/xano/verify/line-item-snapshot-parity.ts` | Xano HTTP when the script is run | — | no | none | **DONE** |
| `scripts/_archive/xano/verify/probe-xano-forecast-targets.ts` | XANO_FINANCE_FORECAST_TARGETS_BASE_URL, XANO_CLIENTS_BASE_URL, XANO_API_KEY | — | no | none | **DONE** |
| `scripts/_archive/xano/verify/probe-xano-line-item-pagination.ts` | Xano HTTP when the script is run | — | no | none | **DONE** |
| `scripts/_archive/xano/verify/x3-legacy-hub-recon.ts` | get_publishers | — | no | none | **DONE** |
| `scripts/_archive/xano/verify-kpi-scale.ts` | publisher_kpi | — | no | none | **DONE** |
| `scripts/_archive/xano/x5-1-mba-line-approvals.mjs` | media_plan_version, mba_line_approvals | — | no | none | **DONE** |

### Frozen contracts

| Name | File | Xano HTTP | Verdict |
|---|---|---|---|
| MART.XANO_LINE_ITEMS_SNAPSHOT | lib/snowflake/syncXanoLineItems.ts | No. The file is a Snowflake MERGE. | NAME-ONLY |
| /api/cron/xano-line-item-sync | app/api/cron/xano-line-item-sync/route.ts | The route file does not HTTP. It calls runLineItemSnapshotSync, which calls fetchAllXanoLineItems unless LINE_ITEM_SNAPSHOT_SOURCE normalises to postgres. That value was not read. | NAME-ONLY for the route file; the sync is TOOLING with unknown reach |


## §5 Missed by (missing) audit doc / surprises

1. **`av-review/xano-severance-audit-2026-08-02.md` absent** — restore or treat this register as SoT.
2. **77 ≠ 79** — string match undercounts channel routes without the word “xano”; overcounts 3 NOT-XANO comment hits.
3. **`/api/finance/billing` GET is not clean DUAL-DONE** — still hard-fails without `XANO_CLIENTS_BASE_URL` and still uses `xanoReferenceCache`.
4. **`fetchClientRowByUrlSlug` reads Postgres** via `readClientsList` (XS-2b). It no longer has its own Xano GET.
5. **`lib/finance/xanoReferenceCache` duplicates dual readers** — candidate RETIRE behind `readClients`/`readPublishers`.
6. **Vault = plan PDFs only** — creative/Xero already Blob in both stores; X6 is narrower than a full-file migration.
7. **Channel POST dead wrappers** coexist with **live direct Xano creates** from `lib/api.ts` — deleting wrappers does not remove Xano writes.
8. **Dashboard spend product routes omit “xano”** in the route file — they still call `global.ts` which hits `XANO_DASHBOARDS_BASE_URL` when plans≠postgres.
9. **External bookmarks** of `/api/campaigns/[mba]` not greppable — RETIRE(dead) is in-repo only (confidence <90% for external).

---

## §6 Owner prompts (X1–X9)

Paste each block into a fresh Cursor agent. Change code only inside that prompt’s scope. Update this register + brain in the same commit.

### X9 — media_plan_master identity from Postgres (T7 blocker)

```
DONE: POST /api/mediaplans → createMediaPlanMasterPostgresFirst (seq sync + insert +
Xano mirror with explicit id; MBA uniqueness on PG). ensureMaster on /api/plans/save
is a logged safety net only. Live seq before: max_id=10000128, seq_last=10000262
(ahead — no author DDL). Caveat: Xano explicit-id POST ~80% reliable (same as X1 clients).
```

### X1 — Retire proven-dead API surfaces

```
PASTE INTO CURSOR — X1: retire proven-dead Xano API surfaces

Branch: localhost. Read docs/brain/XANO-SEVERANCE-REGISTER.md §1–§3 first.
DO (delete or stub-404 only after re-grepping ZERO callers):
1. Channel POST handlers with RETIRE(dead): cinema, digi-bvod, influencers, integration,
   newspaper, production, prog-video, search, social — remove POST exports; keep GET dual.
2. Delete or 410: /api/campaigns/[mba_number], /api/campaigns/[mba_number]/billing-schedule,
   /api/finance/accrual, /api/publishers/check-id.
3. Do NOT delete television POST/PUT/DELETE (still called from lib/api.ts).
4. Do NOT touch lib/api.ts direct Xano creates (that is X7).
5. Re-grep after each deletion; update XANO-SEVERANCE-REGISTER.md tallies.
REPORT: files deleted, residual callers if any, confidence.
```

### X2 — Flip / verify dual-done gates

```
PASTE INTO CURSOR — X2: verify dual-done Xano→Postgres flips

Branch: localhost. Report-only unless a defect blocks the flip.
PREREQ: local .env already DATA_BACKEND=postgres for most domains.
1. Live-verify DATA_BACKEND_PLAN_DETAIL=postgres on krusty015 + one multi-channel MBA
   (C-22); no silent Xano fallback; nextVersionNumber tip+1 OK.
2. Confirm dashboard monthly spend serves from schedule_months (plans=postgres) and
   XANO_DASHBOARDS_BASE_URL is unused on that path.
3. Probe /api/finance/billing without relying on xanoReferenceCache — list gaps that
   still require XANO_CLIENTS_BASE_URL (feed X3).
4. Update register: which DUAL-DONE rows become “flipped live”.
REPORT: green/red matrix, blockers, confidence.
```

### X3 — Port finance writes + xero-queue exceptions

```
PASTE INTO CURSOR — X3: port remaining finance Xano writes

Branch: localhost. Read docs/brain/modules/finance-billing.md + BLAST-RADIUS.
Port to Postgres (WRITE_BACKEND / DATA_BACKEND_FINANCE patterns; no local fee math):
1. billing_overrides replace_line / reset_line
2. finance_billing_records / line_items / mark-billed / notes / edits POST / saved-views
3. xero_sync_exceptions read/write used by /api/finance/xero-queue
4. Retire or dual-gate lib/finance/xanoFinanceApi.ts + materialiseFinanceBillingRecord
Keep Xero cron dual-writer rules (INVARIANTS). Tests for each mutate path.
Update XANO-SEVERANCE-REGISTER.md. REPORT: endpoints flipped, residual Xano.
```

### X4 — Port creative assets + planning audiences

```
PASTE INTO CURSOR — X4: port creative_asset + planning_audiences off Xano

Branch: localhost. Tables already in Postgres schema (ported).
1. Dual-read + postgres-write for lib/creative/xanoCreativeAssets.ts behind a flag
   (or DATA_BACKEND_CREATIVE if you add it — document in backend.ts + brain).
2. Same for lib/planning/xanoPlanningAudiences.ts.
3. Wire all /api/creative-assets/* and /api/planning/audiences* through the dual layer.
4. Ava tools getCreativeAssets / getSavedAudiences / upload paths must not bypass.
5. Vault: creative already Blob — do not re-upload; only row CRUD.
Update register. REPORT: routes dual/ported, tests.
```

### X5 — Port pacing line crawls + finance forecast booked + dashboards leftovers

```
PASTE INTO CURSOR — X5: kill remaining Xano plan crawls in pacing/finance/dashboards

Branch: localhost.
1. resolveLive*LineItems + fetchSearchPacingCampaignRows → DATA_BACKEND_PLANS /
   line_items (same reassembly as readMediaPlans).
2. loadFinanceForecastDataset / relevantPlanVersions → Postgres versions (close P-2).
3. lib/api/dashboard/{client,publisher,finance}.ts stop fetchAllXanoPages.
4. Do NOT repoint Snowflake XANO_LINE_ITEMS_SNAPSHOT here (X8 / T6).
Update READ-FAILURE-REGISTER + this register. REPORT: crawl sites removed, soak notes.
```

### X6 — Vault file migration (media_plan / mba_pdf / aa_media_plan → Blob)

**Decision: Vercel Blob (B)** — not Supabase Storage. Creative/Xero already Blob; ~512 MiB plan files enumerable from PG jsonb only (no vault listing API). Spec + caveats: `docs/superpowers/x6-vault-to-vercel-blob-2026-08-02.md` (checksum every copy; vault-URL read-fallback until a week of zero fallback reads).

```
PASTE INTO CURSOR — X6: migrate Xano vault plan files to Vercel Blob
(Decision locked: Vercel Blob. Checksum + vault fallback required.)
```

### X7 — Snowflake line-item snapshot from Postgres (parity → STOP flip)

```
DONE (code + verdict): tip-scoped PG sync + tip×tip parity; crawl complete=false on
early-stop. STOP: docs/superpowers/x7-line-item-snapshot-pg-stop-2026-08-02.md
VERDICT (Luke/Claude 2026-08-02): flip EARNED — Xano UI tip rows match PG
(glenda008 4/4, CHALLEN004 18/18); crawl under-counted (3 / 16). PG tip is
snapshot source of truth. Prod LINE_ITEM_SNAPSHOT_SOURCE=postgres ONLY after
X-series merge ships sync code; until then parity mode (MERGE still Xano).
golf022: zero versions both stores — NULL published_version_id correct;
scripts/fix-golf022-published-pointer.sql UPDATE unapplied / closed.
Author: npm run verify:line-item-snapshot-parity (removed in XS-1; script is scripts/_archive/xano/verify/line-item-snapshot-parity.ts and does not run)
```

### X8 — last Xano callers (env-literal severance)

Landed: SOW CRUD/PDF/scope-id → PG (`writeScopeOfWork`); `lib/xano/ava.ts` → PG masters/versions; creative assets + planning audiences already PG; `saveClientBrain` → `writeClients`; slug fetch → `readClientsList`; remaining `process.env.XANO*` outside `lib/api/xano.ts` + `scripts/` cleared via `peekXanoEnv` / `getXanoTimeoutMs` (`lib/data/mirrorToXano` deleted in XS-1) (acceptance grep ZERO). Does **not** mean all live Xano HTTP is gone — many callers still use `xanoUrl`/`getXanoBaseUrl` (T6/T7).

```
PASTE INTO CURSOR — X8: last Xano callers
(Acceptance: rg process.env.XANO outside mirror plumbing + scripts → ZERO)
```

---

## §7 Confidence notes

| Area | Confidence | Why |
|---|---:|---|
| Channel POST dead | 95% | Grep + create* still use MEDIA_PLANS_BASE_URL |
| campaigns/* + accrual + check-id dead | 90% | Zero in-repo fetch; external bookmarks unknown |
| XANO_CODEX gone | 99% | Zero code hits; F-27 documented |
| XANO_DASHBOARDS still live code | 95% | global.ts + spend routes; cold under plans=postgres |
| xero-queue not dead | 99% | XeroExceptionsPanel fetch |
| Storage sizes | 90% | PG live + export snapshot; live Xano API not re-paged today |
| X1–X8 prompt wording vs missing audit | 70% | Audit file absent — prompts synthesized |

---

## Maintenance

When a row’s verdict changes, edit this page in the same commit. Link from `docs/brain/README.md`. Do not treat RETIRE(dead) as deleted until X1 lands.
