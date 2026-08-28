# Finance hub remaining stages — current state map

**Date:** 2026-07-11  
**Scope:** Read-only discovery for queued builds S5 (inline schedule amount edits), S9 (hub-tab surface migration), S3+ (notes writes), SEC Wave 3 (staff gates), and Xero exceptions-queue UI.  
**Method:** Repo inventory of `app/finance/**`, `components/finance/**`, `app/api/finance/**`, related mediaplans write paths, `next.config.mjs` redirects, and Select-String sweeps for notes / xero tables / role literals.  
**Constraint:** No code changes beyond this file.

---

## 1. Hub vs legacy surfaces (S9 scope)

**Confidence: 92%**

### Inventory

| Area | Paths found |
|------|-------------|
| Hub page | `app/finance/page.tsx` → `FinanceHubPageClient.tsx` |
| Standalone finance pages | `app/finance/receivables/page.tsx` (+ client); `app/finance/forecast/snapshots/variance/page.tsx` (+ client) |
| Layout gate | `app/finance/layout.tsx` wraps all finance routes in `AdminGuard` |
| Hub panels | `components/finance/hub/panels/{FinanceOverviewPanel,FinancePayablesPanel,FinanceAccrualPanel,FinanceForecastPanel,FinanceReportPanel}.tsx` + `FinanceHubPayablesSection.tsx` |
| Legacy tabs | `components/finance/tabs/{OverviewTab,AccrualTab,ForecastTab}.tsx` |
| Receivables components | `components/finance/receivables/*` (used by standalone receivables page; hub billing uses inline section + shared `MediaPlanActionBar`) |

### Tab routing mechanism (`FinanceHubPageClient.tsx`)

Tab keys live in `lib/finance/useFinanceStore.ts`:

```ts
export type FinanceHubTab = "overview" | "billing" | "payables" | "accrual" | "forecast" | "report"
```

`parseFinanceHubTabParam` reads `?tab=` (default `"overview"`). `Tabs value={activeTab}` + `setActiveTab` sync URL via `history.replaceState`.

| Tab key | UI label | What renders today |
|---------|----------|--------------------|
| `overview` | Overview | Hub panel `FinanceOverviewPanel` → **still mounts legacy** `OverviewTab` |
| `billing` | Client Billing | **Inline** `FinanceHubReceivablesSection` inside `FinanceHubPageClient` (not a `hub/panels/*` file). Link out: “Try the new receivables view” → `/finance/receivables` |
| `payables` | Publisher Invoices | Hub panel `FinancePayablesPanel` → `FinanceHubPayablesSection` (hub-native) |
| `accrual` | Accrual | Hub panel `FinanceAccrualPanel` → **still mounts legacy** `AccrualTab` |
| `forecast` | Forecast | Hub panel `FinanceForecastPanel` → **still mounts legacy** `ForecastTab` |
| `report` | Report | Hub panel `FinanceReportPanel` (hub-native; no legacy tab twin) |

### Redirects (`next.config.mjs`)

All finance redirects (permanent):

| Source | Destination |
|--------|-------------|
| `/finance/billing` | `/finance?tab=billing` |
| `/finance/media` | `/finance?tab=billing` |
| `/finance/scopes` | `/finance?tab=billing` |
| `/finance/retainers` | `/finance?tab=billing` |
| `/finance/sow` | `/finance?tab=billing` |
| `/finance/publishers` | `/finance?tab=payables` |
| `/finance/accrual` | `/finance?tab=accrual` |
| `/finance/forecast` | `/finance?tab=forecast` |

**Not redirected:** `/finance/receivables` (live parallel page), `/finance/forecast/snapshots/variance`, hub itself `/finance`.

### Build implication (S9)

S9 is mostly **thin-wrapper cleanup**, not greenfield migration: Overview/Accrual/Forecast already appear as hub tabs but still delegate to `components/finance/tabs/*`. Client Billing is already on the hub but implemented inline (and duplicated by a richer standalone receivables page). Payables + Report are already hub-native panels. Build prompts should target (a) collapsing legacy tab modules into panels or deleting the indirection, (b) deciding whether `/finance/receivables` becomes the billing tab body or stays a preview route, (c) optional redirect for receivables if the hub absorbs it — not “wire missing tabs.”

---

## 2. Schedule amount edit paths (S5 scope)

**Confidence: 90%**

### Where amounts can change from the finance side today

