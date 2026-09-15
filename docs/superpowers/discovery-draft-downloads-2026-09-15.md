# D1 — Draft downloads (Media Plan Excel + MBA PDF)

Status: implemented (DD-1..DD-3)  
Date: 2026-09-15  
Scope: implemented as DD-1..DD-3. Draft files come from `POST /api/mediaplans/draft-documents` using the save body (not a bespoke draft body; Excel is not client-side).  
Brain: `docs/brain/MAP.md` §1 Media plans; `docs/brain/modules/media-plans.md`; `docs/brain/BLAST-RADIUS.md` rows for `lib/generateMediaPlan.ts`, `lib/docs/buildMbaFromPersisted.ts`, `PlanWizardBottomBar.tsx`; `docs/brain/INVARIANTS.md` (approved_slice freeze, document generate = `published_at`, stored files served not generated on GET); `docs/brain/KNOWN-ISSUES.md` C-107 (fee rates outside draft snapshot).

Goal: a planner downloads the Media Plan Excel and the MBA PDF from an unpublished draft, on create and on edit, watermarked DRAFT on every page/sheet, without publishing and without writing a version. The bottom bar must make the state obvious: which document you are getting (draft vs published) and what Publish would change.

The parent prompt said “Price options A, B and C above” but did not include those option definitions in the paste. Section 5 prices the three architectures this codebase actually supports. Confidence on that reconstruction is in §7.

---

## 1. Inputs to each renderer

### 1.1 Media Plan Excel

Two call paths, two intermediate models, one workbook function.

**Workbook renderer** — `generateMediaPlan` (`lib/generateMediaPlan.ts:254-270`) takes:

| Arg | Type | Role |
|---|---|---|
| `header` | `MediaPlanHeader` (`:43-58`) | Cover block: client, brand, campaign, MBA, contact, plan version, PO, budget, **campaign status**, dates, logo |
| `mediaItems` | `MediaItems` (`:176-197`) | Per-channel `LineItem[]` (`:85-128`) — already burst-exploded rows |
| `mbaData` | optional Excel totals block | `gross_media[]` + `totals` (gross / fee / production / adserving / ex GST / inc GST) |
| `options` | `GenerateMediaPlanOptions` (`:249-252`) | `'aa'` omits fee and adserving rows |

Returns `Promise<ExcelJS.Workbook>`. Sheets: `'Media Plan'` (`:393`) and optional `'Campaign KPIs'` via `addKPISheet` (`:2146-2152`).

**Path A — live form (create + edit download)** does **not** read Postgres. Create `generateMediaPlanXlsxBlob` (`app/mediaplans/create/page.tsx:2962-3118`) and edit twin (`app/mediaplans/mba/[mba_number]/edit/page.tsx:9281-9417`) build:

1. `MediaPlanHeader` from `form.getValues()` (create `mp_client_name` / `mba_number`; edit `mp_clientname` / `mbanumber` — twin field split, MAP.md / BLAST-RADIUS).
2. `MediaItems` from container `*Items` state, filtered by `shouldIncludeMediaPlanLineItem`.
3. Totals via `buildMediaPlanWorkbookMbaData` (`lib/mediaplan/buildMediaPlanWorkbookMbaData.ts`) from `campaignFinancials.mbaScopeTotals` (`CampaignFinancials`).
4. AA variant: `filterMediaItemsForAdvertisingAssociates` + `buildAdvertisingAssociatesMbaDataFromMediaItems` (`lib/mediaplan/advertisingAssociatesExcel.ts:147, :188`) after `GET /api/publishers`.

`campaignFinancials` is `computeCampaignFinancials` (`lib/finance/computeCampaignFinancials.ts:898-902`) over `billingSaveInputs` (`LineItemInput[]` + `FeeLoading`). Create: `page.tsx:2095-2112`. Edit: `edit/page.tsx:6540-6558`. That is the Excel money engine on the live path — not `approved_slice`, not `schedule_months`.

**Path B — persisted regenerate** — `buildMediaItemsFromPersisted` (`lib/docs/buildMediaItemsFromPersisted.ts:320-375`) → `buildMediaItemsFromPlanDetail` (`:201-314`). Intermediate type: `BuildMediaItemsFromPlanDetailResult` `{ header: MediaPlanHeader, mediaItems: MediaItems, mbaData: MediaPlanWorkbookMbaData, publishers }` (`:194-199`).

Persisted tables/columns read:

