# Design refresh — baseline capture

Use this document before and after a design refresh to record screenshots, QA passes, and performance/accessibility baselines. Update dates and owners as you run each pass.

## Routes to capture

| Route | Screenshot taken | Notes |
|-------|------------------|-------|
| `/` | ☐ | |
| `/dashboard` | ☐ | |
| `/publishers` | ☐ | |
| `/pacing` | ☐ | |
| `/learning` | ☐ | |
| `/client` | ☐ | |

## Screenshot checklist

- [ ] **Viewport coverage:** Capture each route at a primary desktop width (e.g. 1440px) and one mobile width (e.g. 375px), unless the page is desktop-only by design.
- [ ] **Auth state:** Note whether shots are logged-in, logged-out, or both; store files in a consistent folder (e.g. `docs/design-refresh/screenshots/YYYY-MM-DD/`).
- [ ] **Naming:** Use a clear pattern, e.g. `{route}-{viewport}-{auth}.png` (slashes in routes → `-`, e.g. `dashboard-1440-logged-in.png`).
- [ ] **Above the fold + scroll:** For long pages, include at least one full-page or stitched capture where useful for comparison.
- [ ] **Interactive states:** If baseline matters for hover, open modals, or expanded sidebars, capture those states and label them in the table above.

## QA checklist (per route)

- [ ] Loads without console errors (document any known acceptable warnings).
- [ ] Primary navigation and in-page links work as expected.
- [ ] Forms submit or validate as before (if applicable).
- [ ] Tables, filters, and sort behave as before (if applicable).
- [ ] Charts and data-heavy widgets render and resize correctly.
- [ ] Dark/light or theme tokens (if any) remain consistent after refresh.
- [ ] Cross-browser spot check (e.g. Chromium + Safari or Firefox) on at least one critical route.

## Lighthouse (placeholder)

_Run in an incognito/private window against staging or production-like build where possible._

| Metric | `/` | `/dashboard` | `/publishers` | `/pacing` | `/learning` | `/client` |
|--------|-----|--------------|---------------|-----------|-------------|-----------|
| Performance | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| Accessibility | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| Best Practices | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| SEO | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

**Run details:** _date, URL, device (mobile/desktop), Lighthouse version_

## axe / automated a11y (placeholder)

| Route | Tool | Result summary | Link / export |
|-------|------|----------------|----------------|
| `/` | axe DevTools / CI | _TBD_ | |
| `/dashboard` | | _TBD_ | |
| `/publishers` | | _TBD_ | |
| `/pacing` | | _TBD_ | |
| `/learning` | | _TBD_ | |
| `/client` | | _TBD_ | |

**Notes:** _critical vs serious vs moderate issues; false positives to ignore_

## Bundle size (placeholder)

_Record after a production build (`next build` or your CI artifact)._

| Area | Before (baseline) | After (post-refresh) | Notes |
|------|-------------------|----------------------|-------|
| First Load JS (home or shared) | _TBD_ | | |
| `/dashboard` (or heaviest dashboard chunk) | _TBD_ | | |
| `/publishers` | _TBD_ | | |
| `/pacing` | _TBD_ | | |
| `/learning` | _TBD_ | | |
| `/client` | _TBD_ | | |

**How captured:** _e.g. `.next/analyze`, `@next/bundle-analyzer`, or CI artifact path_

---

**Document version:** 1  
**Last updated:** _YYYY-MM-DD_
