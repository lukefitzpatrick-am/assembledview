# Edit page — PlanWizardShell discovery

Read-only audit of `app/mediaplans/mba/[mba_number]/edit/page.tsx` (~10,676 lines) to plan a surgical `PlanWizardShell` rollout. Reference implementation: `app/mediaplans/create/page.tsx` + `components/mediaplans/PlanWizardShell.tsx`.

**Shell contract (props):** `{ title, subtitle, heroActions?, steps [{id,label,sub}], railSubItems?, summary {title,client,budget,channels,status,budgetRemaining}, onSave, onExit, isSaving, bottomBar, children }`

---

## 1. Top-level render structure

The page exports `EditMediaPlan` (line 1474). It has **four distinct render branches**:

| Branch | Lines | What renders |
|--------|-------|----------------|
| Bootstrapping | 8310–8448 | Full-page skeleton mirroring the loaded layout (hero + 3-column grids + media skeletons). No sticky action bar. |
| Error | 8451–8462 | Centered error + “Return to Media Plans” (`router.push("/mediaplans")`). |
| **Main (loaded)** | 8465–10673 | Primary editor (see ordered blocks below). |
| (nested inside main) | — | Modals/portals below the form wrapper (see §7). |

### Main branch — ordered major blocks

1. **Outer page wrapper** (8466–8472) — `min-h-screen`, safe-area `paddingBottom`.
2. **Content column** (8473) — `max-w-[1920px]`, `pb-24`, `space-y-6`.
3. **`MediaPlanEditorHero`** (8474–8491) — title `"Edit Campaign"`, subtitle copy, `heroActions` = “Copy Context” (`handleCopyPageContext`).
4. **Form shell** (8493–9429) — `Dialog` (version rollback) + `Form` / `<form className="space-y-6">`.
5. **Row A — Campaign + media toggles** (8520–8815) — `xl:grid-cols-3`:
   - **Campaign Details** card (8521–8774): version badge/combobox, all campaign form fields (client read-only, dates, budget, MBA identifier/number, plan version).
   - **Media Types** card (8776–8814): `Switch` per `mediaTypes` entry via `mediaFlagMap`.
6. **Row B — MBA / billing / KPI** (8817–9025) — `xl:grid-cols-3`:
   - **MBA Details** (8819–8924): per-channel totals, gross/fee/ad serving/production, partial-MBA controls.
   - **Billing Schedule** (8927–9002): summary table, Download Excel, Edit Billing.
   - **KPIs** (9004–9024): `KPISection`.
7. **Media Containers** (9027–9426) — section divider + lazy `*Container` per enabled `mediaTypes` entry, each wrapped in `id={`media-section-${medium.name}`}` with `scroll-mt-24`.
8. **Post-form overlays** (9431–10670) — unsaved dialog, load pill, save/outcome modals, billing modals, partial MBA dialog, sticky spacer + **fixed bottom action bar** (10494–10668).
9. **`FloatingSectionNav`** (10671) — sibling to outer wrapper close; uses `enabledSections`.

### Current header / hero

There is **no wizard rail or draft summary** today. Navigation is:

- App sidebar (layout) — edit sticky bar offsets with `md:left-[var(--sidebar-width)]` (10500–10502).
- `FloatingSectionNav` — floating channel jumper (duplicate concern with shell `railSubItems`).
- Fixed bottom `CampaignExportsSection` pill — primary actions (not a top header).

`PlanWizardShell` will **replace** the hero placement pattern (same `MediaPlanEditorHero` inside shell), add the left rail + summary, and own the bottom bar slot.

---

## 2. Section → step mapping (proposed)

Reuse create-page step IDs and labels (`createCampaignSteps` in create `page.tsx` 381–386):

