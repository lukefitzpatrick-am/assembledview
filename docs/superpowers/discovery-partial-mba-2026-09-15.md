# D2 — Partial MBA as it exists today

Status: implemented (PM-1..PM-4)  
Date: 2026-09-15  
Scope: read-only. No app code changed.  
Brain: `docs/brain/MAP.md` §1 Media plans + §2 Finance; `docs/brain/modules/media-plans.md`; `docs/brain/modules/finance-billing.md`; `docs/brain/INVARIANTS.md` (approved_slice freeze-once; live Partial MBA overlay never writes the slice; absence of `mba_line_approvals` = all-in); `docs/brain/KNOWN-ISSUES.md` C-57, C-94, C-95, C-100, C-103; `docs/brain/BLAST-RADIUS.md` rows for `buildMbaFromPersisted`, `savePlan`, `mba-line-approvals`.

Goal: a planner sends a client an MBA for part of a plan (some lines, some months, or some channels), gets it approved, books that part, later sends another MBA for more. Finance bills only what was approved. This maps the current mechanism so a new process can be proposed.

Homonyms excluded from §1: TypeScript `Partial<T>`; dashboard **live scopes of work** (`components/dashboard/DashboardOverview.tsx`); finance-period run-item `status: "excluded" | "held"` (`lib/finance/periods/types.ts`) — those are not MBA line ticks.

---

## 1. Definitions (file:line)

### partial / Partial MBA

- `isPartialMBA` (`app/mediaplans/mba/[mba_number]/edit/page.tsx:2277`, twin `app/mediaplans/create/page.tsx:1008`) — page boolean. When false, `resolveApproval` treats every line as in. Reads React state, not Postgres.
- `partialMBASelectedLineItemIds` (edit `:2298`) — per-media canonical line ids currently ticked in. Source of `LineItemInput.approval`.
- `partialMBAMonthYears` (edit `:2277` region; month chips) — months in the MBA. Live financials only unless also sent on save (they are not — §2).
- `MbaDocumentScope.partial` (`lib/docs/mbaScope.ts:17, :116-117`) — true when included countable lines < total or some billing months dropped. Reads `schedule_months` + `MbaRenderFilters`.
- `partialApproval` blob (`lib/mediaplan/partialMba.ts:327-343`, MBA PUT `app/api/mediaplans/mba/[mba_number]/route.ts:1070-1084`) — metadata copied onto every billing-schedule month (`isPartial`, selected months, channel ticks, totals). Reads client body; written only on the legacy MBA PUT path, not `savePlanVersion`.
- Panel label “Partial MBA · X of Y” (`lib/finance/panelIndicatorsFromCampaignFinancials.ts:37-38, :69-74`) — presentation from `CampaignFinancials.perLine.flags.excluded` plus the form flag.

### excluded

- `LineItemApproval = "approved" | "excluded"` (`lib/finance/campaignFinancials.types.ts:89`) — engine stamp on `LineItemInput`.
- `resolveApproval` (`lib/finance/buildEditorLineItemInputs.ts:166-181`) — Partial off → `"approved"`; missing channel key → in; empty selected array → all excluded for that channel; else Set membership. Reads `partialMBASelectedLineItemIds`.
- `flags.excluded` (`lib/finance/computeCampaignFinancials.ts:491`) — `line.approval === "excluded"`. Billing explode skips these; delivery keeps them (`lib/finance/attachScheduleLineDetail.ts:229-231`).
- Excel note (`lib/mediaplan/excludedMbaScopeNote.ts:13-24`) — lines with `flags.excluded` or `approved === false`; copy only, does not remove rows from channel sheets.
- `mba_line_approvals.approved = false` (`lib/data/writeApprovals.ts:22-26, :66-84`) — exclusion row. `approved: true` **deletes** the row (absence = in).
- Finance periods `status: "excluded"` (`lib/finance/periods/reviewItem.ts:37-44`) — operator drop of a run item (ABN/review). Does **not** read MBA ticks.

