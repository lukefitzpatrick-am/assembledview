# Version control Stage 1 — status→publication consumers

**Status:** Step 4 client publication gates landed for download/docs/save-mode. Billing mutability (MB-15c write path + modal lock + fee-override spawn) stays on `isApprovedOrBeyond` until Stage 2 — planned is downloadable but not frozen. **Bucket C (VC1-5) split:** tip = `resolveDashboardLiveVersionRow` / commercial = `isBookedApprovedCompleted` (unchanged set).
**Decision:** backfill ALL existing `media_plan_versions` rows as published once `published_at` exists. Stage 1 proceeds. **0018a** restores draft-row parity (`campaign_status=draft` → clear `published_at`).
**Fact:** `media_plan_versions.published_at` (timestamptz, null) + `published_by` (text, null, lowercase CHECK) exist (migration 0018). Canonical publication predicate: `lib/mediaplan/versionPublication.ts` `isVersionPublished` = `publishedAt ?? published_at != null` only. Write: publish-only stamp inside the save txn; draft/`new_version` never stamp; draft re-save never clears. Download/docs/save-mode use that predicate. `isApprovedOrBeyond` remains the billing-mutability gate (Bucket B). `canReturnToDraft` / status dropdown filters stay commercial.

## Stage 1 size

| Metric | Count |
|---|---|
| **Bucket A (production call sites that must repoint)** | **32** |
| Bucket C (VC1-5 tip/commercial split) | 6 (split done) |
| Bucket B (commercial status — leave alone; listed for exclusion) | not in Stage 1 |

**32 is Stage 1's real size** — every row in [Bucket A](#bucket-a--publication-inference-stage-1-must-repoint).

## Predicate glossary (do not conflate)

| Predicate | Rule today | Includes `planned`? | Role |
|---|---|---|---|
| `isVersionPublished` | `published_at != null` (`lib/mediaplan/versionPublication.ts`) | n/a | **Canonical publication** — Stage 1 target; no status fallback |
| `isPublished` (edit+create) | `isVersionPublished(selected version)` | n/a | Download / send-to-client UX only |
| `isApprovedOrBeyond` | `approved \| booked \| completed` | **no** | **Billing mutability** (MB-15c) + commercial helpers — not a publication gate |
| `resolvePostgresSaveMode` overwrite | tip unpublished (`published_at` null) && tip > 0 && !forceIncrement | n/a | May overwrite tip in place |
| `isFinanceIncludedCampaignStatus` | same set as approved-or-beyond | no | Finance totals — **B**, not publication |
| `publishedVersionFromMaster` / `filterPublishedVersions` | `master.version_number` | n/a | **Already tip-based** — not status inference; out of Stage 1 scope |

Live invariant already proves status ≠ publication: a publish-mode save can leave `campaign_status=draft` while advancing the tip and writing fee snapshots (`INVARIANTS.md`). Stage 1 closes that gap with `published_at`.

**Once `published_at` exists:** Bucket A sites should read version-row publication (`published_at IS NOT NULL` / equivalent), not `campaign_status`. Tip watermark may still be `master.version_number` until a later VC stage owns that separately.

---

## Bucket A — publication inference (Stage 1 must repoint)

