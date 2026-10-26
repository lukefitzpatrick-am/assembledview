# Design: billing revisions on published plans - 2026-10-26

Approved by Luke on 26 Oct 2026 at 18:39: option (a). Built behind `BILLING_REVISIONS` (default off). Luke's answers are in section 9 and are folded into the sections below.
Branch `localhost`, HEAD `46c283e9`.
Sources: repo via device bridge, Supabase SELECTs (read only).
Builds on `docs/superpowers/DISCOVERY-finance-process-2026-10-26.md` (sections 1, 3, 7, 8).

Confidence is given per finding. Anything under 90% is flagged.

---

## 0. Summary

- Finance cannot change billing timing on any live plan. Both write paths refuse.
  - Alter billing and the invoicing inline amount edit both call `PATCH /api/mediaplans/versions/{id}/billing-schedule` (`components/finance/MediaPlanActionBar.tsx:139`, `lib/finance/commitInlineScheduleAmountEdit.ts:51`). `assertVersionMutable` refuses every published version (409 `VERSION_PUBLISHED_IMMUTABLE`).
  - Editor timing writes refuse on approved, booked and completed plans (MB-15c).
- **Recommendation: option (a), a billing revision.** It is a new published version, cut on the server from the published tip. It copies everything verbatim and changes only billing timing. A dedicated writer does it in one transaction. It is not a full `savePlanVersion` recompute. Confidence 80%.
- One pure function does all the maths: `planBillingRevision`. It covers the modes pull a month, bill the remainder, bill an amount, underspend and restore.
- Two Ava tools: `preview_billing_revision` (read only) and `apply_billing_revision` (confirm plus a signed preview token). Admin only.
- One new table: `billing_revisions` (migration 0106). Every changed MBA-month also writes `finance_edits`.
- One invariant changed with Luke's sign-off (Q1): `publishBillingRevision` is now a second writer that stamps `published_at` (INVARIANTS line 150 says so, and why).

---

## 1. Why the locks exist

### 1.1 The two commits

| Commit | Date | Message | What it guards |
|---|---|---|---|
| `ea5427d7` | 2026-08-03 | "fix(billing): refuse override writes on published versions (MB-15c). Published approved/booked/completed versions are immutable to replace_line/reset_line so post-publish timing edits cannot stale snapshot_checksum or diverge the signed MBA PDF." | `billing_overrides` and billing-basis `schedule_months` on approved, booked or completed versions |
| `26b29c8a` | 2026-08-07 | "feat(vc2): refuse writes to a published version (Stage 2a)" | Any content write on a version with `published_at` set (draft overwrite, schedule patch) |
| `baa656fa` | 2026-08-07 | "restore billing-mutability parity. Stage 1 is publication only. MB-15c stays on isApprovedOrBeyond; published_at answers downloadability, not freeze." | Keeps the two predicates separate |

### 1.2 The reasons, from the code and the brain docs

1. **The signed MBA must match the stored numbers.**
   - `media_plan_versions.snapshot_checksum` is a sha256 of `schedule_months` + `approved_slice` + the fee snapshot (`db/schema/planCore.ts:79`, `lib/data/savePlan.ts:1287-1307`).
   - The checksum is printed in the MBA PDF footer (`snapshotChecksumFooter`).
   - The MBA PDF has a "Billing Schedule" page, month by month (`lib/generateMBA.ts:328-393`).
   - A weekly tripwire recomputes the checksum and logs `snapshot_checksum_tripwire` on a mismatch (`app/api/cron/snapshot-checksum/route.ts`).
   - So changing billing months in place on a published version makes the client's signed MBA wrong. It also fires PC3.
2. **A published version is a record.** Stage 2a: "published versions are immutable at the persistence layer. Publish a new version to change plan contents" (`lib/mediaplan/assertVersionMutable.ts:66-70`).
3. **The planned way forward is already written down.**
   - INVARIANTS line 68: "Retiming an approved MBA = publish a new version (Revisions / VC-3 will own draft-side overrides later)."
   - KNOWN-ISSUES MB-16 (Open): "Published-plan billing retiming unavailable until VC-3 ... only path is publish a new version."
   - `savePlan.ts:456-462`: the MB-2 override carry is "TRANSITIONAL (VC-3) ... Do not expand this path meanwhile."

Any design must keep these true:

- No write to `schedule_months`, `billing_overrides`, `approved_slice`, `snapshot_checksum` or `legacy_schedules` of a published version.
- The billing schedule a client signed stays exactly as it was. A change makes a new MBA.
- Do not grow the MB-2 carry.

### 1.3 A side finding about the old Alter billing path (80%)

- The PATCH wrote `legacy_schedules.billingSchedule` and billing `schedule_months`. It never wrote `billing_overrides` (`lib/data/writeBillingSchedule.ts:180-260`).
- `reconcileBillingOverrideSources` only re-applies overrides that already exist.
- So even before August, an Alter billing change on a plan was lost on the next editor publish. The publish recomputes billing from bursts plus overrides.
- Relaxing the lock would bring that bug back.

---

## 2. Where the change lives: options compared

### 2.1 Who reads the billing schedule

| Reader | What it reads | Version it picks |
|---|---|---|
| Finance compose (invoicing rows, To bill, Excel download) | `legacy_schedules.billingSchedule` or the attached `schedule_months` rows (PC1). `composeFinanceHubRecords.ts:166-169`, `computeCampaignFinancialsFromVersion.ts:178-205` | Published tip (pointer and stamp) |
| Plan reconciliation (FP-2a) | Billing-basis `schedule_months` | Published tip |
| AA pack | Fresh AA workbook from the published version. `months_changed` diffs `schedule_months` against the last sent version | Published tip |
| Xero matching | Approved snapshot, else schedule month total | Record by `invoice_key` (version-free) |
| Forecast | billingSchedule, then deliverySchedule, then bursts | Latest `version_number` per MBA (`buildFinanceForecastDataset.ts:69`, `:229`) |
| Client dashboard expected spend | `resolveCampaignExpectedSpendToDate`: delivery first, billing only as the last fallback (`lib/spend/resolveCampaignExpectedSpend.ts:37-101`) | Published tip |
| Pacing expected | Same resolver | Published tip (watermark) |
| Campaign report and decks | Same resolver (`lib/reports/campaignReport/expectedMedia.ts:36`) | Published tip |
| MBA PDF | `schedule_months` + `approved_slice` + fee snapshot | The version itself |
| KPIs | `campaign_kpi` by exact `(mba, version_number)` (`lib/data/readKpi.ts:33`) | Exact version |
| Campaign reads | Latest published row for that mba + version | Exact version |

Delivery timing is never changed by billing overrides ("delivery stays burst-prorated (override-free)", INVARIANTS line 79). So pacing and dashboards keep delivery numbers whatever we do. That is correct.

### 2.2 Option (a): a billing revision version, auto-published

How it works:

- The server cuts v(N+1) from the published tip vN.
- It copies the version row, `line_items`, delivery `schedule_months`, `mba_fee_snapshots`, `billing_overrides` and `campaign_kpi` verbatim.
- It writes new billing-basis `schedule_months` and a rebuilt `legacy_schedules.billingSchedule`.
- It upserts `billing_overrides` (media, plus fee where a line has a fee) for each changed line. The next editor publish then keeps the timing.
- It stamps `published_at`, computes a fresh `snapshot_checksum`, moves `published_version_id`, and regenerates the documents after commit.