### approval

- Line tick: `line.approved` Switch in `components/billing/MbaBillingModal.tsx:529-538` → `onToggleLineApproved` → `handleMbaBillingToggleLine` (edit `:10264`).
- Save payload field `approval?: "approved" | "excluded"` (`lib/mediaplan/plansSaveBodySchema.ts:55`, stamped in `buildSavePlanLineItemsFromSnapshots` `lib/mediaplan/buildPostgresSavePayload.ts:80-214`).
- `approved_in_version` column (`db/schema/planCore.ts:188`) — exists; live PATCH always sets it `null` (`writeApprovals.ts:73`).
- Finance overlay `approved` / `approved_drift` (`lib/finance/overlayFinanceStatus.ts:267-288`) — billed-vs-approved **invoice snapshot**, not `mba_line_approvals`.

### approved_slice

- Column `media_plan_versions.approved_slice` jsonb (`db/schema/planCore.ts:71-72`). Frozen once on `mode === "publish"` (`lib/data/savePlan.ts:1115-1135`). Never mutated afterwards (INVARIANTS).
- Shape `{ totalCents, lines[] }` (`lib/finance/approvedSlice.ts:15-28`). Each line: `lineItemId`, ISO `months`, component cents.
- Built from billing-schedule **lineItems with non-zero money** in selected months (`approvedSlice.ts:112-125`). `$0` / not-on-billing-grid lines never enter the slice.
- Missing at MBA render → `deriveApprovedSliceFromScheduleRows` (`lib/docs/deriveApprovedSliceFromSchedule.ts:30-47`) from billing `schedule_months`, dropping `mba_line_approvals` `approved=false` ids. **Not written back** (C-57).
- Checksum input (`lib/docs/snapshotChecksum.ts:4, :63`). C1 gate compares full-scope billing `schedule_months` to `totalCents` (`lib/data/savePlan.ts:1138-1144`).

### mba_line_approvals

- Table (`db/schema/planCore.ts:175-203`): unique `(mba_number, media_plan_version, line_item_id, media_type)`. **Absence of a row = approved.** Postgres-authoritative; ETL skip.
- GET/PATCH `/api/mba-line-approvals` (`app/api/mba-line-approvals/route.ts:14-51, :66-105`) — `checkClientMbaAccess`; GET via `readMbaLineApprovals`; PATCH via `writeMbaLineApprovals`.
- Client (`lib/finance/mbaLineApprovalsClient.ts:75-76, :96-97, :154-167`) — PATCH `approved:true` deletes; `false` upserts exclusion. Canonical ids at the map boundary (C-103).
- MBA PDF also reads it (`lib/docs/buildMbaFromPersisted.ts:340-351`) into `unapprovedLineIds`. Those ids filter **derived** slices and delivery-only client-pays rows (`:201`); they do **not** punch holes in an already-frozen slice’s billed media (`computeMbaMediaBreakdown` billed loop `:172-176` uses slice ids only).

### live scope

- Planner meaning: `deriveLiveMbaScopeSelection` (`lib/docs/liveMbaScopeSelection.ts:18-36`) — if Partial is on and channels hydrated, overlay `{ approvedLineItemIds, selectedMonthYears? }` onto `POST /api/mba/generate`. Full MBA returns `null` so generate stays on the frozen slice.
- Edit posts it only when `liveScope: true` (`edit/page.tsx:6525-6533, :9258-9259, :9428`). Sets `X-Slice-Source: live`. Never writes `approved_slice`.
- Empty `selectedMonthYears` is omitted (frozen months stay). Empty `approvedLineItemIds` is treated as none (zero billed media) when `restrictLineIds` (`lib/docs/mbaRenderFilters.ts:64-95`).
- Not the dashboard “live scopes of work” table.

---

## 2. The write path

### Control (tick / untick)

