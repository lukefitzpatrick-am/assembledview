# Design refresh — system rules (approved UI)

This document is the **normative** UI contract for new and migrated screens. It aligns with the shared primitives under `components/layout`, `components/ui`, chart helpers under `components/charts`, and tokens in `app/globals.css` plus `tailwind.config.js`.

---

## Dashboard layout primitives

### Default: `Panel` and `PanelRow`

- **`Panel`** (`components/layout/Panel.tsx`) is the **default bordered surface** for dashboard-style content: headers, descriptions, actions, and body regions with consistent padding, border, and shadow. It maps visually to the design system via `border-border`, `bg-card`, and `text-card-foreground`.
- **`PanelRow`** + **`PanelRowCell`** (`components/layout/PanelRow.tsx`) are the **default section layout** for dashboard pages: a titled section with optional helper text and actions, and a **12-column responsive grid** (`full` / `half` / `third` / `quarter` / `twoThirds` spans; stacked on small viewports).
- **Page shell:** Dashboard routes that sit above the grey shell should use **`bg-dashboard-surface`** on the outer page wrapper (with consistent horizontal padding) so raised panels read clearly against the shell.

New dashboard UI should compose **PanelRow → PanelRowCell → Panel** (or KPI / chart children inside cells) unless a rule below explicitly allows an exception.

---

## Semantic tokens — usage rules

Use **token-backed Tailwind classes** so light/dark and future theme tweaks stay centralized. Avoid raw `hsl(...)` in JSX except where a library requires inline values (e.g. some SVG/chart APIs); prefer `hsl(var(--…))` only inside shared chart/theme utilities when necessary.

### Core (CSS variables in `app/globals.css`)

| Token | Typical use |
|-------|-------------|
| **`background` / `foreground`** | Page default: `bg-background`, `text-foreground` on `body` and full-page layouts outside nested surfaces. |
| **`card` / `card-foreground`** | **Raised surfaces** inside the app: panels, cards, and any inset “sheet” that should match the shadcn surface treatment. `Panel` uses these for its chrome. |
| **`border`** | Dividers and outlines: `border-border` (also applied globally to `*` in base styles). |
| **`muted` / `muted-foreground`** | De-emphasized blocks and helper copy: `bg-muted`, `text-muted-foreground`, subtle table zebra or chart chrome. |
| **`popover` / `popover-foreground`** | Floating UI that sits above content: dropdown panels, chart tooltips, hover cards — `bg-popover`, `text-popover-foreground`, with `border-border` as needed. |
| **`primary` / `primary-foreground`** | Primary actions and strong brand emphasis: main buttons, key links, active nav affordances. |
| **`destructive` / `destructive-foreground`** | Irreversible or dangerous actions, error text/icons that represent failure — not for neutral “stop” icons unless semantically destructive. |
| **`ring`** | Focus rings and focus-visible styling; pair with `ring-offset-background` where offsets are used. |

### Extended brand / status (flat palette in `tailwind.config.js` → `brandPalette`)

These are **fixed hex utilities** (e.g. `bg-success`, `text-warning`, `bg-highlight`). Use them for **status, alerts, KPI accents, and marketing/brand spots** where the design system specifies those hues — not as one-off arbitrary colors.

| Utility family | Use |
|----------------|-----|
| **`success` / `success-hover` / `success-dark`** | Positive outcomes, confirmations, “on track” badges. |
| **`warning` / `warning-hover` / `alert`** | Caution, attention-needed, non-destructive risk. |
| **`error` / `error-hover`** | Severe problems, validation hard errors (often paired with destructive semantics). |
| **`highlight`** | Promotional or emphasis accents (distinct from `accent` in CSS variables). |
| **`info` / `info-hover`** | Informational callouts (legacy `.form-*` / alert classes may reference these). |

### Shell

| Token | Use |
|-------|-----|
| **`dashboard-surface`** | **Only** for the **dashboard page backdrop** behind `Panel` stacks (client dashboard, campaign dashboard shell, etc.). Do not use it for individual cards/panels inside the grid — those stay `bg-card` / `Panel`. |