| Table | Columns | Where |
|---|---|---|
| `media_plan_masters` + `media_plan_versions` + `line_items` | full MBA GET assemble (`readMbaPlanDetailFromPostgres`) | `:329-335` via `lib/data/readMbaPlanDetail.ts:258` |
| `mba_fee_snapshots` | `fees` | `:351-355` |
| `publishers` | full catalogue (AA filter) | `:361` `fetchPublishersFromPostgres` |
| version identity used into `MediaPlanHeader` | `brand`, `campaign_name`, `mba_number`, `client_contact`, `version_number`, `po_number`, `mp_campaignbudget`, `campaign_status`, `campaign_start_date` / `mp_campaigndates_start`, end twin | `:290-306` |
| `legacy_schedules.billingSchedule` | fee/adserving overlay when snapshot has no rates | `:268-269` |

Hydration: `mapHydrationToForm` + `explodeExcelLineItems` (`lib/docs/explodeExcelLineItems.ts:30-35`) → `LineItem[]`. Then `buildEditorLineItemInputs` → `computeCampaignFinancials` → `buildMediaPlanWorkbookMbaData`. Fee dollars still go through `burstAmounts` (`buildMediaPlanWorkbookMbaData.ts:4-7`).

Gated: `isVersionPublished` at `buildMediaItemsFromPlanDetail:204-208` and again at `buildMediaItemsFromPersisted:340-344`.

**Not read on the live Excel path:** `approved_slice`, `schedule_months`, `mba_fee_snapshots`, `snapshot_checksum`. Those exist only on the persisted regenerate path (and snapshots/checksum only after publish — INVARIANTS).

### 1.2 MBA PDF

There is no `lib/docs/mba*.ts` generator. The PDF is `generateMBA` (`lib/generateMBA.ts:91-94`), library **jsPDF**. Input type: `MBAData` (`:11-56`). Output: `Promise<Blob>`.

**Live generate route** — `POST /api/mba/generate` (`app/api/mba/generate/route.ts:23-48`) parses `{ mba_number, version_number }` plus optional live overlay keys (`lib/docs/mbaGenerateBody.ts:9-17`). Extra keys → 400 `CLIENT_TOTALS_REJECTED` (`:64-71`). It never accepts client totals. It calls `buildMbaFromPersisted` → `generateMBA`.

**`buildMbaFromPersisted`** (`lib/docs/buildMbaFromPersisted.ts:236-244`) intermediate type: `PersistedMbaRender` `{ mbaData: MBAData, checksumHex, footer, filename, versionId, versionNumber, campaignStatus, sliceSource }` (`:220-229`).

Persisted tables/columns:

| Table | Columns | Lines |
|---|---|---|
| `media_plan_versions` | `select()` whole row: `id`, `master_id`, `mba_number`, `version_number`, `campaign_name`, `brand`, `po_number`, `campaign_start_date`, `campaign_end_date`, `campaign_status`, `legacy_schedules`, **`approved_slice`**, **`published_at`** | `:255-264`, used `:325-337`, `:466-477` |
| `media_plan_masters` | `id`, `client_id`, `campaign_name` | `:280-284`, `:474` |
| `clients` | `mp_client_name`, `legalbusinessname`, `streetaddress`, `suburb`, `state_dropdown`, `postcode` | `:294-306`; schema `db/schema/ported.ts:113-121` |
| `mba_fee_snapshots` | `fees` | `:310-314` (checksum only at `:451`; fee **dollars** come from slice / schedule, not rates) |
| `schedule_months` | `version_id`, `line_item_id`, `component`, `basis`, `month`, `amount_cents`, `source` | `loadScheduleMonthRowsForVersions` `lib/finance/scheduleMonthsSource.ts:611-641` |
| `mba_line_approvals` | `line_item_id`, `approved` | `readMbaLineApprovals` `:340-351` |

Gated: `isVersionPublished(version)` `:273-277` → `PersistedDocError("NOT_APPROVED")`.

`approved_slice`: if missing/malformed, **derived** by `deriveApprovedSliceFromScheduleRows` (`lib/docs/deriveApprovedSliceFromSchedule.ts:30-33`) at read time — never written (`:354-358`; INVARIANTS). No slice and no billing rows → `MISSING_SLICE` (`:360-364`). No fee snapshot **and** no fee-component rows **and** no slice → `NO_FEE_BASIS` (`:96-99`).