The control is the per-line **Switch** in MBA Details (`components/billing/MbaBillingModal.tsx:529-538`), not a grid checkbox. Month chips are `MbaBillingModal` `:301-309, :371-393`. Channel “N of M” is the container header (`:1101-1104`). Production is listed but labelled billed-separately (`:1096-1103`); it is not in the Partial channel picker on open (`edit/page.tsx:10205-10206` filters `mp_production`).

Edit handlers: `handleMbaBillingToggleLine` (`:10264-10276`) mutates `partialMBASelectedLineItemIds`. Done: `handlePartialMBASave` (`:10495-10554`) sets `isPartialMBA=true` and may PATCH.

Create has the same modal/handlers (`create/page.tsx` Partial MBA section `:3747+`) but **never** calls `patchMbaLineApprovalsClient` (zero hits in create).

### What lands in the database, relative to publish

| Store | When | Columns / shape | Same txn as publish? |
|---|---|---|---|
| `line_items` | `POST /api/plans/save` | Full REPLACE-SET of every line (excluded lines still persist as rows). `approval` is **not** a column — it only rides the save payload into financials. | Yes (`savePlan.ts` replace-set). |
| `schedule_months` billing | same txn | Explode of `financials.billingSchedule`. Excluded lines omitted (`attachScheduleLineDetail.ts:229-231`). Delivery still has them. | Yes. |
| `media_plan_versions.legacy_schedules` | same txn | `{ billingSchedule, deliverySchedule }` from `computeCampaignFinancials` (`savePlan.ts:1037-1096`). **No** `partialApproval` wrapper. | Yes. |
| `media_plan_versions.approved_slice` | `mode === "publish"` only, freeze-once if null (`savePlan.ts:1114-1135`) | `computeApprovedSlice({ financials, selectedMonthYears, approvedLineItemIds })`. Ids from `approvedLineIdsFromInput` (`:386-390`). | Yes, first publish only. |
| `mba_fee_snapshots` | publish only | Fee **rates**, not exclusion set. | Yes. |
| `mba_line_approvals` | **after** save returns, edit only (`edit/page.tsx:8163-8176` postgres path; `:8450-8471` Xano path) | Exclusion rows (`approved=false`). Approved ticks delete rows. | **No — separate PATCH, fail-soft.** |
| Billing blob `partialApproval` | MBA PUT only (`route.ts:1070-1084`) | Metadata on each month. | Separate from `savePlanVersion`. |

`selectedMonthYears` is on the save schema (`plansSaveBodySchema.ts:97-98`) and `savePlan` honouring (`save/route.ts:256`, `savePlan.ts:1129`). **Neither twin posts it** on `assemblePlansSaveRequestBody` (edit `:7884-7958`, create `:5539-5585`). Month chips therefore do not freeze into `approved_slice` or trim `schedule_months` on the live postgres path. They affect live `computeCampaignFinancials` and the optional PDF overlay only.

Working-draft save on a published tip returns before the approvals PATCH (`edit/page.tsx:7776-7807`). Modal Done, if the exclusion fingerprint changed vs last persisted, toasts “New MBA version required” and **skips PATCH** (`:10528-10535`).

### Is `mba_line_approvals` written by any live UI path today?

**Yes, edit page only**, three call sites, all `patchMbaLineApprovalsClient`:

1. After postgres `postPlansSave` when `isPartialMBA || forceIncrementForApprovals || lastApprovalFp !== null` (`:8163-8176`).
2. After the legacy MBA PUT save (`:8450-8471`).
3. Modal Done, only when fingerprint is unchanged (`:10541-10545`).

Create: no. Regenerated documents: no. `savePlanVersion`: no.

### Why every row is `approved=false` (live: 624 / 624, not 539)

Table semantics (`writeApprovals.ts:22-26`): a row **is** an exclusion. `approved:true` deletes. A healthy table contains only `approved=false` rows. All-in campaigns have **zero** rows.