| Step | Label | Proposed anchor `id` | Edit page content (current lines) | Notes |
|------|-------|-------------------|-----------------------------------|-------|
| 01 | Campaign setup | `campaign-setup` | Campaign Details card (8521–8774) | Wrap in `<section id="campaign-setup" className="scroll-mt-[18px] …">` like create. |
| 02 | Channel allocation | `channel-allocation` | Media Types card (8776–8814) **+** Media Containers block (9027–9426) | On create, toggles live in step 02 but containers are **outside** stepped sections (create ~6985–7478). For edit, **group toggles + containers under one step anchor** OR add a second observed node — prefer one wrapper section for IO clarity. |
| 03 | MBA & billing | `mba-billing` | MBA Details + Billing Schedule + KPIs (8817–9025) | Same 3-card grid as today; partial-MBA buttons stay in MBA card header. |
| 04 | Review & files | `review-export` | **Does not exist yet** | Create step 04 (create ~7479–7513) is a lightweight review + pointer to pinned bar. Add analogous section on edit (date warning duplicate optional — already in bottom bar). |

### Edit-only extras — fit / placement

| Extra | Fits 4-step model? | Recommended home |
|-------|--------------------|------------------|
| Version badge + “Load version” combobox | Yes — metadata | Step 01 header row inside Campaign Details (keep inline). |
| Version rollback `Dialog` | Modal | **Outside** `PlanWizardShell` children (sibling), like create unsaved dialog. |
| Client name disabled | Yes | Step 01 field (unchanged). |
| Read-only MBA number / plan version / MBA identifier | Yes | Step 01 (identity fields). |
| `FloatingSectionNav` | **Conflicts** with shell rail | **Remove** when shell ships (shell `railSubItems` + step nav replace it). |
| `MediaPlanLoadStatusPill` | Orthogonal | Keep **outside** shell (fixed overlay, create has no equivalent). |
| `mp_fixedfee` in schema | No UI on edit | No section; loaded/hydrated only (3121–3122). |
| `handleSaveCampaign` (5798+) | Dead code | Not wired to UI; **do not** bind to shell — use `handleSaveAll` only. |
| Bootstrapping / error layouts | Pre-shell | Optionally wrap in shell later; first pass can keep standalone hero skeleton. |

---

## 3. Summary data sources

Map to `PlanWizardSummary` using the same semantics as create (`wizardSummary` create ~5677–5694).

| Summary field | Source on edit page | Formatter / notes |
|---------------|---------------------|-------------------|
| **title** | `form` field `mp_campaignname` | Add `useWatch({ name: "mp_campaignname" })` (not watched today; only read in effects/handlers). Fallback `"Untitled campaign"`. |
| **client** | `form` field `mp_clientname` | `useWatch({ name: "mp_clientname" })` or `selectedClient?.clientname_input`. Fallback `"No client selected"`. |
| **budget** | `campaignBudget` = `useWatch({ name: "mp_campaignbudget" })` (2411) | `mbaCurrencyFormatter.format(Number(campaignBudget) \|\| 0)` (formatter at 1912–1920). |
| **channels** | Count of enabled media flags | `enabledSections.length` (2467–2474) or `MEDIA_TYPE_KEYS.filter(k => mediaFlagMap[k]).length`. Mirrors create `selectedMediaCount` (excludes `mp_fixedfee`; not in `mediaTypes` array anyway). |
| **status** | `form` field `mp_campaignstatus` | `useWatch({ name: "mp_campaignstatus" })`; display `campaignStatusOptions.find(o => o.value === status)?.label ?? status` (options 1925–1928, values 197–204). Not hard-coded `"Draft"` like create. |
| **budgetRemaining** | **Not computed today** | Mirror create: `(Number(campaignBudget) \|\| 0) - grossMediaTotal` where `grossMediaTotal` is `useMemo` at **1682–1723** (sum of per-channel `*Total` state vars; **excludes production**). Format with `formatMoney` from `@/lib/format/money` (create pattern). |

**Allocated total alternative:** `totalInvestment` state (1911, updated 7606–7618) includes fees/ad serving/production — **do not** use for “budget remaining” if matching create (gross media only).

**Partial MBA:** MBA card displays `partialMBAValues` when `isPartialMBA`; summary budget remaining should stay on **gross media vs campaign budget** unless product asks otherwise.

