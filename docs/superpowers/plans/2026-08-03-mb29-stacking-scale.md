# MB-29 Stacking Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One named overlay z-index scale so nested confirms and portaled menus stack correctly over Dialog/Sheet/MbaBillingModal, with a CI guard that forbids raw overlay literals.

**Architecture:** Theme `zIndex` keys + `lib/ui/stackingLayers.ts` as the contract. Primitives default to the right tier; DialogContent (and billing wrappers) expose `layer="modal"|"nested"`. ExpertGrid uses in-surface `z-eg-*` tokens. Guard script fails on raw `z-50` / `z-[digits]` in the scan set.

**Tech Stack:** Tailwind theme (`tailwind.config.cjs`), Radix UI primitives, Node guard script, brain docs.

**Spec:** `docs/superpowers/specs/2026-08-03-mb29-stacking-scale-design.md` (Approved)

## Global Constraints

- Same-tier rule: any surface opened from inside another must declare a higher layer; never rely on DOM order.
- No per-callsite `z-[N]` overlay bumps.
- Popover `z-[200]` → `z-popover` (80), below toast (100) — call out in commit.
- One commit on `localhost` for MB-29.
- Fee / bursts / line_item_id contracts untouched.

---

### Task 1: Theme + stackingLayers contract

**Files:**
- Modify: `tailwind.config.cjs` — add `theme.extend.zIndex`
- Create: `lib/ui/stackingLayers.ts`

**Produces:** Named classes `z-chrome` … `z-toast`, `z-eg-sticky`, `z-eg-sticky-week`, `z-eg-cell-float`, `z-eg-cell-float-hi`

- [ ] **Step 1: Add zIndex to Tailwind**

In `tailwind.config.cjs` under `theme.extend`, add:

```js
zIndex: {
  chrome: "40",
  assistant: "50",
  modal: "60",
  nested: "70",
  popover: "80",
  tooltip: "90",
  toast: "100",
  // In-surface (ExpertGrid) — not overlay stack
  "eg-sticky-week": "10",
  "eg-sticky": "20",
  "eg-cell-float": "30",
  "eg-cell-float-hi": "40",
},
```

- [ ] **Step 2: Create `lib/ui/stackingLayers.ts`**

Export a documented const map mirroring the theme values + comments for same-tier rule and popover-below-toast.

- [ ] **Step 3: Commit deferred** — land with Task 5 as one commit per spec.

---

### Task 2: Re-point UI primitives

**Files:**
- Modify: `components/ui/dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `select.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `toast.tsx`
- Note: `command.tsx` has no own z — inherits Dialog

**Produces:** DialogContent `layer?: "modal" | "nested"` (default `"modal"`) applies matching class to overlay + content.

- [ ] **Step 1: dialog.tsx** — default `z-modal`; `layer="nested"` → `z-nested` on overlay and content; keep `overlayClassName` but do not document raw z bumps.
- [ ] **Step 2: alert-dialog.tsx** — `z-nested` on overlay + content.
- [ ] **Step 3: sheet.tsx** — `z-modal`.
- [ ] **Step 4: select / dropdown-menu / popover → `z-popover`; tooltip → `z-tooltip`; toast viewport → `z-toast`.

---

### Task 3: Billing, ChatWidget, ExpertGrid, callers

**Files:**
- Modify: `components/ChatWidget.tsx`, `components/billing/MbaBillingModal.tsx`, `AlterBillingDialog.tsx`, `BillingDivergenceModal.tsx`
- Grep callers of AlterBilling / Divergence opened over MBA modal → pass `layer="nested"`
- Grep Sheet-hosted Dialogs → `layer="nested"`
- Modify: `expertGridSticky.ts`, `ExpertGrid.tsx` → `z-eg-*`

- [ ] **Step 1:** ChatWidget → `z-assistant`
- [ ] **Step 2:** MbaBillingModal drop `z-[60]` / `overlayClassName="z-[60]"`; update footer comment
- [ ] **Step 3:** AlterBillingDialog + BillingDivergenceModal accept `layer` → DialogContent
- [ ] **Step 4:** Wire callers that open over a modal/sheet
- [ ] **Step 5:** ExpertGrid sticky + cell floats → eg tokens

---

### Task 4: Guard script + package.json

**Files:**
- Create: `scripts/check-stacking-layers.mjs`
- Modify: `package.json` (`check:stacking-layers`)

- [ ] **Step 1:** Fail on `\bz-50\b` and `z-\[\d+\]` in scan set; allow `z-(chrome|assistant|modal|nested|popover|tooltip|toast|eg-\S+)`.
- [ ] **Step 2:** Error message points at `lib/ui/stackingLayers.ts`.
- [ ] **Step 3:** Run script — expect exit 0.

---

### Task 5: Brain + commit

**Files:**
- Modify: `docs/brain/modules/finance-billing.md`, `KNOWN-ISSUES.md`, `INVARIANTS.md`
- Spec already updated

- [ ] **Step 1:** Brain edits per spec
- [ ] **Step 2:** Single commit mentioning popover→below-toast behaviour change

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Scale + stackingLayers | 1 |
| Same-tier rule in doc (already in spec) | done |
| Primitive re-point + layer prop | 2 |
| Billing / Chat / ExpertGrid | 3 |
| Guard scan set incl. select…sheet | 4 |
| Brain + commit note popover/toast | 5 |
| Popover z-200 → 80 called out | 5 commit msg |