| Reader | Sees the change? |
|---|---|
| Finance compose, Excel, reconciliation | Yes, automatically (new tip) |
| AA pack | Yes. The tip is new, so it becomes an `amended` due item when the plan has AA lines. Months in a sent pack must be locked (see 3.3) |
| Xero matching | Yes for unapproved months (schedule total). Approved months keep their snapshot until Re-approve |
| Forecast | Yes (new latest version) |
| Dashboard, pacing, decks | No change unless a plan has no delivery schedule. Correct |
| MBA PDF | A new v(N+1) MBA with the new billing page. The old signed MBA stays true for vN |
| KPIs | Only if the writer copies `campaign_kpi`. It must |
| Campaign reads | Hidden until republished for the new version. Same as any publish today |

- **Audit:** a `billing_revisions` row (who, why, mode, params, before and after) plus `finance_edits` per changed MBA-month. The version history shows "v11 billing revision".
- **Rollback:** a new "restore" revision puts the unlocked months back to vN values. Never delete a version. Never move the pointer back (forecast picks latest `version_number`, so a pointer move would split readers).
- **Approvals and drift:** `finance_billing_records` is keyed by `invoice_key` (`media:{mba}:{YYYY-MM}`), not by version. A changed approved month shows `approved_drift` and the "Re-approve" action. Unchanged months show nothing. Exported months are hard locked, so `ALREADY_EXPORTED` never triggers.
- **Immutability:** kept. Nothing on vN changes.
- **Costs:**
  - Version churn (one version per revision).
  - A new MBA PDF each time.
  - Open working drafts on vN become stale-base (52 working drafts exist; buxton004 has 1, PENFOLD020 has 2).
  - A second writer of `published_at` (invariant change).

### 2.3 Option (b): a layered table keyed to the published version

How it works: `billing_revisions_layer(version_id, line, month, delta)`, applied at read time by every reader.

| Reader | Sees the change? |
|---|---|
| Finance compose | Only after each compose path learns the layer (blob path, PC1 rows path, client-pays path) |
| Reconciliation | Only if changed. It compares to `schedule_months`, the plan of record (Luke, 22 Oct) |
| AA pack | No. It diffs `schedule_months` between versions |
| Xero matching | Only if changed |
| Forecast | Only if changed |
| MBA PDF | No. The PDF stays on the old schedule. The client's MBA and our invoices now disagree with no new document. This is the exact divergence MB-15c was added to stop |

- **Audit:** easy (the layer is the audit).
- **Rollback:** easy (delete layer rows).
- **Approvals and drift:** works only if compose applies the layer.
- **Verdict:** it breaks "plan of record for billing is `schedule_months`". It needs every reader changed, and any reader we miss gives a silent wrong number. It also keeps the signed MBA out of date. **Rejected.** Confidence 85%.

### 2.4 Option (c): relax the MB-15c lock for billing-only changes

How it works: let `replaceBillingOverrideLine` write on approved or booked plans when only timing changes. It rewrites `billing_overrides` and billing `schedule_months` in place.

| Reader | Sees the change? |
|---|---|
| Finance compose, reconciliation, Xero, forecast | Yes |
| AA pack | No. Same version, so no `amended` item and no `months_changed` |
| MBA PDF | No. The signed PDF and the checksum no longer match. PC3 fires |

- **Audit:** only what we add. The version shows nothing.
- **Rollback:** overwrite again. No record of the earlier state.
- **Stage 2a:** also breaks it. The schedule rows of a published version change.
- **Verdict:** this is exactly what both commits forbid. **Rejected.** Confidence 95%.

### 2.5 Recommendation

**Option (a), with a dedicated writer `publishBillingRevision`. Confidence 80%.**

Why a dedicated writer, not a full `savePlanVersion` publish:

- `savePlanVersion` recomputes billing from bursts and needs a client-built `SavePlanLineItem[]` (`mediaType`, `rate`, `enteredAmount`, `feePct`), `feeLoading` and the ad serving rates (`app/api/plans/save/route.ts:233-272`).
- Ad serving rates are not stored on the version. `mba_fee_snapshots.fees` holds fee rates only (checked on buxton004 v10, PENFOLD020 v29 and penfold022 v3). A server rebuild would use the client's current rates. That could change ad serving on invoiced months, which breaks D3.
- Fee depends on `budgetIncludesFees`. buxton004 has `feesocial = 20` and SM1 fee is 25% of media (62,500 / 250,000 cents). Recomputing rates on the server risks a fee move nobody asked for.
- A verbatim copy plus changed billing rows cannot drift.

What keeps (a) safe:

- It reuses the publish helpers from `savePlan.ts`: `stampVersionPublication`, `computeSnapshotChecksum`, the VP-1 master pointer update, and max+1 for the version number (`resolveVersionNumberForSave`, `savePlan.ts:431-444`).
- It runs `validateManualOverrideSumRules` on the new overrides. This is the C2 gate, so a later editor publish will accept them.
- It writes overrides on the new version directly. It does not use or extend the MB-2 carry.
- It refuses when `mba_scope.partial` is true (v1). A partial MBA with ticked months needs its own rules.

Under 90% because:

- the invariant change needs Luke;
- the blob rebuild must round-trip through `explodeScheduleToMonthRows` exactly (C3 tests prove it);
- campaign reads and pacing scenarios are keyed by version number (copy or accept, see Q9).

---

## 3. The allocation maths

### 3.1 Types

