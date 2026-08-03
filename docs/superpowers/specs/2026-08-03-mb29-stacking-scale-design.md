# MB-29: one overlay stacking scale

**Date:** 2026-08-03  
**Status:** Approved — implement  
**Branch:** localhost (one commit)  
**Prereq:** MB-26 (`975edecf`)  
**Related:** live defect — AlertDialog opened from MbaBillingModal traps focus under an invisible layer

## Problem

MB-26 raised MbaBillingModal to `z-[60]` so Apply cleared Ask Ava (`z-50`). AlertDialog (and other nested confirms) stayed at `z-50`, so confirms opened from inside the MBA modal rendered **beneath** the modal overlay: invisible, still modal, focus-trapped, UI looks live and is not.

Raising only billing components to `z-[70]` continues the race. Moving Dialog to a higher tier **without** raising portaled popovers breaks every Select/Dropdown inside every dialog: Radix portals into `body` at `z-50` and today win on DOM order against dialog content also at `z-50`; an explicit higher dialog z-index beats DOM order and the menu paints behind the dialog.

## Decision

**Approach A (approved), with mandatory popover tier:** one named z-index scale in the Tailwind theme, documented by `lib/ui/stackingLayers.ts`. Primitives carry defaults. No per-callsite `z-[N]` bumps for overlay stacking. Nested dialogs that can open over a primary modal take a caller-owned `layer="nested"` prop (not a hardcoded class on the child).

## Scale (single source)

Defined in `tailwind.config.cjs` → `theme.extend.zIndex` and mirrored (names + numeric values + comments) in `lib/ui/stackingLayers.ts`.

| Token (class) | Value | Role |
|---|---:|---|
| `z-chrome` | 40 | App chrome / sticky bars (when they participate in the root overlay stack) |
| `z-assistant` | 50 | Ask Ava FAB (`ChatWidget`) |
| `z-modal` | 60 | Primary `Dialog`, `Sheet`, MbaBillingModal (default) |
| `z-nested` | 70 | `AlertDialog` default; any `Dialog` opened from inside a modal via `layer="nested"` |
| `z-popover` | 80 | Select · DropdownMenu · Popover · Combobox surfaces · ContextMenu (if/when present) |
| `z-tooltip` | 90 | Tooltip |
| `z-toast` | 100 | Toast viewport |

**Ordering invariant:** chrome < assistant < modal < nested < popover < tooltip < toast. Popovers must clear nested dialogs so menus opened from a confirm still work.

**Same-tier rule (mandatory):** Any surface opened from inside another surface **must declare a higher layer**. Never rely on portal DOM order among peers at the same z-index — that is the fragility MB-26 exposed (Select-over-Dialog worked by accident until Dialog moved above `z-50`). Concrete cases:

- Dialog / AlertDialog opened from inside a `Dialog` or `Sheet` → caller passes `layer="nested"` (or uses AlertDialog, which defaults to nested).
- Sheet and Dialog both default to `z-modal`; a Sheet-hosted Dialog that stays at modal recreates the bug one level up.

The `layer="nested"` prop on DialogContent (and on AlterBillingDialog / BillingDivergenceModal) is the mechanism for this rule.

**Out of the overlay scale:** ExpertGrid sticky/in-cell floats live in a table stacking context. They get **in-surface** named tokens (e.g. `z-eg-sticky`, `z-eg-sticky-week`, `z-eg-cell-float`) in a low band (≤30), not overlay values, so they never compete with modals and the guard does not force them onto `z-modal`.

## Primitives — defaults

| File | Default tier |
|---|---|
| `components/ui/dialog.tsx` | Overlay + content → `z-modal`. Support `layer?: "modal" \| "nested"` (default `"modal"`) on `DialogContent`; when `"nested"`, both overlay and content use `z-nested`. Keep existing `overlayClassName` only as an escape hatch that **must not** introduce raw `z-[digits]` (guarded). |
| `components/ui/alert-dialog.tsx` | Overlay + content → `z-nested` always (confirms are the nested tier). |
| `components/ui/sheet.tsx` | Overlay + content → `z-modal`. |
| `components/ui/select.tsx` | Content → `z-popover`. |
| `components/ui/dropdown-menu.tsx` | Content / subcontent → `z-popover`. |
| `components/ui/popover.tsx` | Content → `z-popover` (today `z-[200]` — re-point onto the scale; do not leave a rogue 200). **Behaviour change:** popovers drop below toasts (`z-toast` 100). Correct stacking; call out in the commit message so it is not discovered as a surprise. |
| `components/ui/command.tsx` | No own z-index; `CommandDialog` inherits Dialog (`z-modal`). Popover-hosted comboboxes inherit Popover (`z-popover`). |
| `components/ui/tooltip.tsx` | Content → `z-tooltip`. |
| `components/ui/toast.tsx` | Viewport → `z-toast` (replace `z-[100]`). |