Checksum: `computeSnapshotChecksum({ scheduleMonths, approvedSlice, feeSnapshot })` (`lib/docs/snapshotChecksum.ts:69-71`) → footer `v{n} · {hash8}` (`:77-81`) drawn on every PDF page (`generateMBA.ts:339-344`).

Optional live overlay (`mbaRenderFilters` / `deriveLiveMbaScopeSelection` `lib/docs/liveMbaScopeSelection.ts:18-36`): `selectedMonthYears` + `approvedLineItemIds` re-sum from **persisted** `schedule_months`. It does **not** apply unsaved line-item money. `liveCampaignDates` prints form dates only (`datesUnsaved` is not drawn — `lib/docs/__tests__/liveCampaignDates.test.ts:249-260`).

Historic regenerate with `NO_FEE_BASIS` uses explode adapter `buildMbaDataFromExplodeAdapter` → `MBAData` (`lib/docs/mbaDataFromExplode.ts:14-18`). Live `/api/mba/generate` still 422s on that code.

### 1.3 What `PlanDraftStateV1` has vs what renderers need

Type (`lib/mediaplan/drafts/types.ts:1-14`): `v, mbaNumber, masterId, baseVersionId, formValues, channels, meta { lineCount, budgetCents, tipBudgetCents?, tipLineIds? }`. Built by `buildPlanDraftSnapshot` (`lib/mediaplan/drafts/buildSnapshot.ts:5-42`) from form + channel bags only.

| Renderer input | On draft snapshot? |
|---|---|
| Campaign identity / dates / budget / channel flags (`formValues`) | Yes |
| Line items + bursts (`channels`) | Yes (same bags the Excel live path uses) |
| `MediaPlanHeader.campaignStatus` | Yes if `mp_campaignstatus` is in `formValues` |
| `approved_slice` | **No** — frozen only on publish (`lib/data/savePlan.ts:1114-1136`) |
| `schedule_months` | **No** — exploded inside `savePlanVersion` after `computeCampaignFinancials` |
| `mba_fee_snapshots` | **No** — insert gated `mode === "publish"` (INVARIANTS; `savePlan.ts:1194+`) |
| `snapshot_checksum` | **No** — publish-only |
| Campaign fee-loading `%` (`feesearch` / `feeradio` / …) | **No** — C-107. Lives in page `useState`, not `formValues` (`create/page.tsx:723`; `billingSaveInputs` `:2041-2062`) |
| Ad-serving rates (`adservaudio`, `getRateForMediaType`) | **No** — page state passed into `computeCampaignFinancials` (`create/page.tsx:2110-2111`) |
| Billing override rows | **No** — create `draftBillingOverrideRows` (`:2034-2039`); edit `mergePendingOverSavedExcludingCleared` (`edit/page.tsx:6462-6471`) |
| Partial MBA chips (`isPartialMBA`, `partialMBAMonthYears`, selected line ids) | **No** — page `useState` (`create/page.tsx:1008, :1931`) |
| Client postal address for MBA letterhead | **No** — create copies from selected client into local state (`:3303-3306`); persisted MBA reads `clients.*` |
| `mba_line_approvals` | **No** — Excel live path uses in-memory approval flags on `LineItemInput`; MBA persisted path reads the table |
| KPI sheet rows | **No** — `kpiRows` page state; optional third sheet |

---

## 2. Missing inputs — which pure functions exist, and can they run server-side?