```ts
type Cents = number            // integer cents, never float dollars
type MonthKey = string         // "YYYY-MM", normalised via lib/finance/periods/monthKey.ts

type LockLevel = "open" | "soft" | "hard"
type LockReason =
  | "past_month"               // before the current Australia/Sydney month
  | "approved"                 // approved_at set, exported_at null  -> soft
  | "sent_to_accounts"         // exported_at set                    -> hard
  | "xero_matched"             // matched_xero_invoice_id set        -> hard
  | "xero_outside_av"          // a xero: row for this mba + month   -> hard
  | "legacy_billed"            // billed = true or billed_at set     -> hard
  | "aa_pack_sent"             // month in a sent billing_partner_packs item (AA lines only) -> hard
  | "finance_period_locked"    // finance_periods.status locked|invoiced|reconciled, only when FINANCE_PERIODS=on -> hard
  | "outside_campaign"         // month outside campaign start..end months -> hard

type MonthLock = { month: MonthKey; level: LockLevel; reasons: LockReason[] }

type RevisionLine = {
  lineItemId: string
  label: string                         // header1 + header2, for the preview
  channel: string                       // line_items.channel
  isProduction: boolean                 // channel === "production"
  clientPaysForMedia: boolean
  isAaLine: boolean                     // billing agency resolves to advertising associates
  media: Record<MonthKey, Cents>        // billing basis, component media
  fee: Record<MonthKey, Cents>          // billing basis, component fee (per line rows only)
  adserving: Record<MonthKey, Cents>    // billing basis, component adserving
}

type RevisionOptions = {
  unlockApprovedMonths: MonthKey[]      // soft locks the user ticked open
  includeProduction: boolean            // default false
  feeMode: "follow" | "keep"            // default "follow" (D1, D2)
  adservingMode: "keep" | "follow"      // default "keep" in v1 (see 3.6)
  lineFilter?: string[]                 // optional: only these lines
}

type RevisionRequest =
  | { mode: "pull_month"; fromMonth: MonthKey; intoMonth: MonthKey }
  | { mode: "bill_remainder"; intoMonth: MonthKey }
  | { mode: "bill_amount"; intoMonth: MonthKey; amountCents: Cents;
      strategy: "earliest_first" | "proportional" }
  | { mode: "underspend"; month: MonthKey; actualByLine: Record<string, Cents>;
      spillTo: "line_remaining" }       // see 3.5
  | { mode: "restore"; target: Record<string, Record<MonthKey, Cents>> } // undo

type RevisionInput = {
  lines: RevisionLine[]
  locks: MonthLock[]                    // one per month in the campaign range
  currentMonth: MonthKey                // Sydney
  campaignMonths: MonthKey[]
  request: RevisionRequest
  options: RevisionOptions
}

type CellDiff = { month: MonthKey; before: Cents; after: Cents }
type LineDiff = { lineItemId: string; label: string;
                  media: CellDiff[]; fee: CellDiff[]; adserving: CellDiff[];
                  skipped?: "client_pays" | "production" | "no_amount" }
type MonthDiff = { month: MonthKey; lock: MonthLock;
                   media: CellDiff; fee: CellDiff; adserving: CellDiff;
                   production: CellDiff; total: CellDiff }

type RevisionResult =
  | { ok: true; lines: LineDiff[]; months: MonthDiff[];
      movedCents: Cents; warnings: RevisionWarning[]; hash: string }
  | { ok: false; code: RevisionErrorCode; message: string;
      availableCents?: Cents; lockedMonths?: MonthLock[] }

type RevisionErrorCode =
  | "TARGET_LOCKED" | "SOURCE_LOCKED" | "SOURCE_EMPTY"
  | "AMOUNT_NOT_POSITIVE" | "AMOUNT_EXCEEDS_AVAILABLE"
  | "TARGET_OUTSIDE_CAMPAIGN" | "UNDERSPEND_ACTUAL_ABOVE_PLAN"
  | "MONTH_HARD_LOCKED" | "PARTIAL_MBA_UNSUPPORTED" | "NO_CHANGE"
```

### 3.2 "Invoiced" and the locks

From the lifecycle stamps on `finance_billing_records` (INVARIANTS lines 393-394, `lib/finance/billingLifecycle.ts`):

