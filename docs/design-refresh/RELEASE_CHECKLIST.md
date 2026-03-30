# Design Refresh Release Checklist

Use this checklist during pre-release QA and final sign-off. Complete each page section at mobile, tablet, and desktop breakpoints before marking the release complete.

## Global Sign-Off Rules

- [ ] Validate against current design tokens (color, typography, spacing, radius, shadow, border).
- [ ] Confirm no page has duplicate outer container chrome (stacked cards/panels wrapping the same content level).
- [ ] Confirm keyboard-only navigation is fully usable (tab order, focus visibility, enter/space activation, esc behavior where relevant).
- [ ] Confirm loading, empty, and error states are intentional, readable, and visually aligned with refreshed shell patterns.
- [ ] Confirm panel and chart shells match the canonical dashboard shell treatment.

---

## `/dashboard`

| Owner | QA Date | Status | Notes |
| --- | --- | --- | --- |
|  |  | Not Started |  |

- [ ] **Panel consistency:** cards/panels use shared shell (padding, radius, border, elevation, header/footer treatment).
- [ ] **Heading hierarchy:** page title, section headings, and panel titles follow semantic and visual hierarchy.
- [ ] **Spacing rhythm:** vertical rhythm and internal spacing follow token scale; no ad-hoc gaps.
- [ ] **Token consistency:** typography, colors, border radii, shadows, and icon sizing map to tokens only.
- [ ] **Chart shell consistency:** chart wrappers, legends, controls, and annotations match refreshed chart shell pattern.
- [ ] **State quality:** loading/empty/error variants are polished, informative, and visually consistent.
- [ ] **Keyboard navigation:** controls, filters, tabs, and charts are reachable and operable via keyboard.
- [ ] **Responsive behavior:** layout and panel stacking are correct at mobile, tablet, desktop.
- [ ] **No duplicate container chrome:** no nested/duplicate page shell framing around main content.

## `/dashboard/[slug]`

| Owner | QA Date | Status | Notes |
| --- | --- | --- | --- |
|  |  | Not Started |  |

- [ ] **Panel consistency:** all modules follow the same panel shell and alignment rules.
- [ ] **Heading hierarchy:** slug context title/subtitle and section headings are clear and ordered correctly.
- [ ] **Spacing rhythm:** spacing between header, filters, charts, and tables follows token rhythm.
- [ ] **Token consistency:** visual primitives match token system without one-off values.
- [ ] **Chart shell consistency:** every chart uses the standardized chart frame and interaction treatment.
- [ ] **State quality:** loading/empty/error experiences are specific to slug context and non-jarring.
- [ ] **Keyboard navigation:** filter controls, drilldowns, and links are keyboard accessible with visible focus.
- [ ] **Responsive behavior:** content reflows cleanly with no overlap or clipped controls at all breakpoints.
- [ ] **No duplicate container chrome:** avoid redundant shell wrappers around slug content areas.

## `/dashboard/[slug]/[mba_number]`

| Owner | QA Date | Status | Notes |
| --- | --- | --- | --- |
|  |  | Not Started |  |

- [ ] **Panel consistency:** detail-level panels mirror dashboard shell standards.
- [ ] **Heading hierarchy:** MBA-level title, metadata, and section labels remain semantically ordered.
- [ ] **Spacing rhythm:** dense data views preserve consistent spacing cadence and scannability.
- [ ] **Token consistency:** all text styles, status colors, borders, and spacing are token-derived.
- [ ] **Chart shell consistency:** detailed chart components preserve the same shell pattern as parent dashboard pages.
- [ ] **State quality:** loading/empty/error states for MBA-specific data are clear and actionable.
- [ ] **Keyboard navigation:** tables, chart toggles, and actions work in keyboard-only flow.
- [ ] **Responsive behavior:** detail content remains usable (stacking/scroll strategy) on mobile and tablet.
- [ ] **No duplicate container chrome:** no extra framing around detail panels beyond intended shell.

## `/client`

| Owner | QA Date | Status | Notes |
| --- | --- | --- | --- |
|  |  | Not Started |  |

- [ ] **Panel consistency:** client overview sections use the same refreshed panel structure.
- [ ] **Heading hierarchy:** client name/title, supporting labels, and section headings are coherent and accessible.
- [ ] **Spacing rhythm:** forms, summaries, and data panels align to spacing tokens.
- [ ] **Token consistency:** colors, type, surfaces, and controls match the token system.
- [ ] **Chart shell consistency:** if charts are present, shell and controls match dashboard chart patterns.
- [ ] **State quality:** loading/empty/error copy and layout are complete and non-placeholder.
- [ ] **Keyboard navigation:** search, filters, tables, and edit actions are keyboard-friendly.
- [ ] **Responsive behavior:** client content maintains readability and control access at all breakpoints.
- [ ] **No duplicate container chrome:** only one intentional content shell around primary client sections.