| Missing | Pure function today | Runs without the page? | Tangled? |
|---|---|---|---|
| Schedule / billing months | `computeCampaignFinancials` (`lib/finance/computeCampaignFinancials.ts:898`) → `CampaignFinancials.billingSchedule` / `deliverySchedule`. Same engine `savePlanVersion` uses before exploding `schedule_months`. | **Yes**, given `LineItemInput[]` + `FeeLoading` + campaign dates + adserv rates + optional `selectedMonthYears`. | Inputs are assembled on the page: `buildEditorLineItemInputs(billingFeeSeedEnabledConfigs, { isPartialMBA, partialMBASelectedLineItemIds })` then `attachOverridesToLineInputs` (`create/page.tsx:2033-2040`). Configs are 20 container bags + burst slots — deep, but the **functions** are already in `lib/`. |
| `approved_slice` | `computeApprovedSlice({ financials, selectedMonthYears?, approvedLineItemIds? })` (`lib/finance/approvedSlice.ts:94`). Publish writes this (`savePlan.ts:1127-1131`). MBA render fallback is `deriveApprovedSliceFromScheduleRows` (`deriveApprovedSliceFromSchedule.ts:30`) which needs `schedule_months` rows. For a no-write draft, use `computeApprovedSlice` on in-memory financials — do **not** persist. | **Yes**. | Month chips + excluded line ids come from page Partial MBA state, not the snapshot. |
| Fee snapshot (rates JSON) | Not a separate builder. `assemblePlansSaveRequestBody` sets `feeSnapshot: feeLoading` (`lib/mediaplan/buildPostgresSavePayload.ts:260-261`). `buildFeeLoadingFromEditorFees` (`lib/finance/buildEditorLineItemInputs.ts:22-43` `EditorFeeState`) maps the 20 `fee*` useState fields. | **Yes** if those rates are posted. They are **not** in `PlanDraftStateV1` (C-107). | Create/edit each keep ~20 fee `useState`s plus adserv rates. Snapshot restore does not rehydrate them. |
| `snapshot_checksum` | `computeSnapshotChecksum` (`snapshotChecksum.ts:69`) — sha256 over schedule rows + slice + fee JSON. Node `crypto`. | **Yes** on the server from derived rows. Must not be labelled as a published PC3 footer on a draft. | — |
| Excel `LineItem[]` | Live path: container-emitted rows (already exploded). Persist path: `explodeExcelLineItems` (`explodeExcelLineItems.ts:30`) — client-safe, no `server-only`. | **Yes** from `channels` + fee %. | Live Excel and persist Excel can disagree (C-111: Excel labels take the line; persist explode uses `excelBuyTypeFromLine`). Draft downloads should pick one and stick. |
| MBA `MBAData` from form | No dedicated helper. Closest: `buildMediaPlanWorkbookMbaData` (Excel totals only) and `buildMbaDataFromExplodeAdapter` (`mbaDataFromExplode.ts:14`) which still needs a `MediaPlanHeader`. Full PDF `billingSchedule` wants month totals from `CampaignFinancials.billingSchedule` or `schedule_months`. | **Yes** if a small assembler is added in `lib/docs/` from `CampaignFinancials` + header + client address. Does not exist today. | Client address + fee rates + overrides still have to be in the POST body. |
| Client letterhead | Persisted path reads `clients`. Draft path would POST address fields or look up `clients` by `formValues` client id **if a master/client exists**. | Lookup is server-easy on edit. Create may have a selected client id in form state before a master exists. | Create copies address into component state (`:3303-3306`), not the snapshot. |

**Depth of page tangle:** the money math is already extracted. The **ingredient list** is not: fee `useState`, adserv rates, override rows, Partial MBA chips, client address. A posted `PlanDraftStateV1` alone is not enough to reproduce today’s Excel totals or a truthful MBA PDF (C-107). A draft-document POST must carry those extras, or they must be added to the snapshot first (that is a `buildSnapshot.ts` + twin-page change, separately sized).

`generateMBA` cannot run in the browser as written: `import { createHash } from "node:crypto"` and `readFileSync` (`lib/generateMBA.ts:4-5`). MBA is server-only. Excel already runs in the browser via dynamic `exceljs` (`generateMediaPlan.ts:271`).

---

## 3. Download routes

