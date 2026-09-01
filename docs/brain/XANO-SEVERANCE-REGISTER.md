# Xano Severance Register

Living inventory of every Next.js surface that still depends on Xano. Built by X-AUDIT-1 (report-only). Source audit `av-review/xano-severance-audit-2026-08-02.md` was **not present in the repo** — structure and X1–X8 owner prompts below are synthesized from grepped call graphs + brain T6 checklist; replace if the audit file is restored.

**Scope:** `rg -li xano app/api/**/route.ts` → **77** files (prompt said ~79; delta = channel siblings that omit the string literal, e.g. some `prog-*` GETs, plus non-route mentions). Lib live-call set excludes types/tests/docs/infra-only URL builders.

**Verdict key**

| Verdict | Meaning |
|---|---|
| **DUAL-DONE** | Postgres path exists; Xano is dual/fallback until flag flip |
| **PORT** | Product path still live-depends on Xano for serve or mutate |
| **RETIRE(dead)** | Zero in-repo client `fetch` / import callers (proven) — safe delete candidate |
| **MIRROR** | Exists only for non-authoritative Xano write-back |
| **TOOLING** | Cron / admin / parity harness / warehouse feed — not product UX |
| **NOT-XANO** | Matched the string “xano” but makes no Xano HTTP call |

---

## Tallies (post X1–X9; refresh 2026-08-03)

Pre-series tallies (~33 PORT) are obsolete. Dominant remaining Xano HTTP is finance hub writes, pacing crawls, dashboards leftovers, and plan-version Xano PUT when `WRITE_BACKEND=xano`.

### `app/api` route files (77)

| Verdict | Count | Notes |
|---|---:|---|
| DUAL-DONE (read path at least) | ~28 | Channel GETs + billing overrides + PLAN_DETAIL + clients + approvals |
| PORT | ~22 | Finance writes, xero-queue exceptions, pacing/dashboard crawls, MBA PUT under xano write |
| RETIRE(dead) | ~16 | Channel POSTs×10 + TV `[id]` + campaigns×2 + accrual + check-id (X2) |
| MIRROR | 3 | `plans/save` + `admin/xano-mirror/retry` + `POST /api/mediaplans` master mirror (X9) |
| TOOLING | 5 | admin×3, cron sync, spend-parity |
| NOT-XANO | 3 | `chat-v2`, `cron/xero-sync`, `mediaplans/[id]/download` |

Method-split rows counted once per file under the **dominant remaining** verdict; X2 channel POST death is executed.

### Lib live-call files (~33)

| Verdict | Count |
|---|---:|
| DUAL-DONE | 14 |
| PORT | 12 |
| MIRROR | 2 (`mirrorToXano` + `writeMediaPlanMasters` / `writeClients` mirrors) |
| TOOLING | 3 |
| RETIRE(dead)/TOOLING | 1 (`xanoTargetLines` — app dead, migration script only) |

---

## §1 Suspected-dead verification

| Suspect | Proof | Verdict |
|---|---|---|
| **`XANO_DASHBOARDS_BASE_URL`** | Defined in `lib/api/xanoClients.ts`. Only runtime consumer: `lib/api/dashboard/global.ts` → `dashboard_monthly_{publisher,client}_spend` when `DATA_BACKEND_PLANS !== postgres`. Product routes `/api/dashboard/global-monthly-*-spend` call those helpers via cache. **Not dead.** Under local `DATA_BACKEND=postgres` the Xano branch is cold but code remains live for xano/shadow. | **PORT** (cold when plans=postgres) / product dual via `dashboardMonthlySpend.ts` |
| **`/api/finance/xero-queue` Xano bits** | Callers: `components/finance/sections/xero/XeroExceptionsPanel.tsx` GET+POST. Always hits `xero_sync_exceptions` via `xanoUrl(..., XANO_CLIENTS_BASE_URL)` + assign via `xanoFinancePatch`. Billing list half uses `readFinanceBillingRecords` (`DATA_BACKEND_FINANCE`). | **PORT** (exceptions always-Xano) — not dead |
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

## §3 Route register (`app/api`)