## `/pacing`

| Owner | QA Date | Status | Notes |
| --- | --- | --- | --- |
|  |  | Not Started |  |

- [ ] **Panel consistency:** pacing widgets/cards use shared shell and spacing conventions.
- [ ] **Heading hierarchy:** pacing title, date-range context, and metric headings are correctly ordered.
- [ ] **Spacing rhythm:** metric density does not break spacing cadence across rows/sections.
- [ ] **Token consistency:** status colors and metric emphasis use approved tokens.
- [ ] **Chart shell consistency:** pacing charts share same container, legend, and empty-shell treatment.
- [ ] **State quality:** loading/empty/error states are explicit for date/filter conditions.
- [ ] **Keyboard navigation:** date pickers, toggles, and selectable data regions are operable by keyboard.
- [ ] **Responsive behavior:** pacing charts/tables remain interpretable on smaller screens.
- [ ] **No duplicate container chrome:** no extra nested shells around pacing modules.

## `/publishers/[id]`

| Owner | QA Date | Status | Notes |
| --- | --- | --- | --- |
|  |  | Not Started |  |

- [ ] **Panel consistency:** publisher profile and related data panels conform to shared shell.
- [ ] **Heading hierarchy:** publisher title, metadata, and section headers form clear structure.
- [ ] **Spacing rhythm:** spacing between publisher info blocks and related content is token-aligned.
- [ ] **Token consistency:** badges, statuses, text styles, and UI chrome use standard tokens.
- [ ] **Chart shell consistency:** publisher performance charts align with canonical chart container pattern.
- [ ] **State quality:** loading/empty/error states for unavailable publisher data are high quality.
- [ ] **Keyboard navigation:** all actions, tabs, and links are accessible with visible focus.
- [ ] **Responsive behavior:** long labels and data-heavy modules adapt at mobile/tablet/desktop.
- [ ] **No duplicate container chrome:** ensure single intentional shell around publisher page content.

## Media Plans Create/Edit Pages

| Owner | QA Date | Status | Notes |
| --- | --- | --- | --- |
|  |  | Not Started |  |

- [ ] **Panel consistency:** form sections and side panels use same shell/padding/radius rules.
- [ ] **Heading hierarchy:** create/edit titles, section headings, and field group labels are structured correctly.
- [ ] **Spacing rhythm:** form rows, helper text, validation, and action spacing follow token rhythm.
- [ ] **Token consistency:** field states (default/focus/error/disabled) use tokenized values only.
- [ ] **Chart shell consistency:** preview/forecast charts (if present) follow standard chart shell treatment.
- [ ] **State quality:** loading/empty/error/validation states are clear, actionable, and visually consistent.
- [ ] **Keyboard navigation:** complete form completion and submission flow works keyboard-only.
- [ ] **Responsive behavior:** multi-column forms collapse cleanly; primary actions stay reachable.
- [ ] **No duplicate container chrome:** avoid nested shells around form body and section cards.

## Account / Profile / Auth Shell Pages

| Owner | QA Date | Status | Notes |
| --- | --- | --- | --- |
|  |  | Not Started |  |

- [ ] **Panel consistency:** auth and account shells use consistent card/container treatment.
- [ ] **Heading hierarchy:** auth headings, profile titles, and helper copy are semantically and visually ordered.
- [ ] **Spacing rhythm:** field spacing, section margins, and CTA spacing match token scale.
- [ ] **Token consistency:** auth/profile UI uses shared tokens (not page-specific hardcoded styles).
- [ ] **Chart shell consistency:** if any chart-like placeholders/modules appear, align to chart shell standard.
- [ ] **State quality:** login/signup/reset/profile loading and error states are complete and polished.
- [ ] **Keyboard navigation:** auth/profile flows are fully operable with keyboard and clear focus states.
- [ ] **Responsive behavior:** shell layouts and forms adapt smoothly at mobile/tablet/desktop.
- [ ] **No duplicate container chrome:** no double-framed auth/account container wrappers.

---

## Final Release Gate

- [ ] All above items are checked for each listed page.
- [ ] Any deviations are documented with owner + follow-up ticket.
- [ ] Design + engineering sign-off complete.