| Surface | Editable fields | Write API | Persistence target |
|---------|-----------------|-----------|-------------------|
| **Alter Billing** (`AlterBillingDialog` via `MediaPlanActionBar` on hub billing + standalone receivables media-plan sections) | Per-line `monthlyAmounts[monthYear]` inputs; grand total must stay within ±$0.01 of original | `PATCH /api/mediaplans/versions/{versionId}/billing-schedule` body `{ billingSchedule }` | **Version `billingSchedule` JSON** on `media_plan_versions` (Xano). Then audit rows to **`finance_edits`** via `diffBillingSchedules` + `writeScheduleDiffEdits`. Does **not** write amounts into `finance_billing_records` |
| **EditableFinanceGrid** | Cell editor infrastructure exists; AccrualTab passes `editableFields={[]}` and `onCellEdit={noopCellEdit}` | N/A (display-only in finance) | Publish path removed (“no-op”); store `updateBillingRecord` only used when editable — currently unused for amounts |
| **Receivables row components** (`ReceivablesLineGroupRow`, hub `HubReceivableRecordArticle`) | Amounts are **read-only** display (`formatAUD`) | — | — |
| **MBA edit / version create** (outside finance UI, but same audit helpers) | Full plan save | `PUT`/`POST` paths on `app/api/mediaplans/mba/[mba_number]/route.ts` | New/updated version `billingSchedule` + `writeScheduleDiffEdits` with `recordType: "version_create_diff"` |

### Write chain: `scheduleDiff` / `writeFinanceAuditEdits`

1. Caller succeeds at mutating schedule JSON (billing-schedule PATCH or MBA version create).
2. `diffBillingSchedules(old, new)` (`lib/finance/scheduleDiff.ts`) emits `amount_change` | `line_add` | `line_remove`.
3. `writeScheduleDiffEdits` POSTs one row per change to Xano `finance_edits` (`edit_type` mirrors kind; `finance_billing_records_id` / line-item ids are **null**; `field_name` = `{monthYear}::{lineItemId}`).
4. Audit failures are logged/swallowed — schedule write is authoritative.
5. `writeStatusChangeEdit` exists for status/notes-style audits; used today by **mark-billed** only (not amount edits).

### Build implication (S5)

“Inline schedule amount edits” would extend **receivables/hub billing rows** (or a cell mode on those lists), not Accrual’s grid. The proven write path is **`PATCH .../billing-schedule` → version JSON + `finance_edits` amount_change audit** — same as Alter Billing, without the dialog / grand-total-shift constraint unless product wants that. `finance_billing_records` is not the amount source of truth today (receivables are derived from schedule JSON). Audit trail for amount changes **already exists** for schedule patches.

---

## 3. Notes infrastructure (S3+ scope)

**Confidence: 88%**

### Inventory (finance-scoped `notes` hits)

| Kind | Location | Role |
|------|----------|------|
| Billing record field | `lib/types/financeBilling.ts` `notes?: string \| null` | Typed on overlay model |
| Read overlay | `lib/finance/overlayFinanceStatus.ts` copies `persisted.notes ?? null` onto derived records | **READ path exists in data layer** |
| Materialise default | `lib/finance/materialiseFinanceBillingRecord.ts` seeds `notes: ""` on create | Column expected on `finance_billing_records` |
| Audit helper comment | `writeStatusChangeEdit` docs mention “setting notes” | Helper ready; **no notes caller** |
| Generic PATCH | `PATCH /api/finance/billing/[id]` + `updateBillingRecord()` in `lib/finance/api.ts` | Pass-through body to Xano — **could** write `notes`, but **no UI calls it for notes** |
| Forecast snapshot notes | `ForecastTab` / snapshots API / `buildSnapshotPayload` | **Unrelated** product notes on forecast snapshots |

**UI render:** No `components/finance/**` TSX renders `record.notes` / `.notes` for billing rows (hub or receivables). Notes are invisible in the finance UI today.

### Exists vs missing

| Piece | Status |
|-------|--------|
| Xano `finance_billing_records.notes` | Assumed present (materialise + overlay) |
| Read into `BillingRecord.notes` | Exists (overlay) |
| Notes display UI | **Missing** |
| Dedicated notes write API | **Missing** (generic PATCH exists, ungated) |
| Materialise-before-write for notes | Pattern exists via mark-billed + `ensureFinanceBillingRecord` |
| `writeStatusChangeEdit` for notes | Exported, unused for notes |
| Hub/receivables host component | Missing — natural hosts: `HubReceivableRecordArticle`, `ReceivablesMediaPlanSection` / client cards, or row action beside `BilledStatusPill` |

### Build implication (S3+)