| Route | Method | Xano call | Flag | Callers (grep) | Verdict |
|---|---|---|---|---|---|
| `/api/admin/clients/refresh-slug` | POST | axios GET/PATCH `clients` via `getXanoClientsCollectionUrl` | always-xano | ZERO UI fetch | TOOLING |
| `/api/admin/fee-snapshots/resnapshot` | POST | `xanoFinancePost(FINANCE_EDITS_PATH)` | always-xano | ZERO UI fetch | TOOLING |
| `/api/admin/migration-diffs` | GET | Probes `readFinance` / `readMediaPlans` / schedule (shadow ring) | DATA_BACKEND shadow tooling | ZERO UI fetch | TOOLING |
| `/api/admin/xano-mirror/retry` | POST | `retryMirrorFromPostgres` → Xano write-back | MIRROR | toast/docs refs; no dedicated UI fetch found | MIRROR |
| `/api/billing-overrides` | GET | `readBillingOverridesForVersion` | DATA_BACKEND_FINANCE | `lib/finance/billingOverridesClient.ts` | DUAL-DONE |
| `/api/billing-overrides/replace_line` | POST | `writeBillingOverrides.replaceBillingOverrideLine` → PG | PG (X2) | `billingOverridesClient.ts` | DUAL-DONE (ported) |
| `/api/billing-overrides/reset_line` | POST | `writeBillingOverrides.resetBillingOverrideLine` → PG | PG (X2) | `billingOverridesClient.ts` | DUAL-DONE (ported) |
| `/api/campaigns/[mba_number]` | GET | — | — | ZERO fetch | RETIRE(dead) executed (410 X3) |
| `/api/campaigns/[mba_number]/billing-schedule` | GET | — | — | ZERO fetch | RETIRE(dead) executed (410 X3) |
| `/api/chat-v2` | POST | none (prompt text) | n/a | `ChatWidget.tsx` | NOT-XANO |
| `/api/clients` | GET | `readClientsList` / cache | DATA_BACKEND_CLIENTS | create/edit, scopes, admin | DUAL-DONE |
| `/api/clients` | POST | PG-first `writeClients` + Xano mirror (`xano_client_mirror_failed`) | PG authoritative (X1) | admin/clients flows | MIRROR (write) |
| `/api/clients/[id]` | GET | `readClientById` / slug helpers | DATA_BACKEND_CLIENTS | client surfaces | DUAL-DONE |
| `/api/clients/[id]` | PUT/PATCH | PG-first `writeClients` + Xano mirror | PG authoritative (X1) | client edit | MIRROR (write) |
| `/api/creative-assets` | GET/POST | `lib/creative/xanoCreativeAssets` → PG `creative_asset` | PG (X4) | Creative UI | DUAL-DONE (PG) |
| `/api/creative-assets/upload` | POST | createIdempotent → PG | PG (X4) | `CreativeUploadZone.tsx` | DUAL-DONE (PG) |
| `/api/creative-assets/ad-copy` | POST | getById PG | PG (X4) | `CopyChatPanel.tsx` | DUAL-DONE (PG) |
| `/api/creative-assets/[id]` | GET/PATCH/DELETE | xanoCreativeAssets → PG | PG (X4) | Creative UI | DUAL-DONE (PG) |
| `/api/creative-assets/[id]/download` | GET | getById PG | PG (X4) | Creative UI | DUAL-DONE (PG) |
| `/api/creative-assets/[id]/frame` | GET | getById PG | PG (X4) | Creative UI | DUAL-DONE (PG) |
| `/api/creative-assets/[id]/preview/[[...path]]` | GET | getById PG | PG (X4) | Creative UI | DUAL-DONE (PG) |
| `/api/cron/xano-line-item-sync` | GET | `runLineItemSnapshotSync` → Snowflake | `LINE_ITEM_SNAPSHOT_SOURCE` (X7 flip earned; prod postgres after X-series merge; parity until then) | Vercel cron (no app fetch) | TOOLING |
| `/api/cron/xero-sync` | GET/POST | none (comment only) | n/a | Vercel cron | NOT-XANO |
| `/api/dashboard/spend-parity` | GET | via `global.ts` → `xanoDashboardsUrl` when plans≠pg | DATA_BACKEND_PLANS indirect | ZERO product callers | TOOLING |
| `/api/finance/accrual` | GET | — | — | ZERO — UI uses billing+payables | RETIRE(dead) executed (410 X3) |
| `/api/finance/billing` | GET | Hub compose; hard-requires `XANO_CLIENTS_BASE_URL`; schedule via DATA_BACKEND_FINANCE_SCHEDULE; `xanoReferenceCache` | partial | `lib/finance/api.ts`, costs accrual | PORT |
| `/api/finance/billing/[id]` | PATCH | `writeFinance.patchFinanceBillingRecordById` | PG (T0-1) | `lib/finance/api.ts` | DUAL-DONE (PG writes) |
| `/api/finance/billing/line-items` | POST | `writeFinance.createFinanceBillingLineItem` | PG (T0-1) | `lib/finance/api.ts` | DUAL-DONE (PG writes) |
| `/api/finance/billing/line-items/[id]` | PATCH/DELETE | writeFinance patch/delete | PG (T0-1) | `lib/finance/api.ts` | DUAL-DONE (PG writes) |
| `/api/finance/billing/mark-billed` | POST | 410 gone | — | `lib/finance/api.ts` | RETIRED (lifecycle derived) |
| `/api/finance/billing/approve` | POST | `writeFinance.materialiseAndApproveFinanceBillingRecord` | PG (T0-1) | `lib/finance/api.ts` | DUAL-DONE (PG writes) |
| `/api/finance/billing/unapprove` | POST | `writeFinance.clearFinanceBillingRecordApproval` | PG (T0-1) | `lib/finance/api.ts` | DUAL-DONE (PG writes) |
| `/api/finance/billing/mark-exported` | POST | `writeFinance.setFinanceBillingRecordExported` | PG (T0-1) | `lib/finance/api.ts` | DUAL-DONE (PG writes) |
| `/api/finance/billing/notes` | POST | `writeFinance.setFinanceBillingRecordNotes` | PG (T0-1) | `lib/finance/api.ts` | DUAL-DONE (PG writes) |
| `/api/finance/data` | GET | `relevantPlanVersions` + `readClients`/`readPublishers` | DATA_BACKEND_PLANS/CLIENTS/PUBLISHERS | Excel export dialog, UpcomingBilling | DUAL-DONE (X3 ported) |
| `/api/finance/edits` | GET | `readFinance*` | DATA_BACKEND_FINANCE | `lib/finance/api.ts` | DUAL-DONE |
| `/api/finance/edits` | POST | `xanoFinancePost(finance_edits)` | always-xano | store / api | PORT |
| `/api/finance/forecast/snapshots` | GET/POST | `pgSnapshots` (DATABASE_URL; migration `0016`) | PG (X5) | Forecasting clients | DUAL-DONE (PG) |
| `/api/finance/forecast/snapshots/[id]/lines` | GET | `fetchFinanceForecastSnapshotLinesFromXano` | always-xano | Forecasting | PORT |
| `/api/finance/forecast/snapshots/variance` | POST | Xano snapshot + forecast loaders | always-xano | Variance client | PORT |
| `/api/finance/payables` | GET | `XANO_CLIENTS_BASE_URL` + publisher cache | always-xano env | `lib/finance/api.ts` | PORT |
| `/api/finance/publishers` | GET | `readFinanceBillingRecords` | DATA_BACKEND_FINANCE | payables aggregator | DUAL-DONE |
| `/api/finance/receivables/aa-media-plan` | GET | AA export via Xano auth | always-xano | `MediaPlanActionBar.tsx` | PORT |
| `/api/finance/saved-views` | GET/POST | readFinance + `xanoFinancePost(finance_saved_views)` | mixed | `lib/finance/api.ts` | PORT |
| `/api/finance/sow` | GET | `readScopeOfWork` | DATA_BACKEND_FINANCE | Client hub + scope extract | DUAL-DONE (X3 — no residual Xano imports) |
| `/api/finance/xero-queue` | GET/POST | `xero_sync_exceptions` + `xanoFinancePatch`; billing via readFinance | mixed | `XeroExceptionsPanel.tsx` | PORT |
| `/api/mba-line-approvals` | GET/PATCH | `readApprovals` / `writeApprovals` | DATA_BACKEND_APPROVALS + WRITE_BACKEND | `mbaLineApprovalsClient.ts` | DUAL-DONE |
| `/api/media-container-best-practice` | GET/POST | GET cache dual; POST `writeMediaContainerBestPractice` + Xano mirror | PG write (X4); GET via DATA_BACKEND_PUBLISHERS | admin, create/edit, trafficking | MIRROR (write) / DUAL-DONE (GET) |
| `/api/media-container-best-practice/[id]` | PUT | `writeMediaContainerBestPractice` + Xano mirror | PG write (X4) | admin | MIRROR (write) |
| `/api/media-details/[...path]` | GET | `readReferenceMediaDetail` / proxy | DATA_BACKEND (reference) | `lib/api.ts`, allowlist | DUAL-DONE |
| `/api/media-details/[...path]` | POST/PUT/PATCH/DELETE | allowlisted POST → `writeReferenceMediaDetail` + Xano mirror; else proxy | PG write (X4) for creates | staff proxy / create* helpers | MIRROR (write creates) |
| `/api/media_plans/[...path]` | GET | masters/versions/channel via DATA_BACKEND_PLANS dual | DATA_BACKEND_PLANS | `lib/api.ts`, dashboards | DUAL-DONE |
| `/api/media_plans/[...path]` | POST/PUT/DELETE | channel writes → 410 when `WRITE_BACKEND=postgres`; else Xano proxy | WRITE_BACKEND | `replaceChannelLineItems` (xano write path) | RETIRE(dead) channel writes under pg / PORT legacy xano |
| `/api/media_plans/cinema` | GET | dual channel handler | DATA_BACKEND_PLANS | `lib/api.ts` browser GET | DUAL-DONE |
| `/api/media_plans/cinema` | POST | — | — | ZERO — handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/digi-bvod` | GET | dual | DATA_BACKEND_PLANS | GET live | DUAL-DONE |
| `/api/media_plans/digi-bvod` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/influencers` | GET | dual | DATA_BACKEND_PLANS | GET live | DUAL-DONE |
| `/api/media_plans/influencers` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/integration` | GET | dual | DATA_BACKEND_PLANS | GET live | DUAL-DONE |
| `/api/media_plans/integration` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/newspaper` | GET | dual | DATA_BACKEND_PLANS | GET live | DUAL-DONE |
| `/api/media_plans/newspaper` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/production` | GET | dual | DATA_BACKEND_PLANS | GET live | DUAL-DONE |
| `/api/media_plans/production` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/prog-video` | GET | dual | DATA_BACKEND_PLANS | GET live | DUAL-DONE |
| `/api/media_plans/prog-video` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/search` | GET | dual | DATA_BACKEND_PLANS | GET live | DUAL-DONE |
| `/api/media_plans/search` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/social` | GET | dual | DATA_BACKEND_PLANS | GET live | DUAL-DONE |
| `/api/media_plans/social` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/television` | GET | dual | DATA_BACKEND_PLANS | `lib/api.ts` | DUAL-DONE |
| `/api/media_plans/television` | POST | — | — | handler deleted (X2) | RETIRE(dead) executed |
| `/api/media_plans/television/[id]` | PUT/DELETE | — | — | route deleted (X2); dead exports removed | RETIRE(dead) executed |
| `/api/mediaplans` | GET/POST | GET list dual; **POST** PG-first `writeMediaPlanMasters` + Xano mirror (`xano_master_mirror_failed`) | DATA_BACKEND_PLANS (list); PG identity (X9) | create page `createMediaPlan` | MIRROR (create) / DUAL-DONE (list) |
| `/api/mediaplans/mbanumber` | GET | `readPlanMasters` suffix scan | DATA_BACKEND_PLANS | create + edit | DUAL-DONE (X3 ported) |
| `/api/mediaplans/[id]/mbanumber` | POST | — | — | ZERO fetch | RETIRE(dead) executed (410 X3) |
| `/api/mediaplans/[id]/download` | GET | none (comment) | n/a | download UIs | NOT-XANO |
| `/api/mediaplans/mba/[mba_number]` | GET | `readMbaPlanDetail` only; `xano` → 410 | DATA_BACKEND_PLAN_DETAIL (default postgres) | edit/create/dashboard/trafficking | DUAL-DONE (X2 postgres-only) |
| `/api/mediaplans/mba/[mba_number]` | PUT/PATCH | Xano tables + publish | always-xano / WRITE_BACKEND for pg save path | edit/create | PORT |
| `/api/mediaplans/versions/[id]/billing-schedule` | PATCH | `writeBillingSchedule` → PG `legacy_schedules` + billing `schedule_months` | PG (X3) | ActionBar, inline schedule | DUAL-DONE (ported) |
| `/api/mediaplans/versions/[id]/documents` | POST | `XANO_MEDIA_PLANS` + `XANO_SAVE_FILE_BASE_URL` | always-xano | `lib/api.ts` | PORT |
| `/api/pacing/campaigns` | GET | search lines Xano + masters/versions dual | DATA_BACKEND_PACING partial | `CampaignsClient.tsx` | PORT |
| `/api/pacing/programmatic-campaigns` | GET | prog lines Xano + dual masters | DATA_BACKEND_PACING partial | `ProgrammaticCampaignsClient.tsx` | PORT |
| `/api/pacing/social-campaigns` | GET | social lines Xano + dual masters | DATA_BACKEND_PACING partial | `SocialCampaignsClient.tsx` | PORT |
| `/api/planning/audiences` | GET/POST | `xanoPlanningAudiences` → PG `planning_audiences` | PG (X4) | planner, create, PlannedAudience | DUAL-DONE (PG) |
| `/api/planning/audiences/[id]` | GET/PATCH | same → PG | PG (X4) | same | DUAL-DONE (PG) |
| `/api/planning/audiences/by-mba` | GET | same → PG (direct mba filter) | PG (X4) | PlannedAudienceSection | DUAL-DONE (PG) |
| `/api/plans/save` | POST | Postgres `savePlanVersion` + `mirrorPlanToXano` | WRITE_BACKEND + mirror | `buildPostgresSavePayload` / create+edit | MIRROR (+ PG write) |
| `/api/publishers` | GET | `readPublishersList` | DATA_BACKEND_PUBLISHERS | Publishers, create/edit | DUAL-DONE |
| `/api/publishers` | POST | `writePublishers` + Xano mirror (`xano_publisher_mirror_failed`) | PG authoritative (X4) | Publishers | MIRROR (write) |
| `/api/publishers/[publisherId]` | GET/PUT | GET dual list; PUT `writePublishers` + Xano mirror | PG write (X4) | Publishers UI | MIRROR (write) / DUAL-DONE (GET) |
| `/api/publishers/check-id` | GET | PG `publishers.publisherid` uniqueness | PG (X4) | ZERO in-repo fetch; external bookmarks | DUAL-DONE (ported) |
| `/api/scopes-of-work` | GET | `readScopeOfWork` | DATA_BACKEND_FINANCE | scopes, DashboardOverview | DUAL-DONE |
| `/api/scopes-of-work` | POST | `writeScopeOfWork` → PG `scope_of_work` | PG (X8) | scopes pages | DUAL-DONE (PG) |
| `/api/scopes-of-work/[id]` | GET/PUT | `writeScopeOfWork` / PG by id | PG (X8) | scopes pages | DUAL-DONE (PG) |
| `/api/scopes-of-work/generate-pdf` | POST | PG SOW by id → PDF | PG (X8) | scopes | DUAL-DONE (PG) |
| `/api/scopes-of-work/generate-scope-id` | POST | `fetchScopeOfWorkFromPostgres` | PG (X8) | create page | DUAL-DONE (PG) |

---

## §4 Lib live-call register

| File | Xano call(s) | Flag | Key consumers | Verdict |
|---|---|---|---|---|
| `lib/api/xanoPagination.ts` | `axios.get` paginated walk | callee-gated | dozens of readers + scripts | TOOLING (transport) |
| `lib/data/readClients.ts` | `clients` / `clients/:id` | DATA_BACKEND_CLIENTS | clientsCache, pacing auth, dashboards | DUAL-DONE |
| `lib/data/readPublishers.ts` | `get_publishers` | DATA_BACKEND_PUBLISHERS | publishersCache, payables | DUAL-DONE |
| `lib/data/readFinance.ts` | finance_* tables + SOW + overrides | DATA_BACKEND_FINANCE | finance routes, overlay, MBA GET | DUAL-DONE |
| `lib/data/readKpi.ts` | campaign/client/publisher_kpi | DATA_BACKEND_KPI | lib/kpi/*, pacing | DUAL-DONE |
| `lib/data/readPacing.ts` | masters, versions, orphan_fixes list | DATA_BACKEND_PACING | pacing row builders | DUAL-DONE |
| `lib/data/readMediaPlans.ts` | masters/versions/channel pages | DATA_BACKEND_PLANS | plan probes, PG reassembly | DUAL-DONE |
| `lib/data/readApprovals.ts` | mba_line_approvals | DATA_BACKEND_APPROVALS | mba-line-approvals route | DUAL-DONE |
| `lib/data/readReferenceMediaDetail.ts` | media-details reference tables | DATA_BACKEND reference | media-details route | DUAL-DONE |
| `lib/data/writePublishers.ts` | `post_publishers` / `edit_publishers` mirror | PG write + mirror | publishers API | MIRROR (write) |
| `lib/data/writeReferenceMediaDetail.ts` | media-details POST_* / site creates mirror | PG write + mirror | media-details route | MIRROR (write) |
| `lib/data/writeMediaContainerBestPractice.ts` | media_container_best_practice mirror | PG write + mirror | best-practice API | MIRROR (write) |
| `lib/data/writeApprovals.ts` | PATCH mba_line_approvals | WRITE_BACKEND | approvals API | DUAL-DONE |
| `lib/data/mirrorToXano.ts` | channel replace + version/master mirror | post-PG, gated by `XANO_MIRROR_ENABLED` (default off) | plans/save, xano-mirror/retry | MIRROR |
| `lib/api/fetchChannelLineItemsByMba.ts` | channel `media_plan_*` pages | DATA_BACKEND_PLANS | MBA GET, integrity, proxy | DUAL-DONE |
| `lib/api/replaceChannelLineItems.ts` | list/DELETE/POST channel endpoints | WRITE_BACKEND at caller | lib/api.ts, mirror | PORT |
| `lib/api.ts` | isomorphic: server→Xano direct; browser→`/api/*` | partial DATA_BACKEND_PLANS on GETs | create/edit, containers | PORT |
| `lib/api/mediaPlanVersionsCache.ts` | `media_plan_versions` completeness crawl | DATA_BACKEND_PLANS | dashboard global, media_plans | DUAL-DONE |
| `lib/api/mediaPlansListCache.ts` | versions + topline | DATA_BACKEND_PLANS | `/api/mediaplans` | DUAL-DONE |
| `lib/api/dashboard/global.ts` | `xanoDashboardsUrl` monthly spend | DATA_BACKEND_PLANS | dashboard spend routes | PORT (cold if plans=pg) |
| `lib/api/dashboard/{client,publisher,finance}.ts` | versions + channel fan-out | mostly unguarded | client/publisher/finance dashboards | PORT |
| `lib/finance/xanoFinanceApi.ts` | finance_edits POST, xero-queue, leftover GET helpers | none (writes) | `writeFinanceAuditEdits`, xero-queue | PORT (billing record writes moved to writeFinance) |
| `lib/finance/xanoReferenceCache.ts` | clients + get_publishers TTL | none | Ava, MBA GET, dashboard | PORT (retire behind dual readers) |
| `lib/finance/billingOverrides.ts` | attach helpers only (`attachOverridesToLineInputs` / `*FromRow`); Xano soft-fail GET `fetchBillingOverridesForVersion` **deleted** (MB-5 — returned `[]` on miss → silent manual erase) | n/a (pure) | savePlan, recompute, UI | RETIRE(dead fetch) / KEEP(attach) — reads via `readBillingOverridesForVersion` (PG dual) |
| `lib/data/writeMediaPlanMasters.ts` | PG insert `media_plan_masters` (seq) + Xano POST with explicit `id` | PG authoritative (X9) | `POST /api/mediaplans` | MIRROR (write) |
| `lib/finance/materialiseFinanceBillingRecord.ts` | `writeFinance.upsertFinanceBillingRecordByInvoiceKey` | PG (T0-1) | approve, notes | DUAL-DONE (PG writes) |
| `lib/finance/writeFinanceAuditEdits.ts` | finance_edits POST | none | finance edits | PORT |
| `lib/finance/relevantPlanVersions.ts` | masters + versions crawl | none | finance hub relevance | PORT |
| `lib/finance/forecast/snapshot/pgSnapshots.ts` | finance_forecast_snapshots(+lines) | DATABASE_URL | snapshot APIs | DUAL-DONE (PG) |
| `lib/finance/forecast/snapshot/xanoSnapshotQuery.ts` | re-exports PG; Legacy* for data-move | author-only Xano | migrate script | TOOLING |
| `lib/finance/forecast/snapshot/xanoPersistSnapshot.ts` | snapshots create (unused by app) | env base URL | migrate only | RETIRE(dead)/TOOLING |
| `lib/finance/forecast/targets/xanoTargetLines.ts` | revenue_forecast_lines | env; app uses pgTargetLines | `db:migrate-forecast-targets` only | RETIRE(dead)/TOOLING |
| `lib/data/writeKpi.ts` | campaign_kpi / client_kpi mirror | PG write + mirror | kpi API | MIRROR (write) |
| `lib/finance/forecast/server/loadFinanceForecastDataset.ts` | versions + clients + publishers pages | none (T6 soft catch) | forecasting booked mode | PORT |
| `lib/creative/xanoCreativeAssets.ts` | `creative_asset` CRUD via Drizzle | DATABASE_URL | creative-assets API, Ava | DUAL-DONE (PG) |
| `lib/planning/xanoPlanningAudiences.ts` | `planning_audiences` CRUD via Drizzle | DATABASE_URL | planning audiences API, Ava | DUAL-DONE (PG) |
| `lib/xano/fetchAllLineItems.ts` | all channel tables completeness | `LINE_ITEM_SNAPSHOT_SOURCE` (X7) | cron xano-line-item-sync | TOOLING |
| `lib/xano/ava.ts` | masters/versions via `readMediaPlans` PG helpers | DATABASE_URL | Ava tools | DUAL-DONE (PG) |
| `lib/xano/pacingOrphanFixes.ts` | POST pacing_orphan_fixes | write always-xano | assignOrphanLineItem | PORT |
| `lib/pacing/**/resolveLive*LineItems.ts` + `fetchSearchPacingCampaignRows.ts` | channel line pages | lines not dual | pacing campaign APIs | PORT |
| `lib/kpi/{campaign,client}Kpi.ts` | writes via `writeKpi` (PG+mirror); reads via readKpi | PG write (X5) | KPI sync / reports | MIRROR (write) |
| `lib/kpi/publisherKpi.ts` | KPI writes axios | write still Xano | publisher KPI admin | PORT (writes) |
| `lib/clients/fetchClientRowByUrlSlug.ts` | `readClientsList` (DATA_BACKEND_CLIENTS) | DATA_BACKEND_CLIENTS | dashboard slug, auth MBA, clients API | DUAL-DONE |
| `lib/mediaplan/reapUnpublishedStagedVersions.ts` | versions + channel DELETE | none | MBA GET cleanup | PORT |
| `lib/ops/health/checks.ts` | GET clients probe | none | ops-health cron | TOOLING |
| `lib/ava/tools/saveClientBrain.ts` | `updateClientPostgresFirst` (+ Xano mirror) | PG write (X8) | Ava | MIRROR (write) |
| `lib/data/writeScopeOfWork.ts` | `scope_of_work` insert/update/getById | DATABASE_URL | scopes-of-work API | DUAL-DONE (PG) |
| `lib/ava/tools/getBestPractice.ts` | media_container_best_practice | none | Ava | PORT |

**Excluded (infra / no live HTTP):** `lib/api/xano.ts`, `lib/api/xanoClients.ts`, `lib/data/backend.ts`, `lib/xano/mediaPlanTables.ts`, `lib/xano/campaignKpi.ts` (delegates to readKpi), `lib/snowflake/syncXanoLineItems.ts` (Snowflake only), `lib/data/savePlan.ts` (Postgres).

---

## §5 Missed by (missing) audit doc / surprises

1. **`av-review/xano-severance-audit-2026-08-02.md` absent** — restore or treat this register as SoT.
2. **77 ≠ 79** — string match undercounts channel routes without the word “xano”; overcounts 3 NOT-XANO comment hits.
3. **`/api/finance/billing` GET is not clean DUAL-DONE** — still hard-fails without `XANO_CLIENTS_BASE_URL` and still uses `xanoReferenceCache`.
4. **`fetchClientRowByUrlSlug` bypasses `DATA_BACKEND_CLIENTS`** — silent Xano dependency under postgres clients.
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
Author: npm run verify:line-item-snapshot-parity
```

### X8 — last Xano callers (env-literal severance)

Landed: SOW CRUD/PDF/scope-id → PG (`writeScopeOfWork`); `lib/xano/ava.ts` → PG masters/versions; creative assets + planning audiences already PG; `saveClientBrain` → `writeClients`; slug fetch → `readClientsList`; remaining `process.env.XANO*` outside `lib/api/xano.ts` + `lib/data/mirrorToXano*` + `scripts/` cleared via `peekXanoEnv` / `getXanoTimeoutMs` (acceptance grep ZERO). Does **not** mean all live Xano HTTP is gone — many callers still use `xanoUrl`/`getXanoBaseUrl` (T6/T7).

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