- **Hard lock (never changes):** any of these for `invoice_key = media:{mba}:{month}` (compare `lower()`; keys keep the MBA's case, for example `media:PENFOLD020:2026-10`):
  - `exported_at` not null (sent to accounts);
  - `matched_xero_invoice_id` not null (Xero DRAFT, SUBMITTED, AUTHORISED or PAID);
  - `billed = true` or `billed_at` not null (legacy);
  - a `xero:` row with the same `mba_number` and `billing_month`. buxton004 has these for Mar to Jun. They carry `exported_at = 1970-01-01`, so the first rule already catches them;
  - for AA lines only, a month covered by a sent `billing_partner_packs` item;
  - a locked `finance_periods` month, only when `FINANCE_PERIODS=on` (default off).
- **Soft lock:** `approved_at` set and `exported_at` null. Approved, not sent. Locked by default. The user can tick it open. It then shows "Re-approve" after publish (`reapprove: true` is allowed while `exported_at` is null).
- **Past month:** before the current Sydney month. Locked for bill ahead (source and target). Underspend may target it if it has no hard lock.
- **Outside campaign:** months after the campaign end month are not valid targets. A month before the campaign start is a valid prebill target (Q8, changed from the first draft), as long as it is not a past month.
- In other words, a month is locked when `resolveBillingState` is anything past `ready` other than `approved`, or when one of the extra rules above applies.

The lock is per MBA-month, not per line. Finance records are per MBA-month.

### 3.3 The pure function

```ts
function planBillingRevision(input: RevisionInput): RevisionResult {
  const lockOf = indexLocks(input.locks, input.options.unlockApprovedMonths)
  // effective level: soft becomes open when its month is in unlockApprovedMonths

  const eligible = input.lines.filter(l =>
    !l.clientPaysForMedia &&                     // media not billed by us
    (input.options.includeProduction || !l.isProduction) &&
    (!input.options.lineFilter || input.options.lineFilter.includes(l.lineItemId)))
  // skipped lines are reported with a reason, never silently dropped

  const after = deepCopy(eligible)               // media only, fee/adserving later

  switch (input.request.mode) {
    case "pull_month":     movePullMonth(after, req, lockOf); break
    case "bill_remainder": moveRemainder(after, req, lockOf, input.currentMonth); break
    case "bill_amount":    moveAmount(after, req, lockOf, input.currentMonth); break
    case "underspend":     moveUnderspend(after, req, lockOf, input.currentMonth); break
    case "restore":        applyRestore(after, req, lockOf); break
  }

  if (input.options.feeMode === "follow") recomputeFees(after, eligible, lockOf)
  if (input.options.adservingMode === "follow") recomputeAdserving(after, eligible, lockOf)

  assertInvariants(eligible, after, lockOf)      // throws: a bug, not user input
  return buildResult(input, eligible, after)     // diffs, month totals, warnings, hash
}
```

Guards shared by every mode:

```ts
requireOpen(month)    // TARGET_LOCKED / SOURCE_LOCKED with the reasons
requireInCampaign(month)                         // TARGET_OUTSIDE_CAMPAIGN
openFutureMonths(after, currentMonth) =
  campaignMonths.filter(m => m > intoMonth && lockOf(m) === "open")
```

**Pull month N into the target month:**

```ts
requireOpen(into); requireOpen(from)
for line in after:
  x = line.media[from] ?? 0
  line.media[from] = 0
  line.media[into] = (line.media[into] ?? 0) + x
if sum(x) == 0 -> SOURCE_EMPTY
```

**Bill the remainder now:**

```ts
requireOpen(into)
for m in openFutureMonths: pullMonth(m -> into)
if moved == 0 -> SOURCE_EMPTY
```

**Bill a set amount ahead:**

```ts
requireOpen(into)
if amount <= 0 -> AMOUNT_NOT_POSITIVE
pool = sum over openFutureMonths, eligible lines of media[m]
if amount > pool -> AMOUNT_EXCEEDS_AVAILABLE { availableCents: pool }   // never a partial move

if strategy == "earliest_first":
  remaining = amount
  for m in openFutureMonths ascending while remaining > 0:
    A = sum_l media[l][m]
    take = min(remaining, A)
    shares = allocateCents(take, weights = { l: media[l][m] })   // proportional across lines within m
    for l: media[l][m] -= shares[l]; media[l][into] += shares[l]
    remaining -= take

if strategy == "proportional":
  cells = { (l, m): media[l][m] for m in openFutureMonths }
  shares = allocateCents(amount, cells)                          // across every future line-month
  for (l, m): media[l][m] -= shares[(l, m)]; media[l][into] += shares[(l, m)]
```

**Underspend (lower a month to actual, move the gap forward):**

```ts
requireNotHardLocked(month)          // soft and past months allowed; a soft lock must be ticked open
for line in after with actualByLine[line] defined:
  plan = line.media[month] ?? 0
  actual = actualByLine[line]
  if actual > plan -> UNDERSPEND_ACTUAL_ABOVE_PLAN (v1: overspend is not this tool)
  gap = plan - actual
  line.media[month] = actual
  targets = openMonthsAfter(max(month, currentMonth - 1)) where line.media[m] > 0
  if targets empty:
    // Q5: ask per line. last_month = the line's last month with money (if open),
    // credit = a change-log note only (no cell change, no Xero action).
    -> UNDERSPEND_NEEDS_CHOICE { choicesNeeded } unless noRemaining[line] is given
  shares = allocateCents(gap, weights = { m: line.media[m] } or equal when all are 0)
  for m: line.media[m] += shares[m]
```

- The gap stays on its own line. That is the only way "line totals stay fixed" holds.
- "Spread by each line's share" therefore means each line's own remaining months, weighted by that line's remaining amounts.

**Allocation and rounding:**

```ts
function allocateCents(total: Cents, weights: Record<K, Cents>): Record<K, Cents> {
  W = sum(weights)                 // if W == 0: equal weights
  out[k] = floor(total * w[k] / W) // integer maths (BigInt if total * w could pass 2^53)
  r = total - sum(out)             // 0 <= r < count(k)
  out[largestWeightKey] += r       // remainder on the largest line; tie -> first in line order
  return out
}
```

- All amounts are integer cents. Dollars only at the edge (`toCents` half-up from `lib/money`).
- No cell may go below 0. `take <= A` per month and `shares[l] <= media[l][m]` make sure of this. `assertInvariants` checks it again.

### 3.4 Fee

```ts
function recomputeFees(after, before, lockOf):
  for line with any per-line fee row:
    feeTotal   = sum(before.fee)                         // frozen auto fee, C2 law
    lockedFee  = sum(before.fee[m] for m where lockOf(m) != "open")
    openMonths = months where lockOf(m) == "open"
    pool       = feeTotal - lockedFee
    weights    = { m: after.media[m] for m in openMonths }
    if sum(weights) == 0: keep before.fee on open months (warning FEE_NO_MEDIA)
    else after.fee = lockedFee months unchanged + allocateCents(pool, weights)
```

- This uses the line's own fee to media ratio from the base version. It never recomputes fee rates. That handles `budgetIncludesFees` (buxton004 SM1: 20% loading, fee = 25% of media).
- The fee total per line is unchanged, so `validateManualOverrideSumRules` passes (fee months must sum to the auto fee within $0.01).
- Invoiced months keep their fee (D3).
- Header-only fee rows (`__service__fees`, a fixed fee with no per-line fee) are not moved. Warning `FIXED_FEE_NOT_MOVED`.

### 3.5 Ad serving and production

- **Ad serving today follows bursts, not media billing.** `computeMediaLineAdServingMonthlyAmounts` prorates by burst dates (`lib/billing/computeMediaLineAdServingMonthly.ts`). `billing_overrides` handles only `media` and `fee`: `reconcileBillingOverrideSources` (`writeBillingSchedule.ts`) and the MB-2 carry (`savePlan.ts`) both coerce the component to `fee` or `media`. If the revision moved ad serving rows, the next editor publish would put them back on burst timing.
- **v1: `adservingMode = "keep"`.** Ad serving stays on delivery timing. The preview shows this.
- **C10 dropped (Q7).** Ad serving stays on delivery timing. There is no `"follow"` mode.
- **Production** lines (`channel = production`, billed as the month header "Production") are excluded unless `includeProduction` is ticked.

### 3.6 The edge cases

| Case | Rule |
|---|---|
| Client-pays line | Excluded. Its media is not billed by us. Fee and ad serving stay. Reported as skipped. Real example: PENFOLD020PD1 has no media billing rows and ad serving of $15.42 / $38.56 / $30.85 (Oct to Dec) that stays put |
| Line with zero future months | Untouched by bill ahead (nothing to take). For underspend, the gap goes to the first open month in the campaign, with a warning (Q5) |
| Amount larger than what's left | `AMOUNT_EXCEEDS_AVAILABLE` with the available figure. The UI offers "Bill the remainder ($X)". No partial move |
| Target month already approved | Soft lock. Refused unless ticked open. Then the row needs Re-approve |
| Target before campaign start | Allowed as a prebill, with warning `PREBILL_BEFORE_START` (Q8) |
| Partial MBA (`mba_scope.partial`) | `PARTIAL_MBA_UNSUPPORTED` in v1 |
| No change after rounding | `NO_CHANGE` |

### 3.7 Invariants the function asserts

- For every line, the sum of media is unchanged (to the cent). The same holds for fee and for ad serving.
- Every cell in a month that is not open is unchanged.
- No cell is negative.
- Skipped lines are byte-identical.
- The total moved equals the request (amount modes).

### 3.8 Which strategy matches "bill $100k this month from future months"

- **Earliest first** reads as "bring the next invoices forward". It changes the fewest months, so future months are disturbed least. A planner would do it this way in Excel.
- **Proportional** spreads the cut over every future month. The client's later invoices all shrink a bit.
- **Proposed default: earliest first, proportional across lines within each month.** Proportional stays one click away. Confidence 70% (Q3).

### 3.9 Worked examples on real data

Today is 26 Oct 2026 (Sydney). The current month is 2026-10.

#### LDS Property, buxton004 v10 (version id 12903, booked, published 2026-09-02)

Billing basis, cents. Only months from Oct with money are shown.

| Line | Oct | Nov | Dec | Line total |
|---|---|---|---|---|
| buxton004DD1 (Apartments.com.au) | 522,282 | 505,435 | 269,565 | 4,650,000 |
| buxton004DD7 (Realestate.com.au) | 519,667 | 503,169 | 255,709 | 4,602,762 |
| DD5, DD6, SM1 | 0 | 0 | 0 | all billed by Aug |

Locks:

- Mar to Jun: hard (`xero:` rows, paid).
- Jul, Aug: past. There are no app records for these months.
- Sep: soft (approved 2026-09-28, $11,634.43).
- Oct: soft (approved 2026-10-26 05:09 UTC, $10,419.49).
- Nov, Dec: open.

Fee: only SM1 carries a fee (25% of media). DD lines have no fee (no `feedigidisplay` key). SM1 media ended in Aug.

- **Finding (85%):** this explains "fee $0 from Sep" in the discovery. No fee-bearing line has media after Aug. It is not a bug in fee extension.
- So none of the examples below move any fee.

**E1. Bill the remainder now into Oct.** Oct is approved, so the user must tick it open.

| Line | Oct before | Oct after | Nov after | Dec after |
|---|---|---|---|---|
| DD1 | $5,222.82 | $12,972.82 | $0.00 | $0.00 |
| DD7 | $5,196.67 | $12,785.45 | $0.00 | $0.00 |
| Month total | $10,419.49 | $25,758.27 | $0.00 | $0.00 |

- Moved: $15,338.78.
- The Oct record shows "Approved, changed since" and needs Re-approve.
- Nov and Dec had no records.

**E2. Bill $10,000 ahead into Oct, earliest first.** The Nov pool is $10,086.04, so the whole amount comes from Nov.

- DD1 gives floor(1,000,000 × 505,435 / 1,008,604) = 501,123, plus the 1 cent remainder (largest line) = **$5,011.24**.
- DD7 gives **$4,988.76**.
- Nov is left with DD1 $43.11 and DD7 $42.93. Dec is unchanged.
- Oct after: DD1 $10,234.06, DD7 $10,185.43, total $20,419.49.

**E3. Bill $10,000 ahead into Oct, proportional.** Pool: Nov + Dec = $15,338.78.

| Cell | Taken | Left |
|---|---|---|
| DD1 Nov | $3,295.16 | $1,759.19 |
| DD1 Dec | $1,757.40 | $938.25 |
| DD7 Nov | $3,280.37 | $1,751.32 |
| DD7 Dec | $1,667.07 | $890.02 |
| Total | $10,000.00 | $5,338.78 |

The rounding remainder lands on DD1 Nov, the largest cell.

**E4. Underspend (illustration: the actual is made up, the plan figures are real).** DD1 Sep plan is $5,054.35. Say the actual was $4,500.00.

- Sep is approved, so the user must tick it open. Sep then shows Re-approve.
- The gap is $554.35. It stays on DD1.
- Oct is approved and not ticked, so it is locked. Open months after Sep: Nov ($5,054.35) and Dec ($2,695.65).
- Shares: Nov +$361.54, Dec +$192.81.
- After: Sep $4,500.00, Nov $5,415.89, Dec $2,888.46. The DD1 total is still $46,500.00.
- If DD5 (all billed by Sep) were underspent, it has no remaining months. The gap would go to the first open month (Nov) with a warning (Q5).

#### Penfolds, PENFOLD020 v29 (version id 16999, approved, campaign 2026-10-01 to 2027-01-04)

Media without production lines, cents: Oct 1,414,525; Nov 10,015,093; Dec 29,286,713; Jan 1,026,256. Oct is approved at $14,160.67 (media $14,145.25 + ad serving $15.42). Fee is 0% on this plan (snapshot rates all 0).

**E5. "Bill $100k this month from future months".** Oct must be ticked open.

| Strategy | Nov taken | Dec taken | Jan taken | Nov left |
|---|---|---|---|---|
| Earliest first (proposed default) | $100,000.00 | $0.00 | $0.00 | $150.93 |
| Proportional | $24,834.05 | $72,621.19 | $2,544.76 | $75,316.88 |

- Oct after: $114,160.67 in both cases. Re-approve is needed.
- Production stays in its own months: Nov $7,028.43, Dec $44,682.47, Jan $3,728.94.
- PD1 ad serving (client pays) stays.

**E6. "Bill $500k this month".** The future pool is $403,280.62. The result is `AMOUNT_EXCEEDS_AVAILABLE` with `availableCents = 40,328,062`. The UI offers "Bill the remainder ($403,280.62)".

#### Penfolds, penfold022 v3 (version id 17414, planned, campaign 2026-11-16 to 2026-12-13)

**E7. Pull Dec into Nov.**

| Line | Nov before | Nov after | Dec after |
|---|---|---|---|
| SM1 | $4,017.86 | $7,500.00 | $0.00 |
| SM2 | $803.57 | $1,500.00 | $0.00 |
| SM3 | $2,678.57 | $5,000.00 | $0.00 |
| SM4 | $535.71 | $1,000.00 | $0.00 |
| DD1, DD8 | $12,999.99 | unchanged | none |
| PROD1 (production, excluded) | $3,620.69 | unchanged | $3,379.31 unchanged |

- Nov media goes from $21,035.70 to $27,999.99. Dec media goes from $6,964.29 to $0.00.
- Production stays in Dec unless "Include production" is ticked.

**E8. Bill into Oct on penfold022.** Oct is before the campaign start month. Q8: this is allowed as a prebill. Bill the remainder into Oct moves $27,999.99 of media into Oct (production stays) with warning `PREBILL_BEFORE_START`. The blob gains an October month row.

---

## 4. The Ava ability

### 4.1 What exists today

- Tools are `AvaTool { definition, execute(input, context) }` (`lib/ava/tools/types.ts`).
- They are listed in `AVA_TOOLS` in `lib/ava/tools/registry.ts`. The order must match `AVA_TOOL_NAMES` in `lib/ava/tools/summaries.ts`, or the module throws at load.
- The tools offered depend on the page (`pageToolOffer.ts`). Create and edit routes and unknown routes leave out `accept_ingest_proposal` (fail closed). `run_scenario` is offered only on `/pacing` and `/dashboard`.
- **Tools that write today:**
  - `save_client_brain`: admin only (`context.roles.includes("admin")`). It writes directly with no confirm step.
  - `accept_ingest_proposal`: writes a plan version through `savePlanVersion` (via `executeIngestAccept`). Its pattern: `confirm: boolean` is required, and the description says "After the user explicitly confirms in chat ... Do NOT call until the user confirms". A money gate refuses with `block_reason` and `delta`.
  - `apply_form_patch`, `apply_parsed_plan`, `load_ingest_into_form` and `adjust_line_items` do not write to the database. They pass a patch to the page (`capturedPatch`, `capturedLineItemsLoad`), and the user saves.
- **The confirmation pattern:** a `confirm: true` flag after an explicit "yes" in chat. Nothing binds the confirm to what was shown. A second call could change the inputs.

### 4.2 Proposed contract

Two tools. The preview never writes. The apply only accepts a signed token from a preview.

**`preview_billing_revision`**

```json
{
  "name": "preview_billing_revision",
  "description": "Admin only. Preview a billing timing change on the published plan, for example 'bill $100k this month from future months'. Never writes. Returns before and after per line and month, locks, warnings and a previewToken. Show the table to the user and ask them to confirm before calling apply_billing_revision.",
  "input_schema": {
    "type": "object",
    "properties": {
      "mbaNumber": { "type": "string", "description": "Defaults to page context. Never invent." },
      "mode": { "enum": ["bill_amount", "bill_remainder", "pull_month", "underspend", "restore"] },
      "intoMonth": { "type": "string", "description": "YYYY-MM. Default: current Sydney month." },
      "amount": { "type": "number", "description": "Dollars ex GST, for bill_amount." },
      "strategy": { "enum": ["earliest_first", "proportional"], "description": "Default earliest_first." },
      "fromMonth": { "type": "string", "description": "YYYY-MM, for pull_month." },
      "underspendMonth": { "type": "string" },
      "actuals": { "type": "array", "items": { "type": "object",
        "properties": { "lineItemId": { "type": "string" }, "amount": { "type": "number" } },
        "required": ["lineItemId", "amount"] } },
      "unlockApprovedMonths": { "type": "array", "items": { "type": "string" } },
      "includeProduction": { "type": "boolean" },
      "feeMode": { "enum": ["follow", "keep"] },
      "reason": { "type": "string", "description": "Required. Why the timing changes." }
    },
    "required": ["mode", "reason"],
    "additionalProperties": false
  }
}
```

The output (model-facing JSON, also shown as a card):

```json
{
  "ok": true,
  "mba": "PENFOLD020",
  "baseVersion": 29,
  "newVersion": 30,
  "movedCents": 10000000,
  "lines": [ { "lineItemId": "...", "label": "...",
               "months": [ { "month": "2026-10", "before": 0, "after": 0 } ] } ],
  "months": [ { "month": "2026-10", "lock": "soft:approved (unlocked)",
                "mediaBefore": 1414525, "mediaAfter": 11414525,
                "feeBefore": 0, "feeAfter": 0, "adservingBefore": 1542, "adservingAfter": 1542,
                "totalBefore": 1416067, "totalAfter": 11416067 } ],
  "impacts": [ "Oct invoice was approved at $14,160.67. It will need Re-approve.",
               "Publishes v30 and a new MBA PDF.",
               "2 working drafts on v29 will be out of date." ],
  "warnings": [],
  "previewToken": "<signed>",
  "expiresAt": "2026-10-26T06:30:00Z"
}
```

- Add a side channel `capturedBillingRevisionPreview` (same idea as `capturedAttachments`). The chat renders the before and after table with a Confirm button. The button calls the apply route directly.

**`apply_billing_revision`**

```json
{
  "name": "apply_billing_revision",
  "description": "Admin only. Publishes the billing revision from a preview. Call only after the user has seen the preview and said yes in chat. Needs the previewToken from preview_billing_revision. Refuses if the plan or its invoices changed since the preview.",
  "input_schema": {
    "type": "object",
    "properties": {
      "confirm": { "type": "boolean", "description": "Must be true, after an explicit user yes." },
      "previewToken": { "type": "string" }
    },
    "required": ["confirm", "previewToken"],
    "additionalProperties": false
  }
}
```

**The token**

- It is an HMAC over: params, `baseVersionId`, the result `hash` (sha256 of the canonical after-cells and locks), the user's Auth0 sub, and an expiry (15 minutes).
- It needs a new server secret, `BILLING_REVISION_TOKEN_SECRET`.
- The model cannot change the inputs between preview and apply.

**The apply checks**

1. The token is valid, not expired, and its sub matches the caller.
2. The caller is admin (`context.roles.includes("admin")` in the tool; `requireFinanceAdmin` on the route).
3. The published tip is still `baseVersionId`. Otherwise 409 `STALE_BASE_VERSION`.
4. Recompute locks and the plan. If the hash differs, 409 `PREVIEW_STALE` with a fresh preview.
5. Publish (5.3).

**Page offer:** offered on `/finance/*` and the MBA detail page. Not offered on create or edit (fail closed, like `accept_ingest_proposal`). The editor holds a working copy there, and a revision would make it stale.

**Audit entry:** see 5.1. `source = 'ava'`, plus the chat turn id if one exists.

---

## 5. Data

### 5.1 New table `billing_revisions` (migration `0106_billing_revisions`, AUTHOR ONLY)

| Column | Type | Notes |
|---|---|---|
| id | bigint identity pk | |
| created_at | timestamptz not null default now() | |
| master_id | bigint not null references media_plan_masters(id) | |
| mba_number | text not null | |
| base_version_id | bigint not null references media_plan_versions(id) | the tip the revision was cut from |
| base_version_number | integer not null | |
| new_version_id | bigint references media_plan_versions(id) | null until applied |
| new_version_number | integer | |
| mode | text not null | check in (`pull_month`,`bill_remainder`,`bill_amount`,`underspend`,`restore`) |
| params | jsonb not null | request + options |
| reason | text not null | check `length(btrim(reason)) > 0` |
| moved_cents | bigint not null | |
| diff | jsonb not null | `LineDiff[]` and `MonthDiff[]` (changed cells only) |
| result_hash | text not null | sha256 of the plan result |
| source | text not null | check in (`ui`,`ava`) |
| created_by | bigint not null | `team_members.id` via `getCurrentUser` (401 `no_user` when missing, the same rule as approve) |
| created_by_name | text | |
| restores_revision_id | bigint references billing_revisions(id) | set on an undo |
| status | text not null default 'applied' | check in (`applied`,`restored`) |

Indexes: `(master_id, created_at desc)`, `(lower(mba_number))`, unique `(new_version_id)` where not null.

Also, per changed MBA-month, a `finance_edits` row:

- `record_type = 'billing_revision'`, `edit_type = 'amount_change'`;
- `field_name = '{YYYY-MM}::media|fee'`, `old_value` / `new_value` in dollars;
- `finance_billing_records_id` when a record exists;
- `edited_by`, `edited_by_name`, `published_at` = the new version stamp.

Plus one `app_notifications` row, `audience = 'admin'`, `kind = 'billing_revision'`.

No new columns on existing tables. `billing_overrides.reason` gets the new value `'billing_revision'` (free text today).

### 5.2 Guarded SQL outline for Luke (outline only, not a runnable file)

To be written as `db/migrations/0106_billing_revisions.sql` (AUTHOR ONLY), plus a Drizzle mirror in `db/schema`.

```sql
-- 0106_billing_revisions  (AUTHOR ONLY - Luke runs by hand)
-- Before: SELECT to_regclass('public.billing_revisions');  -- expect NULL (checked 26 Oct: NULL)
--         SELECT key FROM migration_markers ORDER BY applied_at DESC LIMIT 1;  -- expect 0105_client_finance_owners
DO $$
DECLARE n_existing int; n_marker int;
BEGIN
  SELECT count(*) INTO n_existing FROM pg_class WHERE relname = 'billing_revisions' AND relkind = 'r';
  SELECT count(*) INTO n_marker FROM migration_markers WHERE key = '0106_billing_revisions';
  IF n_existing <> 0 OR n_marker <> 0 THEN
    RAISE EXCEPTION 'billing_revisions already exists (table %, marker %). Nothing done.', n_existing, n_marker;
  END IF;

  CREATE TABLE public.billing_revisions ( ... columns as 5.1 ... );
  CREATE INDEX idx_billing_revisions_master_created ON public.billing_revisions (master_id, created_at DESC);
  CREATE INDEX idx_billing_revisions_mba ON public.billing_revisions (lower(mba_number));
  CREATE UNIQUE INDEX uq_billing_revisions_new_version ON public.billing_revisions (new_version_id)
    WHERE new_version_id IS NOT NULL;
  ALTER TABLE public.billing_revisions ENABLE ROW LEVEL SECURITY;   -- same posture as other app tables

  INSERT INTO migration_markers (key, applied_at, note)
  VALUES ('0106_billing_revisions', now(), 'billing revision audit table');

  -- After check inside the block
  IF (SELECT count(*) FROM public.billing_revisions) <> 0 THEN
    RAISE EXCEPTION 'expected an empty table';
  END IF;
END $$;
-- After: SELECT to_regclass('public.billing_revisions');  -- expect billing_revisions
--        SELECT key FROM migration_markers WHERE key = '0106_billing_revisions';  -- expect 1 row
```

- The app does not write a revision unless `migration_markers` has `0106_billing_revisions`. This follows the 0098 web builder pattern. The UI then reads "Billing revisions need migration 0106".
- A feature flag `BILLING_REVISIONS=off|on` (default off) gates the routes, the panel and the tools.

### 5.3 The writer, `publishBillingRevision` (one transaction)

1. Lock the master row (`SELECT ... FOR UPDATE`). Check that the tip is still `baseVersionId`, with both pointer and stamp (`PUBLISHED_VERSION_JOIN_SQL`).
2. Rebuild the locks and rerun `planBillingRevision`. The hash must match.
3. `newVn = max(version_number) + 1` (the same as `resolveVersionNumberForSave`, so an unpublished staged cut above the tip does not collide).
4. Insert the version row as a copy of the base, except:
   - new `id`, `version_number`, `created_at`;
   - `legacy_schedules` = base, with `billingSchedule` rebuilt by `applyRevisionToBillingBlob`;
   - the document file columns are null (regenerated after commit);
   - `approved_slice` is copied. Assert that `totalCents` and each line total are unchanged;
   - `mba_scope` is copied. Refuse if partial.
5. Copy `line_items` verbatim (same `line_item_id`, bursts and attrs).
6. Copy delivery `schedule_months` verbatim. Insert billing rows from the plan result:
   - `source = 'override'` on lines with an override;
   - ad serving and production rows copied (v1);
   - header synthetic rows (`__service__*`) copied unless changed.
7. Assert: `explodeScheduleToMonthRows(newBlob, "billing")` equals the inserted billing rows, to the cent.
8. Copy `mba_fee_snapshots`. Copy `billing_overrides`. For each changed line, upsert `media` (and `fee` when moved) with `mode = 'manual'`, `reason = 'billing_revision'` and the full month list in dollars (`{month: "YYYY-MM", amount}`, the current shape).
9. Run `validateManualOverrideSumRules` against the base auto totals. Refuse on any violation.
10. Copy `campaign_kpi` rows to `(mba, newVn)`. Copy `mba_line_approvals` only when the base has no frozen slice.
11. Stamp `published_at` / `published_by` (`stampVersionPublication`). Set `media_plan_masters.published_version_id` and `version_number` (VP-1 deferred triggers check this at commit).
12. Compute `snapshot_checksum` with `computeSnapshotChecksum` over the new rows.
13. Insert `billing_revisions`, the `finance_edits` rows and `app_notifications`.

After commit (best effort, like a publish):

- `regeneratePlanVersionDocuments(newVersionId)`;
- invalidate the finance hub and pacing caches;
- AA: nothing to do. The due logic picks up the new tip as `amended`.

---

## 6. The UI

### 6.1 Finance row: "Change billing timing" (replaces Alter billing)

- Location: `components/finance/sections/invoicing/InvoicingPlanRow.tsx` three-dots menu. "Alter billing" (`:261-268`) becomes "Change billing timing". It is shown when `BILLING_REVISIONS=on` and the caller is an admin.
- The inline schedule amount edit (`commitInlineScheduleAmountEdit`) also fails today with the same 409. On published versions it becomes read only, with a link to the panel.
- Panel `components/finance/billing-revisions/BillingRevisionPanel.tsx` (a sheet):
  - **Tabs:** Bill ahead (default) · Pull a month · Bill the remainder · Underspend.
  - **Fields:** bill into (month select, default the current Sydney month); amount ($, ex GST); strategy (Earliest months first (default) / Spread across all future months); Include production (off); Fee follows media (on); a chip list of approved months that can be ticked open; reason (required).
  - **Preview** calls `POST /api/finance/billing-revisions/preview` and shows:
    - a before and after grid: rows are lines, columns are months, cells show "before → after", changed cells are highlighted, and locked months are greyed with the reason on hover;
    - month total rows: media, fee, ad serving, production, total;
    - impacts: which months need Re-approve; "Publishes v11 and a new MBA PDF"; AA amended item (when the plan has AA lines); working drafts that go out of date;
    - warnings and skipped lines (client pays, production, no amount).
  - **Confirm** reads "Publish billing revision v11". It calls `POST /api/finance/billing-revisions/apply` with the preview token.
  - On success, a toast and a link to the change log.
  - On 409 `PREVIEW_STALE` or `STALE_BASE_VERSION`, the panel shows the fresh preview.
- `/api/mediaplans/versions/{id}/billing-schedule` stays for unpublished versions only. It already refuses published ones.

### 6.2 Underspend action

- On a month cell of the finance row (past or current month without a hard lock): "Record underspend".
- It opens the same panel on the Underspend tab, with one row per line:
  - plan amount;
  - actual (typed; prefill from pacing delivered spend only if Luke agrees, Q6);
  - gap;
  - where the gap goes (the line's own open months), with the cents.
- Hard-locked months do not show the action. The tooltip says "Invoiced. Underspend on invoiced months is not handled here."

### 6.3 Change log

- A "Billing changes" tab on the finance row expand and on the MBA detail page.
- `GET /api/finance/billing-revisions?mba=` lists the `billing_revisions` rows:
  - when (Sydney time), who, source (UI or Ava), mode, reason;
  - v10 → v11, total moved, months changed;
  - expand to see the line by month diff (from `diff`).
- **Undo** builds a `restore` preview: unlocked months go back to the base values. Months that have since been invoiced are listed as "cannot undo". Apply makes a new revision with `restores_revision_id`.
- `finance_edits` rows also show in the existing finance audit.
- D4: the Excel download is unchanged. It reads the composed records, so it shows the revised months.

---

## 7. Build plan

Every commit is behind `BILLING_REVISIONS` (default off). Node tests use `TZ=UTC` and `TZ=Australia/Melbourne` with `DATABASE_URL=" "`.

| # | Commit | Files | Tests | Confidence |
|---|---|---|---|---|
| C1 | `feat(finance): pure billing revision allocator` | `lib/finance/revisions/types.ts`, `allocateCents.ts`, `planBillingRevision.ts` | `__tests__/allocateCents.test.ts`: remainder on the largest, ties, W=0, BigInt range. `__tests__/planBillingRevision.test.ts`: E1 to E8 as fixtures (exact cents), line totals fixed, locked cells unchanged, no negatives, client pays skipped, production excluded and included, amount over available, zero future months, underspend gap per line, restore, NO_CHANGE, fee follows (SM1-style 25% fixture), fee keep, fixed fee warning | 95% |
| C2 | `feat(finance): month locks for billing revisions` | `lib/finance/revisions/resolveMonthLocks.ts` (pure, takes records, pack items, periods, now) | Hard vs soft per stamp; `xero:` rows; 1970 `exported_at`; AA pack only for AA lines; FINANCE_PERIODS off and on; Sydney month edge at 23:59 on the last day, 31 Oct UTC vs AEDT; mixed-case invoice keys | 90% |
| C3 | `feat(finance): rebuild billing blob from revision cells` | `lib/finance/revisions/applyRevisionToBillingBlob.ts` | Round trip: `explodeScheduleToMonthRows(applyRevisionToBillingBlob(blob, cells))` equals cells for the buxton004 v10 and penfold022 v3 blob fixtures; header `mediaTotal`/`feeTotal`/`totalAmount` strings; adding a month the blob lacks; `__service__fees` untouched | 80% (flag) |
| C4 | `feat(db): billing_revisions table (0106, AUTHOR ONLY)` | `db/migrations/0106_billing_revisions.sql`, `db/schema/*.ts` mirror, marker gate helper | `db:generate` check; marker gate unit test | 90% |
| C5 | `feat(finance): publishBillingRevision writer` | `lib/data/publishBillingRevision.ts`; INVARIANTS line 150 amended (after Luke's yes) | DB integration tests (skip without DATABASE_URL, list for Luke): base untouched (rows, checksum, overrides); new version published and the tip moved; VP-1 holds; checksum recomputed; overrides pass C2; a next `savePlanVersion` publish from the new tip keeps the timing; KPIs copied; stale base 409; preview stale 409; partial MBA refused; `finance_edits` and `billing_revisions` rows | 75% (flag) |
| C6 | `feat(api): billing revision preview, apply, list, undo` | `app/api/finance/billing-revisions/{preview,apply,route,[id]/undo}/route.ts`, `lib/finance/revisions/previewToken.ts`, `loadRevisionContext.ts` | Admin only (403 for client role and non-admin); flag off 404; token tamper, expiry and other user; marker missing 409; 401 `no_user` | 85% |
| C7 | `feat(finance): Change billing timing panel` | `components/finance/billing-revisions/*`, `InvoicingPlanRow.tsx`, `MediaPlanActionBar.tsx`, inline amount gate | vitest (Luke runs; add to `vitest.config.ts` include): panel renders the preview grid, locked month greyed, Confirm disabled without a reason, stale preview refresh. eslint (no hex colours) | 80% (flag) |
| C8 | `feat(ava): preview and apply billing revision tools` | `lib/ava/tools/previewBillingRevision.ts`, `applyBillingRevision.ts`, `registry.ts`, `summaries.ts`, `pageToolOffer.ts`, `types.ts` side channel | Registry sync; offered on `/finance`, not on create or edit; non-admin refused; confirm false refused; token from another user refused; apply without a preview refused | 85% |
| C9 | `feat(finance): billing change log and undo` | `components/finance/billing-revisions/BillingRevisionLog.tsx`, the MBA detail tab | Undo with a since-invoiced month lists "cannot undo"; restore revision links `restores_revision_id` | 80% (flag) |
| C10 | Dropped (Q7: ad serving stays on delivery timing) | | | |
| C11 | `docs(brain): billing revisions` | `docs/brain/INVARIANTS.md`, `KNOWN-ISSUES.md` (MB-16 to fixed), `modules/finance-billing.md`, `MAP.md` | none | 90% |

Order: C1 to C4 can land in any order. C5 needs C1 to C4. C6 needs C5. C7 and C8 need C6. C9 needs C7.

---

## 8. Questions for Luke

Only the ones the code cannot answer.

1. **Invariant change.** May a second writer (`publishBillingRevision`) stamp `published_at`? Today only `savePlanVersion` `mode === "publish"` does (INVARIANTS line 150). Without this, option (a) has to go through the full recompute, which risks changing fee and ad serving.
2. **The new MBA.** Each revision publishes a new version and a new MBA PDF with the new billing page. Does the client need to re-sign, or is the regenerated MBA just kept on file?
3. **Default strategy.** For "bill $100k this month from future months": earliest months first (proposed) or spread across all future months?
4. **Approved months.** May finance tick an approved, not yet sent month open (it then needs Re-approve)? Or are approved months always locked?
5. **Underspend with no remaining months.** When a line has no open months left (for example buxton004 DD5), where does the gap go: the first open month (proposed), the last campaign month, or refuse?
6. **The "actual" in underspend.** Is it typed by finance, or prefilled from pacing delivered spend? If pacing, which figure (platform spend vs planned media gross)?
7. **Ad serving.** Should it stay on delivery timing (v1, no extra work) or follow media like the fee (C10)?
8. **Billing before the campaign starts.** May a bill ahead target a month before the campaign start month (penfold022 starts 16 Nov; today is Oct)?
9. **Version-keyed extras.** Campaign reads and pacing scenarios are keyed by version number. Copy them to the revision, or accept that they need regenerating (the same as any publish today)?
10. **Open working drafts.** If a planner has a working draft on the tip (buxton004 has 1, PENFOLD020 has 2), should the revision block, warn (proposed), or ask the planner first?
11. **Underspend on an invoiced month.** Out of scope (a credit note in Xero), as proposed?

---

## 9. Luke's answers (26 Oct 2026, 18:39) and what the build does

Option (a) approved.

1. **Invariant.** Yes. `publishBillingRevision` may stamp `published_at`. INVARIANTS line 150 now names it and says why (a full `savePlanVersion` recompute could move fee and ad serving).
2. **The new MBA.** No client re-sign. The regenerated MBA PDF is kept on file. The preview says so.
3. **Default strategy.** Earliest months first. Proportional stays an option ("Spread across all future months"). Note: proportional rounds per line-month cell (the pseudo-code in 3.3), so the E5 proportional figures sit up to 17c off the per-month table in 3.9 ($24,833.92 / $72,621.36 / $2,544.72 in the build).
4. **Approved months.** Approved but not sent months can be ticked open. They then need Re-approve.
5. **Underspend with no months left.** Ask the user, two choices per line: the line's last month (when it has a later month that is open, or ticked open) or a credit. The credit is a note in the change log only: no schedule change, no Xero action. A credit-only underspend writes a `billing_revisions` row with status `noted` and no new version.
6. **The actual.** Typed by finance. Pacing delivered spend (MART.VW_PACING_FACT platform spend for the month) shows as a hint where the mart has the line.
7. **Ad serving.** Stays on delivery timing. C10 dropped.
8. **Billing before the campaign starts.** Allowed as a prebill (E8 changed). Past months stay locked for bill ahead.
9. **Version-keyed extras.** `campaign_kpi`, `campaign_reads` (draft and published) and `pacing_scenarios` are copied to the new version.
10. **Open working drafts.** Warn, never block. The preview lists the count.
11. **Underspend on an invoiced month.** Out of scope. The panel shows "Invoiced. Underspend on invoiced months is not handled here."

### Build notes

- Flags: `BILLING_REVISIONS=on` (server: routes, Ava tools) and `NEXT_PUBLIC_BILLING_REVISIONS=on` (browser: panel, menu). Both default off. `BILLING_REVISION_TOKEN_SECRET` (16+ characters) signs preview tokens.
- Migration 0106 is authored, not applied. Run file: `sql/supabase/2026-10-26_0106_billing_revisions_SUPABASE.sql`.
- Undo works only on the newest applied revision while its version is still the published tip.
- The Ava chat card with a Confirm button (`capturedBillingRevisionPreview`) is not built. Ava shows the table in chat and the user confirms in chat; the signed token still binds the apply to what was shown.
- There is no standalone MBA detail page, so the change log lives on the finance row.