| file:line | bucket | what it decides | read instead once `published_at` exists | risk if missed |
|---|---|---|---|---|
| `lib/mediaplan/resolvePostgresSaveMode.ts:58-59` | A | Draft + tip → overwrite in place vs cut `publish` | Overwrite iff **this version is unpublished** (or working draft), not `status==="draft"` | Publish-mode draft tip gets overwritten; or draft never overwrites and spam-versions |
| `app/api/mediaplans/mba/[mba_number]/route.ts:982-983` | A | Legacy PUT `overwriteMode` — same draft+tip rule | Same as resolvePostgresSaveMode | Dual save paths diverge; silent data loss on tip |
| `lib/docs/isApprovedOrBeyond.ts:13-14` | A | Shared “published enough for docs/billing lock” predicate | `published_at` on the version (or rename helper to `isVersionPublished`) | Every downstream A site stays wrong if only call sites change |
| `lib/docs/saveDocSteps.ts:24-25` | A | Skip MBA/XLSX upload when “not approved-or-beyond” | Skip when version **unpublished** | Docs missing on published-draft tips; or docs generated for never-published planned |
| `lib/docs/buildMbaFromPersisted.ts:149-152` | A | Server MBA render requires approved-or-beyond | Require `published_at` (plus existing `approved_slice`) | 422 on valid published drafts; or render unpublished rows |
| `app/api/mediaplans/generate-pdf/route.ts:78-85` | A | PDF metadata route refuses non-approved status | `published_at` | Client can’t fetch stored docs for published draft tips |
| `app/api/mediaplans/[id]/download/route.ts:49-56` | A | Stored file download refuses non-approved status | `published_at` | Downloads fail for published draft; succeed for unpublished approved (if that state exists) |
| `lib/data/writeBillingOverrides.ts` assertVersionBillingMutable | B | MB-15c: refuse billing_overrides writes after approved+ | Stay on `isApprovedOrBeyond` until Stage 2 | Freezing planned/cancelled tips early; or mutable approved MBAs |
| `lib/finance/planMbaFeeOverridePersistence.ts` spawn vs inplace | B | Fee-amount change on approved+ → spawn version | Stay on `isApprovedOrBeyond` until Stage 2 | Same split as MB-15c |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:2883-2886` | A | Defines `isPublished` = not draft (download eligibility) | `selectedVersion.published_at` (or tip published) | Entire download cluster wrong for draft-status published tips |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:8977` | A | Block Generate MBA PDF toast | version `published_at` | Client blocked from docs they already “have” via tip |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:9018` | A | Block media-plan download toast | version `published_at` | Same |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:9041` | A | Block AA media-plan download toast | version `published_at` | Same |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:9136` | A | Block billing-schedule download toast | version `published_at` | Same |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:11084` | A | Draft pill tip label “published tip vN” only if not draft | tip / version `published_at` | Mislabels published-draft tip as unpublished |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:11156-11157` | A | Disable download control + title | version `published_at` | UX gate wrong |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:11179,11186` | A | Disable MBA download path | version `published_at` | UX gate wrong |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:11193,11201,11204,11218` | A | Disable AA / billing download path | version `published_at` | UX gate wrong |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:11229,11236` | A | Disable Excel download path | version `published_at` | UX gate wrong |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:11250,11258,11261` | A | Disable secondary download path | version `published_at` | UX gate wrong |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:11295` | A | Download title when draft | version `published_at` | UX gate wrong |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:8161` | A | Skip doc upload steps on save by status | skip if saving **unpublished** version | Docs skipped/generated on wrong versions |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` billing save / reset / timingReadOnly / Apply | B | MB-15c UI lock | `isApprovedOrBeyond` until Stage 2 | UI/server disagree if moved to published_at early |
| `app/mediaplans/create/page.tsx` billing twin locks | B | Same as edit | `isApprovedOrBeyond` until Stage 2 | Twin drift |
| `app/mediaplans/create/page.tsx:5891` | A | Skip doc upload on create-save by status | published_at of new version / mode | First publish may skip docs incorrectly |

Billing-overrides API routes (`replace_line` / `reset_line`) only map `VERSION_PUBLISHED_IMMUTABLE` from `writeBillingOverrides` — counted once at the lib gate, not again at the route.

---

## Bucket C — tip vs commercial (VC1-5 split)

Dashboard aggregators used to answer **which version is live** and **does it count commercially** with one BAC predicate. Split:

| Question | Helper | Rule |
|---|---|---|
| Which version is live? | `resolveDashboardLiveVersionRow` in `lib/api/dashboard/shared.ts` | Caller `publishedVersionNumber` (master tip) → else highest version with `published_at` non-null. **Never** `campaign_status`. `pickHighestVersionRow` delegates here. |
| Does it count commercially? | `isBookedApprovedCompleted` (name + set unchanged) | `booked \| approved \| completed` only — Bucket B |

| site | tip | commercial |
|---|---|---|
| `shared.ts` | `resolveDashboardLiveVersionRow` (+ `resolveDashboardCommercialLiveVersionRow` = tip then BAC) | `isBookedApprovedCompleted` |
| `global.ts` (3 aggregators) | via commercial-live helper (`published_at` fallback; no master tip map) | BAC on tip |
| `finance.ts` | master tip arg into commercial-live helper | BAC on tip |
| `publisher.ts` | via commercial-live helper | BAC on tip |
| `client.ts` | `resolveDashboardLiveVersionRow` (+ master tip) | `isBookedApprovedCompleted` on campaigns/schedules |
| `plannedSpendConsistency.ts` | **none** — commercial-only client mirror | `isPlannedBasisCampaignStatus` ≡ BAC |

