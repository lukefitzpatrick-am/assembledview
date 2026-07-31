# MBA editor diagnosis — budget residual, load stall, dirty-on-load

Branch: `localhost`. Read-only investigation; no app-code changes.

Reproduction target: MBA `jayco003` v5 (budget `$42,653.00`, ~2 line items). Live plan rows were **not** loaded in this session (no Xano/API probing). Mechanism for a exact `−$0.33` residual was reproduced offline against `computeBurstAmounts` + the editor’s `mbaScopeTotals` aggregation. A browser Performance profile was **not** captured; timing claims below that need wall-clock confirmation are marked.

Scratch measurement (deleted; inline `node --import tsx -e`, no repo file left behind):

- Fee/round residual hunt for budget `42653` with two lines.
- `computeCampaignFinancials` microbench: 2 / 50 / 300 lines.

---

## Question 1 — Budget remaining `−$0.33` / “Over campaign budget”

### Root cause

**DRAFT SUMMARY “Budget remaining” is `campaignBudget − mbaScopeTotals.nettExGst`, compared with a strict `< 0` (no dollar tolerance).**  
`nettExGst` is already `roundMoney2`’d and includes **gross media + fee + ad serving + production**. A displayed `−$0.33` therefore means the rounded MBA-scope total is **genuinely 33 cents over** the campaign budget field — not IEEE float dust formatting as money.

Offline reproduction (net-entered media, fee stacked @ 12%): two lines with media `$5,000.00` + `$32,534.93` produce `mbaScopeTotals.nettExGst === 42653.33` → remaining `−0.33`. Same magnitude is **not** produced when two `budgetIncludesFees` grosses that sum exactly to `42653` are split — those land at `0` (or at most a cent or two from round-parts-then-sum in pathological splits).

So for jayco003 specifically, the residual is almost certainly **real cents in the live line/fee/adserving composition**, not a display-only float glitch. Exact per-line breakdown for jayco was not loaded here.

### Evidence (file:line)

| Step | Location |
|---|---|
| Remaining formula | `app/mediaplans/mba/[mba_number]/edit/page.tsx:2750-2754` — `(Number(campaignBudget) \|\| 0) - totalInvestment`; `budgetRemainingOverspend = budgetRemaining < 0` |
| `totalInvestment` source | `:9696-9698` — `setTotalInvestment(campaignFinancials.mbaScopeTotals.nettExGst)` |
| Financials memo | `:6189-6205` — `computeCampaignFinancials(...)` |
| Summary wiring | `:10539-10549` — `budgetRemaining: formatMoney(budgetRemaining)`, `budgetRemainingOverspend` |
| UI flag copy | `components/mediaplans/PlanWizardShell.tsx:289-302` — “Budget remaining” / “Over campaign budget” |
| Burst fee math (no round) | `lib/mediaplan/burstAmounts.ts:97-125` — raw `budget * (pct/100)` / gross-up |
| Per-line round | `lib/finance/computeCampaignFinancials.ts:601-603` — `roundMoney2` on accumulated media/fee/nett **after** summing bursts |
| Scope totals round | `:983-989` — `grossMedia` / `fee` / `adServing` / `production` each rounded, then `nettExGst = roundMoney2(grossMedia + fee + adServing + production)` |
| Money helpers | `lib/format/money.ts:240-251` — `roundMoney2` / `roundMoney4` (editor path uses **`roundMoney2` only** via the finance engine; summary display uses `formatMoney` → 2 dp) |
| Builder issue (same flag) | `edit/page.tsx:6498-6505` |
| Contrast: create page | FIXED — create now uses `nettExGst` via `lib/mediaplan/campaignBudgetRemaining.ts` (same basis as edit). |
| Elsewhere: $0.01 tolerance | `lib/finance/validateBillableEqualsMba.ts:16-29`; billing save `BILLING_AUTO_EQUALITY_TOLERANCE = 0.01` in `recomputeBillingScheduleOnSave.ts` |
| Elsewhere: $2 warn-only | `edit/page.tsx:9585-9587` — partial-MBA save uses `Math.abs(diff) > 2` |

### Rounding point (answer to the sub-questions)