| Route | Takes | Auth | Returns | Gate |
|---|---|---|---|---|
| `GET /api/mediaplans/mba/[mba_number]/documents` (`app/api/mediaplans/mba/[mba_number]/documents/route.ts:16-32`) | MBA number in path | `checkClientMbaAccess` (`:25-26`) | JSON `{ publishedVersionId, versionNumber, publishedAt, files }` from **master `published_version_id`**. Unpublished → 200 with null ids/files (`readPublishedVersionDocuments.ts:38-40, :55-56`) | `isVersionPublished` on the pointed row; never `max(version_number)`, never `campaign_status` |
| `GET /api/mediaplans/[id]/download?kind=` (`app/api/mediaplans/[id]/download/route.ts:28-69`) | **Version id** in path; `kind=media_plan\|mba_pdf\|aa_media_plan` | `checkClientMbaAccess` on the version’s MBA (`:44-45`) | **Stream** attachment via `servePlanFileAttachment` (`lib/docs/servePlanFile.ts:39-75`). Private Blob through `getPrivateBlob`; never redirects at the blob URL. Missing url/path → 404 `{ code: "NOT_SAVED" }` — **never generate** (`download/route.ts:24, :59-66`) | `isVersionPublished` `:47-54` → 422 `unpublishedDocumentError("download")`. `isDownloadableCampaignStatus` **not called** |
| `POST /api/mba/generate` (`app/api/mba/generate/route.ts:23-48`) | JSON `{ mba_number, version_number }` + optional overlay | `requireRole(["admin"])` `:24-25` (not the client-tenant helper) | **Stream** PDF (`NextResponse(pdfBuffer)` `:49-57`) with `Content-Disposition` filename, `X-Snapshot-Checksum`, `X-Slice-Source` | `buildMbaFromPersisted` → `isVersionPublished` |
| `POST /api/mediaplans/versions/[id]/documents` (`app/api/mediaplans/versions/[id]/documents/route.ts:24-70`) | Version id; multipart `media_plan` / `mba_pdf` / `aa_media_plan` | `requireRole(["admin"])` | JSON `{ ok, files }` after Blob + jsonb write | No `isVersionPublished` here (comment `:18-22`: Stage 2a is plan content). Writes file columns only |
| `POST /api/mediaplans/versions/[id]/documents/regenerate` (`…/documents/regenerate/route.ts:15-54`) | Version id; optional `{ kinds, force }` | `requireRole(["admin"])` | JSON `{ ok, results }` | `not_published` → 422 `NOT_PUBLISHED` (`:52-54`) |

`isDownloadableCampaignStatus` (`lib/docs/isApprovedOrBeyond.ts:41-50`): leftover hotfix, true for every non-empty status except `"draft"`. Tests pin it (`lib/docs/__tests__/isDownloadableCampaignStatus.test.ts:10-12`). Generate/download **do not use it** (`isApprovedOrBeyond.ts:12-13`; INVARIANTS). UI copy `DOWNLOAD_BLOCKED_MESSAGE` (`:52-53`) vs bar copy `DRAFT_BLOCKS_DOWNLOAD_MESSAGE` (`lib/mediaplan/planWizardSaveBar.ts:127-128`) — two strings, both “Publish this … to download and send to client”.

**Client pages do not use the GET download route for the wizard buttons.** Edit MBA → `POST /api/mba/generate` (`edit/page.tsx:9251-9263`). Edit/create Excel → in-browser `generateMediaPlan`. GET download is for stored published files (list/hub).

Create MBA helper still POSTs generate (`create/page.tsx:2926-2959`) with `{ mba_number, version_number, campaign_status }` — it would 422 on an unpublished/missing version. The MBA **button** is disabled because the bar always requires `isPublished` (`PlanWizardBottomBar.tsx:208, :240`). Create hard-codes `isPublished = false` (`create/page.tsx:7414`).

Edit unpublished: `handleGenerateMBA` / `handleDownloadMediaPlan` toast `draftBlocksDownloadMessage` and return (`edit/page.tsx:9420-9424, :9463-9466`). Edit `isPublished` is `isVersionPublished({ publishedAt: selectedVersionPublishedAt })` (`:3019`) — the **selected version’s** `published_at`, not “has a working draft”.

**Asymmetry on a published tip with a working draft:** Excel is generated from **live form** (`generateMediaPlanXlsxBlob`). MBA is generated from **persisted published rows** plus overlay keys only. Unsaved line money is in the Excel and not in the MBA. The bar does not say so.

---

## 4. Watermark / banner primitives

**Neither renderer has a DRAFT stamp.**

MBA (jsPDF):

- Per-page hook already exists: `drawChecksumFooter` in a `getNumberOfPages` loop (`lib/generateMBA.ts:135-146, :339-344`). That is the place for a diagonal DRAFT (`doc.text(..., { angle: 45 })` + `GState` opacity) on every page.
- `checksumFooter` (`MBAData:42-43`) is `v{n} · {hash8}` — a published authenticity mark, not a draft banner. Do not reuse it as DRAFT.
- `datesUnsaved` (`:54-55`) is explicitly **not drawn** (test name even says “omits the watermark”, `liveCampaignDates.test.ts:249`).
- `scope` Partial MBA line (`mbaScope.ts:155-157`) is coverage copy, not a draft mark.
- Header `Date:` is Melbourne generation day (`buildMbaFromPersisted.ts:119-122, :456`).

Excel (ExcelJS, dynamic import `generateMediaPlan.ts:1, :271`):