Fixture proof: `lib/api/dashboard/__tests__/vc15DashboardTipCommercial.fixture.test.ts` — client media totals identical to the cent before/after when tips are BAC.

---

## Bucket B — genuine commercial status (leave alone)

Not Stage 1. Listed so Claude does not “helpfully” repoint them.

| file:line / area | what it decides |
|---|---|
| `lib/finance/sections/financeCampaignStatus.ts` (+ SQL constants) | Include/exclude campaign dollars in Costs / client-pays / investment cuts |
| Finance consumers of `isFinanceIncludedCampaignStatus` / `FINANCE_STATUS_*_SQL` (`clientPaysQuery`, `cutArQuery`, `cutAggregate`, `deriveReceivableRecords`, forecast, etc.) | Commercial totals scope |
| `app/mediaplans/page.tsx` status filter / badges (~379, ~727) | List UX buckets |
| `lib/mediaplan/campaignStatusGuard.ts` `mapCampaignStatusForPersist` / `normaliseStatus` | Persist vocabulary — keep; stop **using** status as publication |
| `getDraftReturnRejection` + edit `canReturnToDraft` (~2240) | Lifecycle: cannot return to Draft once left — commercial workflow |
| `app/api/plans/save/route.ts` + `savePlan` status persist | Stores commercial status on the version row |
| Pacing / ops digest status fields | Display / banding, not “client has this version” |

---

## Out of scope — already tip-based (not status publication inference)

These use `master.version_number` / `publishedVersionNumber` / `filterPublishedVersions` / `publishedVersionGuard`. Do **not** count in Stage 1 A. They may still need to learn `published_at` in a later stage if tip semantics change.

- `lib/mediaplan/publishedVersionGuard.ts`
- `lib/mediaplan/reapUnpublishedStagedVersions.ts`
- `lib/mediaplan/nextMbaVersionNumber.ts` (takes tip number, not status)
- MBA GET tip pick in `app/api/mediaplans/mba/[mba_number]/route.ts` (~931+)
- `lib/api/dashboard/shared.ts` `pickHighestVersionRow` when `publishedVersionNumber` is passed

---

## SavePlanMode `"new_version"` — reachable from UI?

**Confirmed: not reachable from any editor UI path.**

| Layer | Behaviour |
|---|---|
| API | `app/api/plans/save/route.ts:90` accepts `z.enum(["draft", "new_version", "publish"])` |
| Persistence | `lib/data/savePlan.ts` handles `new_version` (insert next version, copy overrides; does **not** advance publish tip the way `publish` does — see O4.6 / mirror comments) |
| Mode resolver | `resolvePostgresSaveMode` **only** returns `"draft"` or `"publish"` — comment at L42: unused by editor |
| UI / components | No caller under `app/` or `components/` sends `mode: "new_version"` |

Claude’s read is correct: API-capable, editor-unreachable. Stage 1 does not need a UI for it unless a later VC stage introduces stage-without-publish.

---

## Test mirrors (update with Stage 1 code; not counted in 32)

- `lib/docs/__tests__/saveDocSteps.test.ts`
- `lib/docs/__tests__/snapshotChecksum.test.ts` (PC3 `isApprovedOrBeyond`)
- `lib/data/__tests__/publishedBillingImmutable.mb15c.test.ts`
- `lib/mediaplan/__tests__/postgresSaveMode.test.ts` (+ drafts / publish payload tests)
- `lib/data/__tests__/feeOverridePublish.mb13.test.ts` (VERSION_PUBLISHED_IMMUTABLE)

---

## Grep scope (reproducible)

Under `lib/`, `app/`, `components/` only:

`campaign_status | campaignStatus | normaliseStatus | isApprovedOrBeyond | resolvePostgresSaveMode | isPublished | publishedVersionNumber | campaignStatusGuard | shouldSkipDocsForCampaignStatus | isBookedApprovedCompleted`