---

## 4. Save + exit

### Save

| Handler | Lines | Role |
|---------|-------|------|
| **`handleSaveAll`** | 5077+ | **Primary save** — opens `SavingModal`, sets `isSaving`, PATCH master, POST version, line items, KPIs, billing, documents. Bound to bottom bar Save (10531) and unsaved dialog “Save campaign” (9470–9473). |
| `handleSaveCampaign` | 5798+ | Legacy PUT path; **no JSX references** — ignore for shell. |
| `handleSaveAndDownloadAll` | 6659+ | ZIP + `handleSaveAll`; bottom bar (10590, 10653). |

**`isSaving`:** `useState(false)` at **1883**; set true at start of `handleSaveAll` / cleared in `finally` (~5794).

**Shell `onSave`:** wire to `handleSaveAll` (same as create).

### Exit / unsaved navigation

| Piece | Lines | Behavior |
|-------|-------|----------|
| `hasUnsavedChanges` | 2159 | Set via `markUnsavedChanges` on `form.watch` (2231–2236); gated by `navigationHydratedRef` (2185–2187, set after fetch ~3140, 2382–2385). |
| `shouldBlockNavigation` | 2190 | `hasUnsavedChanges && !isSaving && !isLoading` |
| `useUnsavedChangesPrompt` | 2191 | Returns `isOpen`, `confirmNavigation`, `stayOnPage` — **`requestNavigation` not destructured on edit** (create uses it for exit). |
| Unsaved `Dialog` | 9431–9484 | Leave / save / stay. |
| `beforeunload` | via hook | Tab-close warning when blocking. |

**Shell `onExit`:** implement like create `handleExit` (5264–5266):

```ts
const { …, requestNavigation } = useUnsavedChangesPrompt(shouldBlockNavigation)
const handleExit = useCallback(() => requestNavigation("/mediaplans"), [requestNavigation])
```

Hook blocks link clicks and browser back; explicit exit button must call `requestNavigation`, not raw `router.push`.

**After successful save:** confirm `handleSaveAll` clears `hasUnsavedChanges` (grep during implementation — ensure shell Save path resets dirty state).

---

## 5. Bottom-bar actions

Current location: **10494–10668** inside main return (fixed bottom, `stickyBarRef` + spacer 10494–10497).

### Warning rows (above buttons)

- **Date window violation** — `dateWarning` (2010–2013, setter 2495–2546); lines 10505–10511.
- **Billing mismatch** (edit-only) — `hasBillingMismatch` (4876–4883); lines 10513–10519.

### Primary buttons (inside `CampaignExportsSection` `variant="embedded"`)

| Action | Handler | Lines |
|--------|---------|-------|
| **Save** | `handleSaveAll` | 10529–10536 |
| **Generate MBA** | `handleGenerateMBA` (6512+) | 10537–10545 |
| **Media Plan** download | `handleDownloadMediaPlan` | 10598–10610 (desktop), dropdown 10560–10565 (mobile) |
| **Media Plan (AA)** | `handleDownloadAdvertisingAssociatesMediaPlan` | 10611–10635 / dropdown |
| **Naming Conventions** | `handleDownloadNamingConventions` | 10636–10650 / dropdown |
| **Save & Download All** | `handleSaveAndDownloadAll` | 10651–10665 / dropdown |

**Busy guard:** `isDownloading \|\| isDownloadingAa \|\| isNamingDownloading \|\| isLoading \|\| isSaving` (10525).

**Shell migration:** move warnings + `CampaignExportsSection` block into `bottomBar` prop (mirror `wizardBottomBar` create 5698–5806). **Delete** edit-local `stickyBarRef`, `stickyBarHeight` state (1492–1514), spacer div (10494–10497), and sidebar-offset fixed wrapper — shell provides `pb-24`, spacer, and `z-40` full-width bar (shell collapses app sidebar on mount 103–108).

**Create vs edit styling:** edit uses mixed `rounded-full` + legacy colour classes (`bg-lime`, `bg-success`); align to tokenized create bottom bar in a follow-up skin pass if desired.