- **No** `headerFooter` / `oddHeader` / `oddFooter` / `pageSetup` watermark in `lib/generateMediaPlan.ts` (search empty).
- Hook points: `workbook.addWorksheet('Media Plan')` (`:393`) and `'Campaign KPIs'` (`:2152`). Stamp **both**. ExcelJS `worksheet.headerFooter.oddHeader` / `oddFooter` (`&C&"…"` ) prints on every printed page; that is the reliable “every page” hook. A true diagonal sheet stamp is a large rotated cell (`style` already accepts `textRotation` at `:422`) or an image over the used range — print preview and screen view can disagree.
- Cover already writes **Campaign Status** into `G4` (`:448`) from `MediaPlanHeader.campaignStatus`. That is commercial status, not publication, and is not a watermark.
- AA is the same workbook with `mbaTotalsLayout: 'aa'` (`:249-251`) — no unpublished AA stamp (`advertisingAssociatesExcel.ts` is a publisher filter, not a banner).

---

## 5. Price options A, B, C

The paste did not define A/B/C. These are the three architectures that fit this repo and the goal (“no publish, no version write”).

### A — Client-side Excel + try to do MBA in the browser (or POST `MBAData`)

| | |
|---|---|
| Files | Twin pages (unlock edit Excel; create Excel already live), `PlanWizardBottomBar.tsx`, `generateMediaPlan.ts` (DRAFT on both sheets), possibly a browser-safe split of `generateMBA.ts` |
| New route? | No if MBA is ported to Web Crypto + `fetch` for the logo. Yes if you POST pre-built `MBAData` — and that **conflicts** with PC3 on the existing generate route (`mbaGenerateBody.ts:64-71` `CLIENT_TOTALS_REJECTED`) |
| Writes | None |
| Create vs edit | Create Excel already downloads (`gateDownloadsOnPublish={false}` `create/page.tsx:7500`; `handleDownloadMediaPlan` has no publish check `:7067-7088`). Edit Excel is blocked when `!isPublished` (`:9463-9466` + `gateDownloadsOnPublish` `:11796`). MBA button is `!isPublished` on **both** (`PlanWizardBottomBar.tsx:240`) |
| Risk | `generateMBA` is Node-only (`node:crypto`, `fs`). Client totals on MBA violate PC3. Live Excel vs persisted MBA already diverge on a published tip with a working draft. Fee rates still missing from the snapshot (C-107), so a restored draft Excel can be wrong on fees even if lines restore. |

### B — New ephemeral POST: live snapshot in, files out, no persist (recommended)

| | |
|---|---|
| Files | New `app/api/plans/draft-documents/route.ts` (or `/api/mediaplans/draft-documents`). New `lib/docs/renderDraftDocuments.ts` assembling `LineItemInput[]` → `computeCampaignFinancials` → `computeApprovedSlice` (in memory) → `generateMBA` + `generateMediaPlan`. Watermark helpers in both generators. Bar + twin pages. Tests beside `lib/docs/__tests__/`. **Do not** write `mba_pdf_file` / `media_plan_file`. |
| New route? | **Yes.** Existing GET download must keep “serve stored, never generate” (INVARIANTS). Existing `/api/mba/generate` must keep `isVersionPublished`. |
| Writes | **None.** Not a version, not `approved_slice`, not Blob pointers. Optional: refuse unless `requireRole(["admin"])` like generate, plus `checkClientMbaAccess` when `mbaNumber` exists. Create with no master: admin-only, MBA number may already be allocated (`/api/mediaplans/mbanumber`). |
| Create vs edit | Same POST body shape. Create: `masterId` null (C-118), IndexedDB draft only. Edit: snapshot + feeLoading + override rows + Partial MBA chips + client address. |
| Risk | Body must include C-107 fee rates, adserv rates, overrides, Partial MBA, address — or fees/letterhead/billing months are wrong. Payload can be large (working drafts have been 200KB+). Must never stamp a published-looking `v{n} · {hash8}` footer. Twin-page wiring is the usual half-ship risk. |

### C — `savePlanVersion` in `draft` / `new_version`, then lift `isVersionPublished` on generate