1. **Residual floating-point accumulation?** Unrounded burst fee math can leave binary dust, but that dust is collapsed by `roundMoney2` before scope totals. A **33-cent** residual is **not** dust; it is rounded money that does not equal the budget.
2. **Wrong rounding point?** Yes, in the usual “round each part, then sum” sense: media and fee are rounded **per line**, then summed and rounded again into `nettExGst`. That can create small (cent-level) disagreements versus “sum then round” or versus sum of per-line `nett`. The offline hunt also shows **planner-scale** mismatches when net media + stacked fee simply do not equal the budget after rounding — that is data/composition, not float noise.
3. **Exact `>` / `<` with no tolerance?** Yes: `budgetRemaining < 0` with no epsilon. Finance elsewhere uses **$0.01**. A cent tolerance is legitimate **only** for sub-cent dust; it is **not** legitimate to hide a true `−$0.33` if `nettExGst` is `42653.33`.
4. **Saved vs UI?** The “Over campaign budget” **label** is UI-only. The underlying `nettExGst` is the same engine used on save / billing recompute. If the live lines compute to `42653.33`, that overspend is a **stored financials** property once saved (schedule / scope totals), not a paint artefact. The campaign budget field can still read `42653.00` — the mismatch is budget field vs computed scope, not `formatMoney` inventing cents.

### Proposed fix

1. **Confirm on jayco003 v5** (settles the live composition — see experiment below): log `campaignBudget`, `mbaScopeTotals.{grossMedia,fee,adServing,production,nettExGst}`, and `perLine[{media,fee,nett,budgetIncludesFees}]`.
2. If `adServing`/`production` explain the 33¢: decide whether “Budget remaining” should mean **media+fee vs budget** or **full nett** (product decision — edit currently uses full nett; create uses gross media only).
3. If line media+fee simply overshoot by 33¢: fix the line amounts / fee flags (data), or show a breakdown (“fee rounding / ad serving”) rather than widening tolerance.
4. Optional hardening (safe, small): compare with `roundMoney2(budget - nettExGst) < -0.01` (align with billable=MBA), **not** a 33¢ band.
5. Align create vs edit remaining definitions so planners see one meaning of “budget”.

### Confidence

| Claim | Confidence |
|---|---|
| Formula + strict `< 0` + `nettExGst` source | **98%** |
| Editor uses `roundMoney2` (not `roundMoney4`) on this path | **98%** |
| `−$0.33` is real cents, not float display dust | **95%** |
| Exact jayco003 v5 composition (which lines / fee% / ads) | **55%** — needs live log |
| Cent tolerance alone is the right fix | **10%** — wrong if total is `42653.33` |

**Experiment to get above 90% on jayco:** with the editor open on `jayco003?version=5`, after hydration, in DevTools:

```js
// paste wherever campaignFinancials is reachable, or temporary console.log in the budgetRemaining useMemo
```

Log `form.getValues("mp_campaignbudget")`, `campaignFinancials.mbaScopeTotals`, and each `perLine` media/fee/nett. Delete the log after capture.

---

## Question 2 — ~40s “Loading…” and blocked main thread

### Root cause

The Save CTA label **“Loading…”** is shown whenever `saveHeldForHydration` is true — i.e. `computeAllChannelsHydrated(...)` is still false — **not** because react-hook-form is validating and not because `isSaving`. There is no reason string (which channel / which phase); the same label is reused in the wizard rail via `saveDisabled`.

Hydration requires:

1. `loadPhase === "ready"` (parallel per-channel fetches finished or errored), and  
2. every enabled flag `mediaLoadStatus === "ready"|"error"` **and** `channelHydrationSettled[flag] === true` (container published line items, or empty/error settled in the loader).

Fetch timeouts on the edit page are **15s initial + 25s auto-retry = 40s** for a single slow/failing channel. `Promise.all` waits for the slowest channel, so Save can sit on “Loading…” for ~40s even on a 2-line plan if one of the enabled channel GETs is slow. Hard ceiling: `HYDRATION_WATCHDOG_MS = 50_000`.

`computeCampaignFinancials` itself is **not** the 40s cost: scratch microbench on this machine was ~7ms (2 lines), ~20ms (50), ~70–80ms (300). The standing F-28 concern (300+ expert-grid rows) is about **grid mount/update**, not the pure finance engine.

`forceMount` on `LazyMountWhenVisible` is still `loadPhase === "ready"` (`edit/page.tsx:11494`). Section UI can clear its local loader when that channel is `ready`, but force-mount of off-screen containers still waits for **global** ready — then mounts are staggered **one per `requestAnimationFrame`** (`staggerVisibleMount.ts`). Brain/C-10 describes force-mount “once past section loader”; the prop does not pass per-channel readiness.

### Evidence (file:line)