No `context-menu.tsx` in tree today; if added later, default to `z-popover`.

## Billing / assistant re-point

| Site | Change |
|---|---|
| `components/ChatWidget.tsx` | `z-50` → `z-assistant`. |
| `components/billing/MbaBillingModal.tsx` | Drop `overlayClassName="z-[60]"` and content `z-[60]`; inherit Dialog `z-modal`. Update footer comment (no longer “above Ask Ava via z-60”). |
| `components/billing/PrebillScopeDialog.tsx` | Inherit AlertDialog `z-nested` (no local z). |
| `components/billing/BillingCollisionWorksheet.tsx` | Same. |
| `components/billing/DateBasisKeepResetDialog.tsx` | Same. |
| Edit + create page AlertDialogs (`fullBillingResetConfirmOpen`, `feeDriftConfirmOpen`, etc.) | Same — no page-local z. |
| `components/billing/AlterBillingDialog.tsx` | Add optional `layer?: "modal" \| "nested"` passed through to `DialogContent` (default `"modal"`). Callers that open it over MbaBillingModal pass `layer="nested"`. |
| `components/billing/BillingDivergenceModal.tsx` | Same `layer` prop pattern. |

Sweep `components/billing/**` and create/edit MBA pages for any other Dialog/AlertDialog reachable from inside a modal; list findings in the commit/PR body. Do not bump individuals to `z-[70]`.

## ExpertGrid

- `expertGridSticky.ts`: replace `z-[60]` / `z-[55]` with named in-surface tokens (`z-eg-sticky`, `z-eg-sticky-week`).
- `ExpertGrid.tsx` absolute cell controls (`z-[60]`, `z-[70]`): same family (`z-eg-cell-float` / higher sibling token), with a one-line comment that these are in-grid, not overlay.

## Guard

Script patterned on `scripts/check-billing-line-id-equality.mjs`:

- **Scan set:**  
  `components/ui/dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `select.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `command.tsx`, `tooltip.tsx`, `toast.tsx`,  
  `components/billing/**`,  
  `components/ChatWidget.tsx`,  
  `components/media-containers/expertGridSticky.ts`,  
  `components/media-containers/ExpertGrid.tsx` (for the former raw sticky/float literals).
- **Fail on:** raw overlay literals `z-50`, `z-[digits]` (and `z-\[digits\]` in template strings) in those paths.
- **Allow:** named tokens from the scale (`z-chrome` … `z-toast`) and in-surface `z-eg-*`.
- **Error message** must name the scale (`lib/ui/stackingLayers.ts` / theme `zIndex` keys) and forbid fixing by inventing another `z-[N]`.
- Wire `package.json` script (e.g. `check:stacking-layers`) and run it wherever `check:billing-line-id-equality` already runs in CI.

## Brain (same commit)

- `docs/brain/modules/finance-billing.md`: replace MB-26 “dialog `z-[60]` above Ask Ava” with the scale + nested AlertDialog default.
- `docs/brain/KNOWN-ISSUES.md`: MB-26 row stays FIXED; add MB-29 FIXED (commit) for nested-under-modal freeze; note popover tier as part of the fix.
- `docs/brain/INVARIANTS.md`: one line — overlay z-index only via the named stacking scale; nested confirms ≥ nested; portaled menus ≥ popover.

## Verify

Live, MBA edit **and** create:

1. Reset billing to auto — confirm on top; both buttons work.  
2. Prebill on fee-bearing line with no remembered scope — scope dialog on top.  
3. Force fee drift — confirm reachable.  
4. Open a Select / Dropdown inside MbaBillingModal (and inside a nested confirm if present) — menu paints above the dialog.  
5. Ask Ava still sits under the MBA modal; toasts still above menus.

## Non-goals

- No redesign of modal UX or billing state.  
- No per-feature z bumps outside the scale.  
- MB-30 (workingBillingMonths duplicate line) is a separate ticket.

## Implementation note

One commit on `localhost`. After spec approval → writing-plans → implement.