Notes-write needs: (1) UI control on receivable rows, (2) a staff-gated write that materialises the invoice grain then PATCHes `notes` (prefer dedicated route mirroring mark-billed, or harden `billing/[id]`), (3) optional `writeStatusChangeEdit` audit row, (4) surface the overlay `notes` value in the same UI. Forecast snapshot notes are a separate feature — do not reuse that path.

---

## 4. Route gates (SEC Wave 3 scope)

**Confidence: 93%**

**Baseline:** `middleware.ts` requires a session for all `/api/*` (except auth/cron). It does **not** block `client` role from finance APIs. Page UI: `/finance/*` uses `AdminGuard` → `isAdmin` only (`roles.includes("admin")`); managers are redirected away from the finance UI even though some APIs allow them.

### `app/api/finance/**`

| Route | Methods | Gate in handler | Gate type | Client session rejected? |
|-------|---------|-----------------|-----------|--------------------------|
| `/api/finance/billing` | GET | None | **SESSION-ONLY** (MW) | **No** |
| `/api/finance/billing/[id]` | PATCH | None | **SESSION-ONLY** | **No** (mutation) |
| `/api/finance/billing/line-items` | POST | None | **SESSION-ONLY** | **No** (mutation) |
| `/api/finance/billing/line-items/[id]` | PATCH, DELETE | None | **SESSION-ONLY** | **No** (mutation) |
| `/api/finance/billing/mark-billed` | POST | `roles.includes("admin")` | **ADMIN-ONLY** | Yes (403) |
| `/api/finance/data` | GET | None | **SESSION-ONLY** | **No** |
| `/api/finance/edits` | GET, POST | None | **SESSION-ONLY** | **No** (incl. POST) |
| `/api/finance/saved-views` | GET, POST | None | **SESSION-ONLY** | **No** |
| `/api/finance/publishers` | GET | None | **SESSION-ONLY** | **No** |
| `/api/finance/payables` | GET | None | **SESSION-ONLY** | **No** |
| `/api/finance/sow` | GET | None | **SESSION-ONLY** | **No** |
| `/api/finance/hub-schedule-ytd` | GET | None | **SESSION-ONLY** | **No** |
| `/api/finance/receivables/aa-media-plan` | GET | None | **SESSION-ONLY** | **No** |
| `/api/finance/accrual` | GET | `roles.includes("client")` → 403 | **STAFF-ISH** (blocks client only; manager OK) | Yes |
| `/api/finance/forecast` | GET | blocks `client`; non-admin tenant slug filter | **STAFF + tenant** | Yes |
| `/api/finance/forecast/snapshots` | GET, POST | `roles.includes("admin")` | **ADMIN-ONLY** | Yes |
| `/api/finance/forecast/snapshots/[id]/lines` | GET | admin | **ADMIN-ONLY** | Yes |
| `/api/finance/forecast/snapshots/variance` | POST | admin | **ADMIN-ONLY** | Yes |

**Post Waves 1–5 vs SEC-D2:** Finance SESSION-ONLY set is **unchanged** for the bulk of billing/data/edits/payables/sow/saved-views/hub-ytd/aa-export. Staff gates remain only on accrual (client block), forecast (client block), snapshots*, and mark-billed (admin).

### Create-adjacent `app/api/mediaplans`

| Route | Methods | Gate | Notes |
|-------|---------|------|-------|
| `/api/mediaplans` | GET, POST | `requireRole(..., ["admin","manager"])` | **Updated since SEC-D2** (was SESSION-ONLY / “dev allow”) |
| `/api/mediaplans/versions/[id]/billing-schedule` | PATCH | None beyond MW | **SESSION-ONLY** — finance Alter Billing write path |
| `/api/mediaplans/mba/[mba_number]` | GET/PUT (etc.) | No role gate found in handler (MW session) | Version-create audit path |
| `/api/mediaplans/[id]` | GET, PUT | SESSION-ONLY (per SEC-D2; not re-audited line-by-line beyond pattern) | Create-adjacent |

### Build implication (SEC Wave 3)

Wave 3 should add **staff gates** (`admin` and/or `admin|manager` — product call) on every SESSION-ONLY finance route above, especially mutations (`billing/[id]`, line-items, `edits` POST, `saved-views` POST) and the schedule PATCH used by S5. UI already hides finance from clients/managers via `AdminGuard`; API still trusts any authenticated session. Align mediaplans billing-schedule PATCH with the same staff policy as mark-billed / create.

---

## 5. Exceptions queue groundwork (Xero import)