| Step | Location |
|---|---|
| Save label | FIXED — floating Save uses `formatSaveHydrationHoldReason` (names channel / count); draft-summary duplicate Save removed |
| Wizard rail | FIXED — draft summary shows hold reason as status text; Exit is “Exit to Campaigns” |
| Gate | `edit/page.tsx:2820-2831` + `lib/mediaplan/channelHydrationGate.ts:23-34,133-139` |
| Parallel loads | `edit/page.tsx:3902-3988` — `Promise.all` per enabled media type |
| Timeouts | `:1673-1680` — `15_000` / `25_000` / watchdog `50_000` |
| Empty settle in loader | `:3949-3956` |
| Watchdog | `:4018-4069` |
| Stagger mount | `lib/mediaplan/staggerVisibleMount.ts:9-35` |
| Lazy mount | `components/media-containers/LazyMountWhenVisible.tsx:55-70` |
| F-28 context | `lib/mediaplan/expertGridRowPerf.ts`, `components/media-containers/ExpertGrid.tsx` (row virtualization) |
| Known C-10 | `docs/brain/KNOWN-ISSUES.md` C-10 (marked FIXED; compare current `forceMount={loadPhase === "ready"}`) |

### Network vs main thread

| Phase | Dominated by | Evidence |
|---|---|---|
| Save stuck ~40s on “Loading…” | **Network / settle gate** (timeout+retry or slow channel + waiting for all settles) | 15s+25s constants; gate ignores finance CPU |
| Finance recompute | Main thread, **tens of ms** even at 300 lines | Scratch microbench |
| Heavy ExpertGrid mount after ready | Main thread (F-28); can feel like jank **after** fetches | Mount-all-channels + stagger; not measured in browser here |

**Refute** “40s is mostly `computeCampaignFinancials` on the main thread”: microbench says no.  
**Confirm** “renderer jank while grids mount” only with a Performance profile (experiment below) — plausible for large plans, not proven for jayco’s 2 lines.

### Scaling (measured + expected)

| Plan size | `computeCampaignFinancials` (scratch) | Save “Loading…” wall time |
|---|---|---|
| 2 lines | ~7 ms | Dominated by slowest channel fetch (+ settle). Can still hit ~40s if one GET times out+retries. |
| 300 lines | ~70–80 ms | Same gate; plus ExpertGrid mount/virtualization (F-28). Finance engine remains sub-100ms. |

### Per keystroke / per render

- Many `useWatch` fields on the mega-page (`:2719-2743`) re-render the page on field changes.
- `campaignFinancials` / `campaignFinancialsForPanels` are `useMemo`’d — recompute when `billingSaveInputs` / dates / partial selection change, **not** on every keystroke into unrelated fields.
- Channel total handlers (`handleTelevisionTotalChange`, etc.) call `markUnsavedChanges` when totals change — after hydration that is dirty tracking, not the Save “Loading…” latch.
- No evidence that budget remaining itself is recomputed without memo; it is a small `useMemo` on `[campaignBudget, totalInvestment]`.

### Proposed fix

1. Replace bare “Loading…” with a reason: e.g. `Loading channels… (Search)` from unsettled flags / `loadPhase`.
2. Align `forceMount` with C-10 intent: `forceMount={sectionStatus === "ready" \|\| sectionStatus === "error"}` so off-screen channels settle as soon as **their** GET returns, without waiting for the global slowest sibling (Save still waits for all, but progressive settle + less watchdog risk).
3. Treat 15s+25s as the operational explanation for “~40s” reports; consider fail-soft earlier with the existing per-section Retry UI.
4. For F-28 / 300+ rows: keep investing in expert-grid virtualization (already started); do not chase finance-engine memoisation for the 40s symptom.

### Confidence

| Claim | Confidence |
|---|---|
| CTA waits on `saveHeldForHydration` / channel gate | **98%** |
| Label is not a disabled-with-reason state | **98%** |
| ~40s ≈ 15s+25s timeout path (or near-watchdog) | **88%** — confirm with Network panel on a repro |
| Finance engine not the 40s cost | **95%** (microbench) |
| Main-thread jank from grids on large plans | **70%** — needs Performance profile |
| jayco 2-line wall-clock | **unmeasured** |

**Experiment:** Chrome Performance + Network while opening `jayco003` v5 and a large MBA (300+ lines). Mark: (a) time until each channel GET completes, (b) time until `saveHeldForHydration` clears, (c) long tasks during container mount. Log `[DATA LOAD]` console lines already emitted by the loader.

---

## Question 3 — Dirty-on-load (beforeunload / unsaved dialog with no user edits)

### Root cause

Unsaved navigation is **not** react-hook-form `formState.isDirty`. It is a **hand-rolled** `hasUnsavedChanges` boolean fed by:

1. `form.watch(() => markUnsavedChanges())` — any form value change after the gate opens, and  
2. Channel total / line-item callbacks that call `markUnsavedChanges()` when `setIfChanged` reports a change (line-item path only after the channel has already settled once).

The gate (`navigationHydratedRef`) stays closed until `allChannelsHydrated`, then clears dirty and opens after a **400ms** grace (`:2836-2848`). Anything that writes the form or re-publishes channel totals **after** that window marks the page dirty with no user keystroke.

Strongest concrete form write without `shouldDirty: false`:

```ts
form.setValue("mbaidentifier", nextMbaId) // edit/page.tsx:3686 — no shouldDirty: false
```

This runs from the client-lookup effect when `clients` resolve. If that happens after the 400ms gate opens, `form.watch` → dirty → `beforeunload` / in-app unsaved modal.

Secondary (same symptom class): late `applyClientFees` → fee state update → container re-transform → second `onMediaLineItemsChange` with `alreadySettled === true` → `markUnsavedChanges()` (`:8924-8929` pattern). First settle is intentionally ignored; **second** publish is not.

`beforeunload` reads the hand-rolled flag via `useUnsavedChangesPrompt(shouldBlockNavigation)` where `shouldBlockNavigation = hasUnsavedChanges && !isSaving && !isLoading` (`:2402-2403`, hook `:110-122`).

### Evidence (file:line)

| Step | Location |
|---|---|
| Hand-rolled flag | `edit/page.tsx:2371`, `markUnsavedChanges` `:2397-2400` |
| `form.watch` → dirty | `:2547-2552` |
| Gate + 400ms grace | `:2833-2848` |
| `form.reset` on load (gate closed) | `:3585-3588` |
| `mbaidentifier` setValue **without** `shouldDirty: false` | `:3682-3687` |
| Contrast: `mp_plannumber` / `mp_production` use `{ shouldDirty: false }` | `:2974`, `:3780`, `:3943` |
| Line-item dirty only after first settle | `:8924-8929` (and siblings) |
| Totals always dirty when changed | `:8802-8921` — no settle guard |
| Prompt + beforeunload | `hooks/use-unsaved-changes-prompt.ts:15-16,110-122` |
| Draft session also keyed off `dirty: hasUnsavedChanges` | `edit/page.tsx:6369-6372` |

### Proposed fix (dialog only on genuine user edits)

1. **Immediate / safe:** `form.setValue("mbaidentifier", nextMbaId, { shouldDirty: false })` (and audit other bootstrap `setValue`s: `mbanumber` at `:5015` likewise).
2. Keep gate closed until client fees + mbaidentifier bootstrap finish, **or** bump grace until `clients` lookup effect has run once for this MBA.
3. For channel callbacks: ignore total/line publishes until `navigationHydratedRef.current` is true **and** optionally until a short “passive settle” fingerprint matches (first post-fee publish).
4. Do **not** switch the beforeunload guard to raw RHF `isDirty` without also fixing bootstrap `setValue`/`reset` options — RHF would still dirty on the same writes.
5. Optional: `form.reset(formData, { keepDefaultValues: false })` already replaces defaults; ensure no later `reset` without closing the gate.

### Confidence

| Claim | Confidence |
|---|---|
| Guard is hand-rolled `hasUnsavedChanges`, not RHF `isDirty` | **99%** |
| `form.watch` is the broad dirty tripwire | **97%** |
| `mbaidentifier` setValue can dirty after gate open | **90%** |
| Late fee → second line-item publish also dirties | **85%** |
| Which of the two fires first on jayco cold load | **60%** — needs one instrumented load |

**Experiment:** temporary counters inside `markUnsavedChanges` (stack or reason: `"watch"` vs `"totals:television"` vs `"lines:search"`) for one jayco load; remove before any fix commit.

---

## Verdict for Luke

| # | Root cause (short) | Confidence | Fix now? |
|---|---|---|---|
| 1 | Strict `budget − nettExGst < 0`; `−$0.33` is real rounded cents (fee/line/ads composition), not float paint | Path **98%**; jayco composition **55%** | **Needs Luke:** confirm whether budget means full nett; do **not** paper over 33¢ with tolerance until jayco numbers are logged. Align create vs edit. |
| 2 | Save “Loading…” = channel hydration gate; ~40s matches 15s+25s fetch timeout/retry; finance CPU is ~ms | Gate **98%**; 40s network **88%** | **Safe now:** reason-bearing label; per-section `forceMount`. Timeout policy is a product/ops call. |
| 3 | Hand-rolled dirty + `form.watch`; bootstrap `mbaidentifier` setValue (and late channel republish) after 400ms gate | **90%+** on mechanism | **Safe now:** `shouldDirty: false` on bootstrap writes; optionally hold gate until client lookup completes. |

### Safe to fix immediately

- Q3 `shouldDirty: false` on bootstrap `setValue`s.  
- Q2 Save label copy + per-channel `forceMount` aligned with C-10.

### Needs a decision from Luke

- Q1: definition of “Budget remaining” (nett vs media-only vs media+fee); whether jayco’s 33¢ is accepted planner imbalance vs an engine bug once lines are logged.  
- Q2: whether to shorten the 15s/25s timeout pair (trade failed loads vs long “Loading…”).