Live query 2026-09-15: **624 rows, 0 `approved=true`, 612 `line_item_id LIKE 'billing-%::%'`**, 3 MBAs, 13 `(mba, version)` pairs (`glenda008` v3/5/6/7, `golf025` v26–31+33, `PGAAUS015` v22–23). C-103 recorded 166/166 decorated false rows at fix time; the count has grown because PATCH still upserts exclusions and never stores `approved=true`. Decorated ids are canonicalised on read (`toBillingOverrideLineItemId`), so they still match — they are leftover shape, not a second meaning.

User’s “539” is the same class, earlier count. Confidence on 539 vs 624: the live number is 624.

---

## 3. The read path

### MBA PDF — include / exclude

Decision stack in `buildMbaFromPersisted` (`lib/docs/buildMbaFromPersisted.ts:340-384`):

1. Load frozen `approved_slice`, or derive from billing `schedule_months` minus `unapprovedLineIds` (from `mba_line_approvals` `approved=false`).
2. `resolveMbaRenderFilters` (`mbaRenderFilters.ts:64-95`) — frozen ids/months, optionally replaced by live `approvedLineItemIds` / `selectedMonthYears`.
3. `rowInApprovedSlice` (`:98-116`) drops schedule rows outside that filter. `__service__*` always pass.
4. Totals: live overlay re-sums billing components (`sumBillingComponentsFromRows`); else slice cents / resolved billing fallback.
5. `deriveMbaScope` (`mbaScope.ts:93-126`) prints `Scope: Partial MBA — … (N of M lines)` and `_partial` filename when partial.

Include: approved (or live-ticked) lines × approved months, plus production/adserving as first-class components, plus delivery-only client-pays that are not in `unapprovedLineIds`.  
Exclude: lines not in the slice/live id set; months not in the month set; `__service__*` stay in money but are not counted as lines.

### Media Plan Excel

Live generate walks **every** container line (`media-plans.md` gotcha; create `:3053`, edit `:9350`). `mbaScopeTotals` already skip `flags.excluded` (`computeCampaignFinancials.ts:1112-1118`). Channel section subtotals still show the buy. Under Total Gross Media a note `Excluded from MBA scope: $X across N lines` (`excludedMbaScopeNote.ts:28-34`, wired `:3080-3082` / `:9374-9376`). Excluded lines are **not dropped from sheets**.

### Finance — billed, held, or dropped?

**Dropped from the bill, not held.**

- Billing schedule construction skips `line.excluded` (`attachScheduleLineDetail.ts:229-231`; `recomputeBillingScheduleOnSave.ts:235`).
- `deriveReceivableRecords` / `derivePlanReceivableBillingRecordsForMonth` (`lib/finance/deriveReceivableRecords.ts:111-145`) reads `computeCampaignFinancialsFromVersion`, which rebuilds from the **persisted billing schedule**. That schedule has no excluded lines. `flags.excluded` is hardcoded `false` on rebuild (`computeCampaignFinancialsFromVersion.ts:99`) because the rows are already the approved set.
- `readFinance.ts` does not mention approvals or `approved_slice`; receivables are schedule-derived billing records.
- Client-pays media is a second drop (`deriveReceivableRecords.ts:160-168`, C-95) — unrelated to Partial MBA.
- Periods `held` / `excluded` (`lib/finance/periods/lockPeriod.ts`) are operator review of run items (missing ABN, etc.), not MBA ticks.

If a planner later PATCHes `mba_line_approvals` without a new publish, finance **does not move**. It still bills the frozen billing `schedule_months` / blob. Dual source.

---

## 4. Versions

A second MBA for more lines is a **new version**, not a mutated `approved_slice`.

- Slice freeze-once (`savePlan.ts:1126`). Adding ticks cannot rewrite vN’s slice.
- Exclusion-fingerprint change (`approvalExclusionFingerprint`, SV-3) sets `forceIncrementForApprovals` (`edit/page.tsx:7719-7732`). Adding/removing **approved** lines does not cut; changing the **exclusion set** does.
- On unpublished tip → `new_version` (stays unpublished unless `SAVE_PUBLISHES_IMMEDIATELY`). On published tip → publish next (`INVARIANTS` / `resolvePostgresSaveMode`).
- Modal Done will not PATCH a changed set onto the current version (`:10528-10535`).