---

## 6. Channel scroll-spy (`railSubItems`)

### DOM ids (already present)

```tsx
id={`media-section-${medium.name}`}  // e.g. media-section-mp_search
className="mt-4 scroll-mt-24"
```

Rendered at **9049** for each enabled medium in `mediaTypes` order (1372–1397).

### JS-derived nav list (ready to reuse)

```ts
enabledSections = mediaTypes
  .filter((medium) => mediaFlagMap[medium.name])
  .map((medium) => ({ id: `media-section-${medium.name}`, label: medium.label }))
// 2467–2474
```

### Proposed `railSubItems`

Match create (`wizardRailSubItems` create 5662–5675):

```ts
{
  parentStepId: "channel-allocation",
  items: enabledSections.map((s) => ({
    id: s.id.replace("media-section-", ""), // or medium.name — create uses channel.name (mp_*)
    label: s.label,
    scrollTargetId: s.id,
  })),
}
```

**IO behavior (`PlanWizardShell` 118–169):** observes step section ids **and** `scrollTargetId`s; when a media section is top-most visible, rail highlights sub-item and forces parent step to `channel-allocation`.

**`FloatingSectionNav`:** same `sections={enabledSections}` (10671) — uses `document.getElementById(section.id)?.scrollIntoView`. Remove to avoid triple navigation (rail + floating nav + IO).

**`MediaPlanLoadStatusPill`:** scrolls to `media-section-${match.name}` on item click (9496–9499) — keep; independent of shell.

---

## 7. Risks / gotchas

### Tightly coupled state (do not reorder logic when reparenting JSX)

- **Billing triad:** `savedBillingMonths`, `workingBillingMonths`, `autoReferenceBillingMonths`, `autoDeliveryMonths` + append-only merge effects — UI move only.
- **`mediaFlagMap` / `enabledMediaFlagsFingerprint`** — toggling media re-triggers line-item fetch (2461–2465).
- **`navigationHydratedRef`** — prevents false dirty during hydrate; must finish before user edits count.
- **`loadPhase`** — gates divergence modal (7624–7652); bootstrapping branch bypasses shell.
- **KPI debounced rebuild** (2276–2330) — depends on line-item arrays; unrelated to DOM.
- **`grossMediaTotal` / burst handlers** — container callbacks update totals used in MBA card and save payloads.

### DOM / layout assumptions

| Risk | Detail |
|------|--------|
| **Duplicate sticky bars** | Edit + shell both implement `stickyBarRef` / `ResizeObserver` — use shell only. |
| **Sidebar offset** | Edit bar uses `md:left-[var(--sidebar-width)]`; shell uses full viewport width and collapses sidebar — test overlap with app layout. |
| **`overflow-hidden` on ancestors** | Shell rule: no `overflow:hidden` between sticky rail and scroll container. Edit cards use `overflow-hidden` on inner cards (8521, 8776) — OK inside main column; avoid on shell grid parent. |
| **`scroll-mt` mismatch** | Step sections should use `scroll-mt-[18px]` (create); media blocks keep `scroll-mt-24` (9049). |
| **Lazy media containers** | `Suspense` + `loadPhase` loaders — section ids must wrap outer div, not inside lazy child (already correct). |

### Modals — keep **outside** `PlanWizardShell` children (portal siblings)

| Modal / overlay | ~Lines |
|-----------------|--------|
| Version rollback `Dialog` | 8494–8516 |
| Unsaved changes `Dialog` | 9431–9484 |
| `SavingModal` | 9504–9509 |
| `OutcomeModal` | 9511–9517 |
| `BillingDivergenceModal` | 9519–9525 |
| Full billing reset `AlertDialog` | 9527+ |
| Fee drift `AlertDialog` | 9563+ |
| Manual billing `Dialog` | 9622–10238 |
| Partial MBA `Dialog` | 10240–10491 |
| `MediaPlanLoadStatusPill` | 9486–9502 |

