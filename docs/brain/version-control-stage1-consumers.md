# Version control Stage 1 — status→publication consumers

**Status:** inventory for Claude migration input (Q19a, 4 Aug). No DDL in this doc.
**Decision:** backfill ALL existing `media_plan_versions` rows as published once `published_at` exists. Stage 1 proceeds.
**Fact:** `media_plan_versions` has **no** published column today. Publication is inferred from `campaign_status` (and, separately, tip authority already lives on `media_plan_master.version_number`).

## Stage 1 size

| Metric | Count |
|---|---|
| **Bucket A (production call sites that must repoint)** | **32** |
| Bucket C (ambiguous — Luke) | 6 |
| Bucket B (commercial status — leave alone; listed for exclusion) | not in Stage 1 |

**32 is Stage 1's real size** — every row in [Bucket A](#bucket-a--publication-inference-stage-1-must-repoint).

## Predicate glossary (do not conflate)

| Predicate | Rule today | Includes `planned`? | Role |
|---|---|---|---|
| `isPublished` (edit only) | `normaliseStatus(...) !== "draft"` | **yes** | Download / send-to-client UX |
| `isApprovedOrBeyond` | `approved \| booked \| completed` | **no** | Docs generate, download API, MB-15c billing lock |
| `resolvePostgresSaveMode` overwrite | `status === "draft" && publishedTip > 0 && !forceIncrement` | n/a | May overwrite tip in place |
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
| `lib/data/writeBillingOverrides.ts:442-447` | A | MB-15c: refuse billing_overrides writes after “publish” | Immutable when version has `published_at` | Billing mutable on live tip, or locked on unpublished drafts |
| `lib/finance/planMbaFeeOverridePersistence.ts:43-45,70` | A | Fee-amount change on approved+ → spawn version (don’t mutate in place) | Spawn when **version published**; inplace when unpublished | Mutates live MBA fee dollars; or forces spawn on unpublished drafts |
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
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:6881` | A | Block manual billing save (MB-15c UI) | lock if version `published_at` | Timing edits on live tip, or lock on unpublished |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:12601` | A | Hide reset-billing-to-auto when approved+ | hide when published | Same |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:12621-12623` | A | `billingTimingReadOnly` | published_at | Same |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:12631` | A | Refuse open timing draft when approved+ | published_at | Same |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:13358` | A | Hide Apply billing button when approved+ | published_at | Same |
| `app/mediaplans/create/page.tsx:5891` | A | Skip doc upload on create-save by status | published_at of new version / mode | First publish may skip docs incorrectly |
| `app/mediaplans/create/page.tsx:7799` | A | Hide reset-billing-to-auto | published_at | Create rarely published mid-session, but twin of edit |
| `app/mediaplans/create/page.tsx:7803` | A | `billingTimingReadOnly` | published_at | Twin of edit |
| `app/mediaplans/create/page.tsx:7810` | A | Refuse ensure timing draft | published_at | Twin of edit |
| `app/mediaplans/create/page.tsx:8283` | A | Hide Apply billing when approved+ | published_at | Twin of edit |

Billing-overrides API routes (`replace_line` / `reset_line`) only map `VERSION_PUBLISHED_IMMUTABLE` from `writeBillingOverrides` — counted once at the lib gate, not again at the route.

---

## Bucket C — ambiguous (flag for Luke)

| file:line | bucket | what it decides | why ambiguous | ask Luke |
|---|---|---|---|---|
| `lib/api/dashboard/shared.ts:94-97` | C | `isBookedApprovedCompleted` — tip/fallback picker + chart inclusion | Same set as finance include, but used to **pick which version is live** when tip arg missing | Is dashboard tip fallback Stage 1 (→ `published_at` / master tip only) or commercial filter (B)? |
| `lib/api/dashboard/global.ts:68,138,264` | C | Pick version by booked/approved/completed | Tip authority vs in-market filter | Same |
| `lib/api/dashboard/finance.ts:121` | C | Same picker | Same | Same |
| `lib/api/dashboard/publisher.ts:76` | C | Same picker | Same | Same |
| `lib/api/dashboard/client.ts:311,592,600` | C | Filter campaigns/versions into dashboard | Mix of “is live” and “counts in spend” | Split tip vs commercial filter? |
| `lib/dashboard/plannedSpendConsistency.ts:23-27` | C | Client mirror of above | Same | Same |

Prefer answering C by making dashboard always take `publishedVersionNumber` / `published_at` and leaving status filters as B-only.

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