### Secondary / accent (CSS variables)

- **`secondary` / `secondary-foreground`** and **`accent` / `accent-foreground`** remain available for subdued buttons, hover states, and sidebar accents. Prefer **primary** for the main CTA and **muted** for the quietest surfaces.

---

## `Card` vs `Panel`

### When `Panel` is **mandatory**

- **New work** on **dashboard routes** (`app/dashboard/**` and analogous client-facing dashboard experiences): primary content blocks, metrics sections, chart slots, and campaign detail sections should use **`Panel`** + **`PanelHeader` / `PanelTitle` / `PanelDescription` / `PanelActions` / `PanelContent`** (and **`Panel`** `variant` props for loading/empty/error when applicable — see below).
- Any block that **shares the same visual language** as those dashboards when embedded elsewhere should still use **`Panel`** for consistency.

### When `Card` is **still allowed**

- **Shared chart components** that already wrap Recharts in **`Card`** (`components/charts/*`) — keep **`Card`** there unless/until a dedicated `ChartPanel` abstraction is introduced; do not fork duplicate wrappers per route.
- **shadcn examples, dialogs, and small composables** where `Card` is the established primitive and the UI is **not** a dashboard section (e.g. compact summaries inside a modal).
- **Legacy screens** not yet migrated: prefer migrating to `Panel` when touching the file for a larger refresh.

**Rule of thumb:** If it’s a **dashboard section with a title and body**, use **`Panel`**. If it’s a **small reusable box** inside a chart library contract or a non-dashboard surface, **`Card`** may remain.

---

## Charts

### Interactive charts (drill-down, filter, navigation, `onDatumClick`, export actions)

An interactive chart **must** provide:

1. **Tooltip** — values and labels available on hover/focus of series/points (use shared `ChartTooltip` / `ChartTooltipContent` from `components/ui/chart.tsx` or equivalent `bg-popover` treatment for custom Recharts tooltips).
2. **Legend** — when more than one series or category is shown, a **visible legend** (or inline labels with equivalent information) so color encoding is not tooltip-only.
3. **Keyboard alternative** — users who cannot use pointer hover must reach the same data or actions: e.g. **focusable controls**, **skip links**, or a **tabular/list summary** under the chart that exposes the same breakdown (see patterns in `StackedColumnChart` / `PieChart` with `onDatumClick`).

Also ensure **pointer cursor** reflects interactivity (`cursor` prop / handlers only when interaction exists).

### Non-interactive charts (read-only viz, no click handlers)

- **Do not** show pointer affordances: use **`cursor="default"`** (or equivalent) on Recharts layers so the chart does not imply clickability.
- Tooltip may still be used for **read-only inspection**; legend rules still apply when multiple encodings exist.
- **Do not** add fake “button” styling to static graphics.

### Chart colors

- **Qualitative series:** use the shared palette pattern (e.g. `QUALITATIVE_CHART_COLORS` in chart components) or a documented palette constant — **not** ad hoc hex per route.
- **Semantic overlays** (thresholds, “good/bad” bands): prefer **design tokens** where possible; if a library requires hex, centralize it with the chart module.

---

## Tables

### Data tables (read-mostly, sorting, row actions)

- Use **`Table` / `TableHeader` / `TableBody` / `TableRow` / `TableCell`** (`components/ui/table.tsx`) with clear **header semantics** (`<th scope="col">` via the head components).
- **Zebra, density, borders:** `border-border`, `bg-muted` / `bg-card` alternation sparingly; keep **text** on `text-foreground` / `text-muted-foreground` for secondary columns.
- **Row actions:** icon-only controls must meet **target size** rules (see Accessibility); prefer visible labels or `aria-label` on icon buttons.
- **Responsive overflow:** wrap wide tables in horizontal scroll containers; do not rely only on shrinking text below readable sizes.