### Other

- **10k-line file** — shell wiring should be JSX wrapper + prop memos only; extract bottom bar to a local `wizardBottomBar` const like create.
- **`handleSaveCampaign` dead code** — do not confuse with `handleSaveAll`.
- **Hero title static** — consider `title={\`Edit: ${watchedCampaignName \|\| mbaNumber}\`}` or keep “Edit Campaign” + dynamic summary title.
- **Error / bootstrapping routes** — no bottom bar today; decide whether to show shell with disabled actions or keep minimal layout.

---

## 8. Section → step → anchor table

| Step # | Step id | Anchor element id | Current edit content | Create parity |
|--------|---------|-------------------|----------------------|---------------|
| 01 | `campaign-setup` | `campaign-setup` | Campaign Details card | ✓ (create 5838+) |
| 02 | `channel-allocation` | `channel-allocation` | Media Types toggles + Media Containers | Partial — create toggles only in section; containers unsectioned |
| 02 (rail) | — | `media-section-mp_*` | Per-channel lazy containers | ✓ (`scrollTargetId`) |
| 03 | `mba-billing` | `mba-billing` | MBA Details + Billing + KPIs grid | ✓ (create 6202+) |
| 04 | `review-export` | `review-export` | **To add** — exports hint + optional date warning | ✓ (create 7479+) |

---

## 9. Safe implementation order

1. **Add memos only** — `createCampaignSteps`, `wizardSummary`, `wizardRailSubItems`, `wizardBottomBar`, `handleExit` + destructure `requestNavigation` (no JSX move yet). Verify types compile.
2. **Wrap loaded main return** in `PlanWizardShell` — pass props; move hero into shell; **remove** duplicate `MediaPlanEditorHero` + edit sticky bar + spacer + `FloatingSectionNav`.
3. **Insert section wrappers + ids** — `campaign-setup`, restructure row A so toggles move under `channel-allocation`, wrap row B as `mba-billing`, add minimal `review-export` section.
4. **Move media containers** inside `channel-allocation` section (after toggles) so step IO and scroll-spy align.
5. **Leave all modals** as siblings after `</PlanWizardShell>` (mirror create 7516+).
6. **Bootstrapping / error branches** — optional second PR: wrap in shell or shared layout component.
7. **Visual pass** — bottom bar tokens to match create; remove legacy colour classes if required by design system rules.
8. **Manual QA** — scroll-spy across 4 steps; rail sub-items for 3+ enabled channels; unsaved exit to `/mediaplans`; save modal; billing/manual modals still open; sidebar collapse; mobile bottom bar.

---

## Reference snippets

**Enabled section ids (existing):**

```2467:2474:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const enabledSections = useMemo(() => {
    return mediaTypes
      .filter((medium) => mediaFlagMap[medium.name])
      .map((medium) => ({
        id: `media-section-${medium.name}`,
        label: medium.label,
      }))
  }, [mediaFlagMap])
```

**Save entry point:**

```5077:5080:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const handleSaveAll = async () => {
    setIsSaveModalOpen(true)
    setIsSaving(true)
```

**Unsaved guard:**

```2190:2191:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const shouldBlockNavigation = hasUnsavedChanges && !isSaving && !isLoading
  const { isOpen: isUnsavedPromptOpen, confirmNavigation, stayOnPage } = useUnsavedChangesPrompt(shouldBlockNavigation)
```

**Create shell wiring (target shape):**

```5810:5835:app/mediaplans/create/page.tsx
      <PlanWizardShell
        title="Create a Campaign"
        subtitle={<p>Set up campaign details, select media types, and configure line items.</p>}
        heroActions={...}
        steps={createCampaignSteps.map((step) => ({
          id: step.id,
          label: step.label,
          sub: step.eyebrow,
        }))}
        railSubItems={wizardRailSubItems}
        summary={wizardSummary}
        onSave={handleSaveAll}
        onExit={handleExit}
        isSaving={isWizardSaving}
        bottomBar={wizardBottomBar}
      >
```
