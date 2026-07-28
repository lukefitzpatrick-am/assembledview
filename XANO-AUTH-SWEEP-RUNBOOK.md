# Xano auth sweep runbook

**Status:** App readiness only — **no Xano group is flipped by this change.**  
Luke flips groups manually in the Xano UI, **one group per window**, using this runbook.

**Inventory source:** regenerate with `npx tsx scripts/xano-call-inventory.ts` → `xano-call-inventory.json`  
**Catalog:** `xano-apigroups-endpoints.json` (340 endpoints: 32 auth, 308 public)

---

## Auth mechanism (already in app)

| Item | Value |
|------|--------|
| Env var | `XANO_API_KEY` (server-only; never `NEXT_PUBLIC_*`) |
| Header | `Authorization: Bearer <token>` |
| Shared helpers | `lib/api/xano.ts` → `xanoAuthHeader`, `xanoAuthHeaderRecord`, `xanoPostHeaderRecord`, `requireXanoAuthHeaderRecord` |

Empty/missing `XANO_API_KEY` omits the Authorization header (current public-group behaviour).

**Before flipping any group:** confirm `XANO_API_KEY` is set in local `.env.local` and Vercel (Preview + Production).

**Already auth-required in Xano (app calls them with helpers):**

- `GET creative_asset` (Clients)
- `GET` / `POST` / `PATCH planning_audiences` (Clients)

---

## Pre-flight checklist

1. [ ] `XANO_API_KEY` present in the environment you will smoke-test.
2. [ ] Inventory regenerated and reviewed (`npx tsx scripts/xano-call-inventory.ts`).
3. [ ] Follow-up: fix **auth header bypasses** below (or accept risk for those paths until fixed).
4. [ ] Flip **one group per window**; smoke-test; only then proceed.

### Auth header bypasses (follow-up — do not mass-refactor in S0-P3)

These call sites do **not** use the shared auth helpers. They will break once their group requires auth:

| File | Method | Path | Env |
|------|--------|------|-----|
| `lib/api/xanoClients.ts` | GET | `clients` | `XANO_BASE_URL` |
| `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` | GET | `media_plan_search` | `XANO_BASE_URL` |
| `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` | GET | `media_plan_versions` | `XANO_BASE_URL` |
| `lib/pacing/social/resolveLiveSocialLineItems.ts` | GET | `media_plan_social` | `XANO_BASE_URL` |
| `lib/xano/campaignKpi.ts` | GET | `campaign_kpi` | `XANO_CLIENTS_BASE_URL` |
| `app/mediaplans/[id]/edit/page.tsx` | GET | `media_plan_versions` | `XANO_MEDIA_PLANS_BASE_URL` |

---

## Flip order (write-heavy groups first)

Recommended order:

1. **media_plans**
2. **finance** (tables live under Xano group **Clients** — flip finance/revenue endpoints carefully; see §2)
3. **clients** (remainder of **Clients** group)
4. **publishers**
5. **scopes_of_work**
6. **File_Uploads** / **media details** / generic leftovers
7. Leave **codex** / **Authentication** last or already partially auth’d — review catalog

**Rollback (any group):** In Xano UI, set that API group (or the flipped endpoints) back to **public**. Redeploy not required if only Xano auth changed.

---

## 1. media_plans

**Env:** `XANO_MEDIA_PLANS_BASE_URL` (aliases: `XANO_MEDIAPLANS_BASE_URL`, `XANO_MEDIA_CONTAINERS_BASE_URL`)

### App-called endpoints (from inventory)

| Method | Path |
|--------|------|
| GET | `download_mediaplan` |
| GET | `media_plan_master`, `media_plan_master/{id}` |
| GET | `media_plan_versions` |
| PATCH | `media_plan_master/{id}`, `media_plan_versions/{id}` |
| POST | `media_plan_master`, `media_plan_versions` |
| POST | `media_plan_digi_bvod`, `media_plan_influencers`, `media_plan_integrations`, `media_plan_newspaper`, `media_plan_production`, `media_plan_prog_video`, `media_plan_social`, `media_plan_television` |
| POST | `cinema_line_items`, `search_line_items`, `generate_mbanumber`, `get_mediaplan_topline` |
| PUT / DELETE | `television_line_items` |

Also used via `XANO_BASE_URL` (generic): `media_plan_search`, `media_plan_social`, `media_plan_versions` — fix bypasses before relying on auth.

### Smoke test (after flip)