### Summary tables (aggregates, footers, KPI adjacency)

- Same as data tables; use **typographic hierarchy** (`font-medium`, `tabular-nums`) for numbers; align currency and counts consistently.
- If the summary is the **only** content of a dashboard section, place it inside **`Panel`**.

### Editable spreadsheet-style grids (media plan expert grids, pacing editors)

- Treat as **application widgets**, not simple tables: **cell-level focus**, **keyboard navigation** between inputs, and **stable `id`s** for focus management where the grid implements it (`expertGridCellId` pattern).
- **Read-only cells** should not steal focus styling that implies editability; use **`cursor-default`** and muted text where appropriate.
- **Sticky headers** must remain **readable** (`bg-card` / `bg-muted` + `border-border`) and must not hide focus rings.

### Empty, loading, and error states

- **Prefer `Panel` variants** for dashboard blocks:
  - **`variant="loading"`** — `PanelContent` shows skeletons; root sets **`aria-busy`** where implemented.
  - **`variant="empty"`** — use `emptyMessage` or custom children for **actionable** empty copy (what to do next).
  - **`variant="error"`** — use `errorMessage`; default body uses **`role="alert"`** and **destructive** token styling.
- For **full-page** errors, use route-level error UI patterns; still use **semantic** colors, not arbitrary hex.

---

## Accessibility (repo audit baseline)

Ground rules are expanded in **`docs/design-refresh/TESTING.md`**. Implementations **must** satisfy at least the following:

### Target size

- **Minimum (WCAG 2.2):** interactive targets **≥ 24×24 CSS px**, or fall under documented exceptions (inline text link in prose, essential size, equivalent larger control nearby).
- **Design / enhanced target:** primary actions and main navigation **≥ 44×44 CSS px** where feasible.
- **Dense tables and grids:** enlarge hit regions with **padding**, **inset pseudo-elements**, or **wrapping labels**; re-audit when changing `h-8`, `size="sm"`, or `h-4 w-4` icon-only buttons.

### Focus visible

- Every focusable control must have a **visible** keyboard focus indicator; do not rely on mouse-only `:focus` styling that removes the ring.
- Prefer **`focus-visible`** patterns so pointer clicks stay visually quiet while **Tab** focus is obvious.
- **Focus contrast** must hold on both light and dark backgrounds; **ring** should use **`ring` / `ring-offset-background`** consistently.
- **Modals / popovers:** move focus into the layer on open, trap focus while open, restore focus on close.

### Tab order and keyboard reachability

- **Tab order** follows visual reading order; no accidental tab traps outside modal dialogs.
- **All functionality** reachable via keyboard: buttons, links, menus, comboboxes, tabs, accordions, **data grids** (including cell editors and row actions).
- **Custom shortcuts** must be documented and must not conflict with AT/browser defaults without mitigation.
- **Select / dropdown:** open, navigate options, select, dismiss with **Esc**.

For **known undersized primitives** (checkbox, slider thumb, small buttons, etc.), see the audit tables in **`TESTING.md`** — new usages should **improve** hit area or document an exception.

---

## Migration rule: no new arbitrary hex in route components

- **Do not add new hard-coded hex colours** in **`app/**` route components** (pages, layouts, `page.tsx`, route-local `components` under `app/`) **unless**:
  - the value belongs to an **approved chart palette** constant used for data visualization, or
  - it represents a **user-defined or tenant brand colour** (e.g. client brand from data) passed through as an inline style with clear provenance.
- For all other styling, use **semantic tokens** (`bg-primary`, `text-destructive`, `border-border`, etc.) or **Tailwind named brand utilities** from `tailwind.config.js` (`bg-success`, `bg-warning`, `bg-highlight`, …).
- If a new colour is truly required, add it **once** to the design token layer (`app/globals.css` and/or `tailwind.config.js`) with a **named role**, then consume the utility — do not scatter literals.

---

**Document version:** 1  
**Last updated:** 2025-03-25