| | |
|---|---|
| Files | `savePlan.ts` (already writes `line_items` + `schedule_months` on draft overwrite), `buildMbaFromPersisted.ts`, `buildMediaItemsFromPersisted.ts`, `saveDocSteps.ts`, download route, bar |
| New route? | No |
| Writes | **A version row + lines + `schedule_months`.** Does **not** freeze `approved_slice` / fee snapshot / checksum (those are `mode === "publish"` only). MBA would hit `deriveApprovedSliceFromScheduleRows`. |
| Create vs edit | Create first save today is Publish (`SAVE_PUBLISHES_IMMEDIATELY = true`, `lib/mediaplan/resolvePostgresSaveMode.ts:11, :135`). Draft overwrite only exists when that flag is off. |
| Risk | **Violates the goal** (writes a version). While the interim flag is on, “draft save” **is** publish. Lifting the generate gate without a DRAFT stamp ships client-ready files from unpublished rows. Finance/pacing must not treat that cut as published (pointer + `published_at` stay the law — but a stray unpublished version is already a known transitional hazard in media-plans.md). |

**Recommend B at 80%.** It is the only option that produces an MBA PDF without a version write, without posting client totals into PC3, and without fighting `SAVE_PUBLISHES_IMMEDIATELY`. Put the DRAFT primitive in `generateMBA` / `generateMediaPlan` so client Excel (option A’s cheap half) cannot skip the stamp. Reject C.

Excel may stay client-side **after** the stamp lives in `generateMediaPlan`, as a latency win, but MBA should not. If Excel stays client-side, the bar and filenames must still say DRAFT, and fee-rate/override extras must be in the same in-memory path already used by `campaignFinancials` (they are — on the live page). The gap is restore-from-snapshot and any server MBA.

---

## 6. The bar

Read: `components/mediaplans/PlanWizardBottomBar.tsx`, `lib/mediaplan/planWizardSaveBar.ts`.

Today:

- Primary is Publish (flag on) or Save (`wizardPrimarySaveLabel` `:61-88`).
- Caret always includes **Publish & download all** when `SAVE_PUBLISHES_IMMEDIATELY` (`:102-107, :119-127`). Zip is **not** `downloadBlocked`; unpublished edit zip toasts the block message then `handleSaveAll()` (`edit/page.tsx:9587-9591`) — i.e. it publishes. Create zip (`:6945-7022`) has **no** publish gate and will call `generateMbaPdfBlob` → likely 422.
- Download group: MBA · Media Plan · Media Plan (AA) · Generate Naming. MBA disabled unless `isPublished`. Excel disabled if `gateDownloadsOnPublish && !isPublished`.
- Rail already explains publish: `PlanWizardSaveMessages` heading “When you publish” (`components/mediaplans/PlanWizardSaveMessages.tsx:118`) + `savePrimary` from `describePlanSavePill` (`lib/mediaplan/drafts/pill.ts:16-58`) + edit `saveTip` “Clients, documents and pacing use {vN}” (`PlanWizardSaveMessages.tsx:141`; `edit/page.tsx:11583-11586`).

### Proposed button set

Keep **Publish & download all** as the published-path zip only (caret on Publish). Never put draft files in that zip.

**Create — draft, no published version** (`isPublished` false, no master / no `published_version_id`):

| Control | Label | Behaviour |
|---|---|---|
| Primary | Publish | Unchanged — mints v1, client-ready docs |
| Caret | Publish and exit · Publish & download all | Unchanged; zip only after successful publish |
| Save draft | Disabled + `CREATE_SAVE_DRAFT_DISABLED_REASON` (`planWizardSaveBar.ts:104-105`) | Unchanged (C-118 / C-121) |
| MBA | **Download draft MBA** | Ephemeral DRAFT PDF; no version write |
| Media Plan | **Download draft Media Plan** | Live Excel + DRAFT stamp (create already generates; add stamp + filename) |
| Media Plan (AA) | hidden or **Download draft Media Plan (AA)** | Out of D1 goal; if kept, same DRAFT rules |
| Naming | Generate Naming | Unchanged (not a client MBA/plan) |
| Rail | `savePrimary`: “Publish creates v1” (`pill.ts:53`) | Add one line: “Downloads are drafts. Publish creates v1 for clients.” |

**Edit — draft on top of a published version** (working draft / unsaved form on a `published_at` tip — today’s common case while the flag is on):

| Control | Label | Behaviour |
|---|---|---|
| Primary | Publish | Cuts next published version |
| Caret | Publish and exit · Publish & download all | Zip = **published** MBA + media plan + naming after publish |
| Save draft | Save draft (flag-on) | Unchanged |
| MBA | split or two buttons: **Draft MBA** vs **Published MBA (vN)** | Draft = ephemeral from form. Published = existing `POST /api/mba/generate` / stored GET |
| Media Plan | **Draft Media Plan** vs **Published Media Plan (vN)** | Today’s live Excel is already the draft; it is mislabelled “Media Plan”. Published = GET download stream of stored xlsx |
| Rail `saveTip` | keep “Clients, documents and pacing use vN” | Add: “Draft downloads are not that file.” Pill already has “Publishing will create v{n}” (`pill.ts:55`) |

