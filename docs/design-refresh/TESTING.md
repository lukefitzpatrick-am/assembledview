# Design refresh — testing

Manual and semi-automated checks to run during or after a UI refresh. Pair with `BASELINE.md` for screenshots, Lighthouse, and bundle metrics.

## Accessibility checklist

Use **two size bars** when judging pointer targets:

| Bar | Size | Reference |
|-----|------|-----------|
| **Minimum (WCAG 2.2)** | At least **24×24 CSS pixels** | [SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — exceptions apply (e.g. inline text links, essential size). |
| **Enhanced / design target** | At least **44×44 CSS pixels** | WCAG 2.1 AAA 2.5.5; common mobile HIG guidance. Use for “feels easy to tap” QA. |

**How to measure:** DevTools → select the node → box model / computed size; or overlay a 24px or 44px grid. Include padding that is part of the clickable area; ignore purely decorative overflow.

### Target size

- [ ] **Primary actions** (submit, main nav, destructive confirms) meet at least **44×44px** where feasible.
- [ ] **All interactive targets** meet **24×24px** minimum, or are documented under an allowed exception (inline link in sentence, user-agent control, essential spatial layout, equivalent larger target on same page).
- [ ] **Dense data UIs** (tables, grids): spot-check that row actions, cell editors, and icon affordances either meet minimum size or have an enlarged hit region (`padding`, `::after` inset, or wrapping `<label>`).
- [ ] **Touch / coarse pointer:** Re-test critical flows at a mobile viewport with a real device or emulator; undersized controls fail here first.

### Focus visible

- [ ] **Keyboard focus** is never invisible: every focusable control shows a clear ring or border change (not only `:focus` that matches mouse styling if that hides the ring).
- [ ] **`focus-visible`:** Mouse clicks do not show a heavy focus ring if the design uses `:focus-visible` intentionally; keyboard Tab **does** show focus.
- [ ] **Contrast:** Focus indicator contrasts with adjacent background (check light/dark themes).
- [ ] **Modals / popovers:** When a dialog or menu opens, focus moves into it; focus trap and return focus on close behave correctly.
- [ ] **Skip link:** If present, it is focusable and visible on focus.

### Keyboard-only navigation

- [ ] **Tab order** follows a logical reading order; no “tab traps” except intentional traps inside modals.
- [ ] **All actions** reachable without a mouse: buttons, links, menus, comboboxes, tabs, accordions, grid editors.
- [ ] **Shortcuts:** Document any custom keys; ensure they do not conflict with browser/SR defaults without mitigation.
- [ ] **Dropdowns / Select:** Open with keyboard, navigate options, select, close with Esc.
- [ ] **Data grids:** Can move between cells/controls without losing focus context; aria labels where icons alone would be ambiguous.

### Quick tooling

- [ ] axe DevTools or Lighthouse accessibility on critical routes (see `BASELINE.md` table).
- [ ] Browser **“Show focus”** or keyboard walk-through on: home/login, dashboard, publishers, a representative media plan / finance screen.

---

## Flagged controls — below target size (static audit)

_The list below is from a one-time pass over shared UI primitives and notable call sites. Re-verify after large refactors; grep for `h-4 w-4`, `size="sm"`, `w-5`, `min-w-[1.25rem]`, etc._

### Below 24×24px (fix or justify with WCAG exception)

| Area | Approx. size | File / notes |
|------|----------------|--------------|
| **Checkbox** *(fixed)* | **16×16** | `components/ui/checkbox.tsx` — hit area expanded to 24×24 while keeping a compact visual box. |
| **Slider thumb** *(fixed)* | **20×20** | `components/ui/slider.tsx` — thumb now includes an invisible expansion ring to meet minimum target size. |

### Meets 24×24px minimum but under 44×44px “enhanced” bar

| Area | Approx. size | File / notes |
|------|----------------|--------------|
| **Button `size="sm"`** *(deferred)* | **36px** tall | Shared `Button` variant (`components/ui/button.tsx`); used widely (e.g. media containers, mediaplan pages, charts). |
| **Toggle / `ToggleGroup` `size="sm"`** *(deferred)* | **~36px** | `components/ui/toggle.tsx`; **`ListGridToggle`** uses `size="sm"` (`components/ui/list-grid-toggle.tsx`) — dashboard, client hub, publishers. |
| **Button `size="icon"`** (default) *(deferred)* | **40×40** | `components/ui/button.tsx` — e.g. Ava collapse in `components/ChatWidget.tsx`. |
| **Publishers “clear filter” icon button** *(fixed)* | **28×28** | `app/publishers/PublishersPageClient.tsx` — visual `h-7 w-7` kept, with enlarged invisible tap target. |
| **Home carousel slide dots** *(fixed)* | **24×24** | `app/page.tsx` — tap target increased to 44×44 while preserving compact dot visuals. |
| **Sidebar row actions** *(fixed)* | **~20px** visual; wider hit area only below `md` | `components/ui/sidebar.tsx` — `SidebarMenuAction` now keeps expanded hit area at all breakpoints. |
| **Expert grid narrow cells** *(partial)* | **~20px** wide columns | `components/media-containers/OohExpertGrid.tsx`, `RadioExpertGrid.tsx` — OOH week-cell width increased to 24px where feasible; full 44px is not practical in dense expert tables. |

### Related primitives to re-check when styling

| Primitive | Notes |
|-----------|--------|
| **`Switch`** | Track is **24×44px** (`h-6 w-11` in `components/ui/switch.tsx`) — passes 24×24 minimum; still under 44×44 as a block. |
| **Icon-only `Button` with custom `h-* w-*`** | Any override smaller than `size="icon"` (e.g. `h-7 w-7`) should be treated as a red flag in review. |

---

**Document version:** 1  
**Last updated:** 2025-03-25