**Confidence: 95% (code absence); 70% (contract doc — not found)**

### Table name sweep

Select-String across `app`, `components`, `lib`, `docs` for `xero_sync_exceptions` and `xero_ar_invoices`: **zero matches**. Confirmed: nothing in the app reads these tables yet.

### `item-4-finance-xano-contract-FINDINGS.md`

| Location | Result |
|----------|--------|
| Repo root | Not found |
| `docs/` | Not found |
| Glob `*item-4*` / `*xano*contract*` | Not found |
| `C:\Projects\_avmediaplan-discovery-archive\` | Archive **exists** and lists other discovery files; **no** `item-4-finance-xano-contract-FINDINGS.md` (or `*item-4*` / `*xano*contract*` / `*finance*xano*` hits). Not copied back. |

**Contract decisions:** unavailable — cannot quote. Related in-repo doc `docs/finance-forecast-snapshots-xano.md` covers forecast snapshots only, not Xero AR/exceptions.

### Host pattern for a new exceptions tab

Follow existing hub panel pattern:

1. Extend `FinanceHubTab` + `HUB_TABS` + `TabsTrigger` / `TabsContent` in `FinanceHubPageClient`.
2. Add `components/finance/hub/panels/FinanceExceptionsPanel.tsx` (dynamic import like Report/Payables).
3. Optional redirect if a legacy path is introduced later.

Closest structural twins: `FinanceReportPanel` (self-contained hub panel) or `FinancePayablesPanel` (thin panel → section).

### Build implication (exceptions queue)

Greenfield: new API read against Xano exceptions/AR tables, new hub tab + panel, no existing consumers to migrate. Recover or re-author the item-4 contract before coding field mappings — it is not in repo or the discovery archive listing checked today.

---

## 6. Admin gate string verification

**Confidence: 94%**

### Literals used in `app/api/finance` role checks

| Literal | Where | Matches canonical `UserRole`? |
|---------|-------|-------------------------------|
| `"admin"` | mark-billed; forecast snapshots*; forecast `isAdmin` | **Yes** (`UserRole = 'admin' \| 'manager' \| 'client'`) |
| `"client"` | accrual block; forecast block | **Yes** |
| `"manager"` | **Not used** in finance API gates | Canonical exists; finance handlers never require it |

**Not found in finance API gates:** `"assembled admin"`, `"super_admin"`.

Note: `lib/rbac.ts` `normalizeRole` maps Auth0 claim variants (`assembled admin`, `assembled_admin`, etc.) → canonical `'admin'` **before** `roles.includes("admin")` checks. Gate code correctly uses canonical `"admin"`.

False-positive noise in string search: `assembledFee` / “Assembled Fee” in `data/route.ts` — not role gates.

### Build implication

Keep using canonical `"admin"` / `"manager"` / `"client"` via `getUserRoles` / `requireRole`. Do not introduce raw `"assembled admin"` in handlers. Decide whether Wave 3 staff = admin-only (matches mark-billed + AdminGuard UI) or admin|manager (matches mediaplans create).

---

## Verdict table

| Surface / build | State today | What the build must do |
|-----------------|-------------|------------------------|
| **S9 Overview** | Hub tab → panel → legacy `OverviewTab` | Collapse or delete legacy indirection; no new route |
| **S9 Client Billing** | Hub inline section + parallel `/finance/receivables` | Choose single body; optional redirect; extract panel if desired |
| **S9 Payables** | Hub-native panel | Minimal / none |
| **S9 Accrual** | Hub panel → legacy `AccrualTab` | Same as Overview |
| **S9 Forecast** | Hub panel → legacy `ForecastTab` | Same as Overview |
| **S9 Report** | Hub-native panel | Minimal / none |
| **S9 redirects** | 8 legacy paths → hub tabs | Receivables/variance still standalone |
| **S5 amount edits** | Dialog-only Alter Billing → version JSON + `finance_edits` | Inline UI on receivables/hub rows; reuse billing-schedule PATCH + audit; grid not the host |
| **S3+ notes** | Overlay read + empty column; no UI/write | UI + gated write + materialise + optional audit; show overlay notes |
| **SEC Wave 3** | Most finance APIs SESSION-ONLY; UI admin-only | Staff-gate SESSION-ONLY finance (+ schedule PATCH); clarify admin vs manager |
| **Exceptions queue** | No code; no item-4 doc in repo/archive | New tab/panel + API; recover contract first |
| **Role strings** | Canonical `"admin"`/`"client"` only in finance gates | Keep canonical; no legacy assembled-admin literals in handlers |