1. **Read:** Open an existing media plan (list → detail / edit). Confirm plan + versions load.
2. **Write:** Save a small edit on a draft plan (or add/update one channel line item) and confirm persist + reload.

### Rollback

Flip **media_plans** group back to public in Xano UI.

---

## 2. Finance (under Clients group in Xano)

There is **no separate Xano “finance” API group** in the catalogue. Finance tables (`finance_*`, `revenue_*`) live in the **Clients** group. Prefer flipping finance write endpoints (or a finance subgroup if you create one) **before** locking the rest of Clients.

### App-called finance-related paths (Clients env)

| Method | Path | Notes |
|--------|------|--------|
| GET | `finance_billing_records` | publishers / overlay / materialise |
| GET | `finance_edits` | audit writes path also hits this base |
| POST | `finance_forecast_snapshots_create` | forecast snapshots |
| GET / PATCH | `xero_sync_exceptions` | Xero queue |
| (catalog) | `revenue_*` | already auth-required in Xano; app may use dedicated target helpers |

### Smoke test

1. **Read:** Open Finance → billing or forecast view; confirm data loads.
2. **Write:** Apply one finance edit or save a forecast snapshot (non-prod MBA if possible).

### Rollback

Revert finance/revenue endpoints (or Clients subgroup) to public.

---

## 3. clients (Clients group — remainder)

**Env:** `XANO_CLIENTS_BASE_URL`

### App-called endpoints (non-finance subset)

| Method | Path |
|--------|------|
| GET | `get_clients`, `clients/{id}`, `{id}` |
| GET / POST / PATCH / DELETE | `client_kpi`, `campaign_kpi` |
| GET / POST | `creative_asset` (GET already auth) |
| GET / POST / PATCH | `planning_audiences` (already auth) |
| GET | `get_publishers` (also called from Clients URL in places) |

### Smoke test

1. **Read:** Clients list / client detail.
2. **Write:** Update a client KPI or create/update a creative asset (staging).

### Rollback

Flip **Clients** group (or remaining endpoints) back to public.

---

## 4. publishers

**Env:** `XANO_PUBLISHERS_BASE_URL`

### App-called endpoints

| Method | Path |
|--------|------|
| GET | `publishers`, `get_publishers` |
| POST | `post_publishers` |
| PUT | `edit_publishers` |
| GET / POST / PATCH / DELETE | `publisher_kpi` |
| GET / POST / PUT | `media_container_best_practice` |

### Smoke test

1. **Read:** Publishers list / publisher detail.
2. **Write:** Edit a publisher or save a best-practice row.

### Rollback

Flip **Publishers** group back to public.

---

## 5. scopes_of_work

**Env:** `XANO_SCOPES_BASE_URL`

| Method | Path |
|--------|------|
| GET / POST / PUT | `scope_of_work` |

### Smoke test

1. **Read:** Open an SOW-linked finance/billing view.
2. **Write:** Create or update one scope_of_work record via the UI path that persists it.

### Rollback

Flip **scopes_of_work** back to public.

---

## 6. File_Uploads / media details / generic

| Group | Env | App usage |
|-------|-----|-----------|
| File_Uploads | `XANO_SAVE_FILE_BASE_URL` | file fetch by id |
| media details | `XANO_MEDIA_DETAILS_BASE_URL` | proxy path |
| (generic) | `XANO_BASE_URL` | billing_overrides, mba_line_approvals, pacing orphans, some plan reads |

### Smoke test

1. **Read:** Load a plan that hits media-details proxy; open billing overrides if used.
2. **Write:** One billing override replace/reset or MBA line approval change.

### Rollback

Flip the corresponding group(s) back to public.

---

## Cross-reference summary (inventory)

| Bucket | Count (last run) | Meaning |
|--------|------------------|---------|
| (a) App calls that are **public** in Xano | ~73 | Must send auth **before** flip |
| (a2) App calls that **already require auth** | ~4 | Already using helpers + key |
| (a3) App calls unmatched to catalog | ~29 | App-only paths, aliases, or scanner noise — review before delete |
| (b) Xano endpoints with **no app call** | ~298 | Candidates to lock hardest or delete |

Unused catalogue endpoints are listed under `crossReference["(b) xanoEndpointsWithNoAppCall"]` in `xano-call-inventory.json`.

---

## Coverage note

Static scan of `app/` + `lib/` for `XANO_*_BASE_URL` / `xanoUrl(...)`. Dynamic path builders and thin wrappers may be under-detected; treat (a3) and unused (b) as starting points, not absolute truth. Re-run the inventory after major Xano or API refactors.