Do not leave a single “MBA” / “Media Plan” control on this state — that is how the current Excel-live / MBA-persisted split happens.

**Edit — published, no draft** (`isPublished`, no `activeDraft`, form clean):

| Control | Label | Behaviour |
|---|---|---|
| Primary | Publish | Next cut if they edit and publish |
| Caret | **Publish & download all** | Keep — client-ready zip |
| MBA / Media Plan / AA | **MBA** · **Media Plan** · **Media Plan (AA)** | Current published path. No DRAFT stamp. Filenames unchanged (`mbaDocumentFilename` `mbaScope.ts:159-168`; Excel `{client}-MediaPlan_{campaign}-v{n}.xlsx`) |
| Rail | `saveTip` vN | Unchanged |

### Make draft files impossible to mistake for client-ready

1. **Filename** — prefix `DRAFT-` and include `not-for-client`: e.g. `DRAFT-MBA_{client}_{campaign}_unpublished.pdf`, `DRAFT-MediaPlan_{campaign}-not-for-client.xlsx`. Never the published `MBA_…_v{n}.pdf` / `{client}-MediaPlan_…-v{n}.xlsx` shapes (`mbaScope.ts:167-168`; `create/page.tsx:3115-3117`; `edit/page.tsx:9413-9415`).
2. **Toast** — not “Success / MBA generated successfully” (`edit/page.tsx:9447-9450`, `create/page.tsx:3143-3146`). Use “Draft MBA downloaded — not for the client. Publish to issue vN.” Variant default, not success-as-shipped.
3. **Bar copy** — labels **Download draft …**; `title`/hint “Watermarked DRAFT. Clients still have vN.” Disable published-looking primary colours on draft buttons if they currently use `bg-primary` / `bg-accent` (`PlanWizardBottomBar.tsx:242-246, :256`). Keep Publish as the only client-ready action.
4. **File interior** — diagonal DRAFT on every PDF page (jsPDF loop `:339-344`) and Excel header/footer + both sheets. Campaign Status `G4` is not enough.

---

## 7. Below 90% confidence

1. **Options A/B/C were not in the pasted prompt** (~70%). If Luke’s A/B/C were different (e.g. A = unlock Excel only), re-price against those names before a prompt pack.
2. **Working-draft-on-published is the real edit “draft” while `SAVE_PUBLISHES_IMMEDIATELY` is true** (`resolvePostgresSaveMode.ts:11`). A true unpublished version row is rare under the flag. The bar states in §6 assume that interim. If the flag flips off, “draft with no published version” on edit (`uiMode: "overwrite"`, pill `pill.ts:39-40`) becomes live again — same draft buttons, different Publish copy.
3. **`getRateForMediaType` / client fee apply on create vs edit** — not line-audited end to end for every channel. Adserving $0 if rates are omitted is a known gotcha (`edit/page.tsx:6555-6557`). Confidence the posted body must include those rates: **high**. Confidence every rate lives only in those useStates: **~85%**.
4. **Excel diagonal vs header/footer** — ExcelJS header/footer is the print-page primitive; a true on-screen diagonal may need an image. ~85% that header/footer + a large rotated “DRAFT” cell is enough for “every sheet”.
5. **Create “Publish & download all” 422** — inferred from `handleSaveAndDownloadAll` calling `generateMbaPdfBlob` with no publish check (`create/page.tsx:6973-6974`) plus generate’s `isVersionPublished` gate. Not executed in this session. ~90%.
6. **AA / Naming** — out of the stated goal. AA is the same Excel generator; Naming is a different POST. Whether draft AA must ship in D1 is a product call.
7. **Client-role vs admin on a new draft route** — `/api/mba/generate` is admin-only; GET download is tenant-scoped. Wizard users are staff. ~85% that `requireRole(["admin"])` matches generate; confirm if managers still exist in RBAC.
8. **LineItem live vs `explodeExcelLineItems`** — using container rows for draft Excel (today) vs explode (regenerate) can differ on buy type / fee gross. Pick one in the implementation pack. ~80% they already differ on some OOH bonus lines (C-111).
)
</tool_result>