Version picker (`edit/page.tsx:12010-12036`): Combobox of `v{n}` only when `latestVersionNumber > 1`. No published badge, no Partial badge, no slice summary. Choosing a version opens the rollback modal (`handleVersionSelect` `:11182-11189`) then `router.push(?version=)`.

### Line approved in v3, removed in v4

- v3 `approved_slice` still lists the line (frozen).
- v4 `line_items` REPLACE-SET omits it. MB-2 drops its `billing_overrides` as `dropped` (`savePlan.ts` carry).
- `mba_line_approvals` for v3 remain; v4 is a different `media_plan_version`.
- Finance uses the published pointer (`PUBLISHED_VERSION_JOIN_SQL`) — after v4 publish, v3’s line is not billed.
- Generating the v3 MBA PDF still includes the line. Trafficking/pacing keys on `line_item_id` can orphan.
- What breaks: hydrate of v3 vs v4 exclusion fingerprints; decorated leftover rows (C-103) on old versions; any consumer that assumed `mba_line_approvals.approved_in_version` (always null).

---

## 5. FB smoke block (rev 16, 20 rows)

**Not found in this repo.** Searched `docs/superpowers/`, `docs/archive/STAGE-*-SMOKE.md`, `docs/archive/domain-4/`, and `av-review/` (folder absent — `docs/brain/XANO-SEVERANCE-REGISTER.md` already records that). No “Block FB”, no 20-row Partial MBA matrix.

Adjacent in-repo matrices that are **not** Block FB:

| Artifact | What it is |
|---|---|
| `docs/superpowers/friday-flip-2026-07-31-step2-write-path.md` | A1–A6 / B1–B3 write-path + X1 `mba_line_approvals` recon (krusty015 v5) |
| `docs/archive/STAGE-1A-SMOKE.md` | Finance hub filter smoke (payables/receivables), not Partial MBA |
| C-100 / C-103 in `KNOWN-ISSUES.md` | Partial id + ingest-load defects, not a 20-row sheet |

Cannot mark 20 unknown rows pass/fail. Confidence **~35%** that Block FB lives only on the av-review Google Sheet (revision 16). Restoring that sheet is the unblock.

What current code can support **in principle** (not a substitute for the missing 20):

| Planner / finance intent | Today |
|---|---|
| Exclude some lines, publish, PDF omits them | Yes, via `line.approval` → billing explode → slice freeze |
| Exclude some months, publish, finance omits those months | **No** on postgres save (chips not posted) |
| Exclude a whole channel | Yes, empty selected array for that media key |
| Second MBA for more lines | Yes, only as a **new version** |
| Create-path Partial then reload | Weak — no `mba_line_approvals` write |
| Finance bills only approved lines | Yes, because billing schedule dropped them |
| Finance holds excluded lines for later | **No** — dropped, not held |
| Mutate slice in place after client approval | **Forbidden** (INVARIANTS) |

---

## 6. Real usage (read-only Postgres, 2026-09-15)

Literal ask: published versions (`published_at IS NOT NULL`) whose `approved_slice.lines` length is less than `line_items` count (skip `__service__*`).

| Population | N |
|---|---|
| Published versions | 987 |
| Of those with `approved_slice.lines` array | 106 (881 have no frozen slice — C-57 class) |
| Slice line count **<** `line_items` count | **77** |
| Slice line count = item count | 29 |
| Slice line count > item count | 0 |
| Published versions whose `legacy_schedules` text contains `partialApproval` | 15 |
| `mba_line_approvals` rows | 624, all `approved=false`, 3 MBAs |

**Caveat (must not treat 77 as Partial MBA volume):** `computeApprovedSlice` only records lines with non-zero billing money (`approvedSlice.ts:125`). Slice size tracks **billed media lines**, not ticks. Five most recent of the literal query:

| MBA | Version | `published_at` | Slice lines (in) | `line_items` − slice (out) | Billing media distinct ids |
|---|---|---|---|---|---|
| golf025 | 33 | 2026-09-15T04:03Z | 28 | 122 | 26 |
| STRMEA001 | 18 | 2026-09-15T02:56Z | 90 | 117 | 89 |
| PGAAUS015 | 26 | 2026-09-15T02:26Z | 36 | 48 | 36 |
| glenda009 | 1 | 2026-09-14T21:29Z | 0 | 2 | 0 |
| glenda008 | 7 | 2026-09-14T09:29Z | 2 | 2 | 2 |

STRMEA001 has **no** `mba_line_approvals` rows — 117 “out” are unbilled line_items, not exclusions. golf025 v33 has only **10** exclusion rows vs 122 naive out. glenda008 v7 (2 in / 2 out, 2 billed, 2 approval rows) is a real Partial (C-100 family).

Honest size of real-world Partial use: **3 MBAs** in the exclusion table; **15** published versions with a `partialApproval` blob; **not** 77.

---

## 7. Gaps a planner would hit today

1. **No second MBA on the same version** — more lines requires a new published cut; slice cannot grow in place.
2. **Month chips do not persist on postgres save** — live PDF overlay can show a month subset; freeze and finance bill all billing months.
3. **Create never writes `mba_line_approvals`** — first-publish exclusions live only in schedule/slice; reload hydrates all-in unless a leftover PUT blob has `partialApproval`.
4. **Approvals PATCH is after the txn and fail-soft** — publish can succeed with a frozen slice and a missing or stale exclusion table.
5. **Published tip + changed ticks saves a working draft and refuses PATCH** until Publish — easy to think the client MBA updated when it did not.
6. **Excel still prints excluded lines** in channel sheets; only a footnote under Gross Media (C-100 class).
7. **Finance drops excluded lines rather than holding them** — later “book the rest” cannot bill from a held queue; it needs a new version’s schedule.
8. **Frozen slice ignores later `mba_line_approvals` punches** for billed media — table and slice can disagree; PDF billed tables follow the slice.
9. **Version picker is ordinal only** — no way to see which vN was the Partial client sent.
10. **Production / new ingested lines** — production is out of the Partial picker; ingest used to drop new lines out of scope (C-100 FIXED in repo, still a process footgun if Partial is on).
11. **Dual identity leftovers** — 612/624 exclusion ids still `billing-…::` (C-103 FIXED in code, data not cleaned).
12. **`approved_in_version` is unused** — cannot answer “this line was approved in v3” from the table.

### Below 90% confidence

- **FB Block 20 rows** (~35%) — sheet not in repo; cannot score.
- **77 “partial” versions** as product usage (~50% that a reader would misread it) — slice ≠ ticks; billed-line count is the better comparator.
- User **539** vs live **624** — same mechanism, later count.
- Whether any finance operator uses period `excluded` as a stand-in for Partial MBA (~80% no; no code path).
- Whether `SAVE_PUBLISHES_IMMEDIATELY` on this trunk means an exclusion-fingerprint save on a published tip always cuts a billed vN+1 in production (code says yes; not re-traced against today’s env flags in this pass). Raising that would be reading `.env.local` `SAVE_PUBLISHES_IMMEDIATELY` and one golf025 v32→v33 save log.

---

## What a new process must decide

Today there are **three** “what was approved” stores (`approved_slice`, billing `schedule_months`, `mba_line_approvals`) plus a fourth live overlay that never writes. Finance reads only the billing schedule. The planner-facing Partial UI reads the table (edit) or a blob the postgres writer no longer stamps. A process that “send part, book part, send more, bill only approved” cannot be a PATCH of `approved_slice` (INVARIANTS). It has to be either a new published version per MBA issue, or a new table whose rows finance actually reads.
