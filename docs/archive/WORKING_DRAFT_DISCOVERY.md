# Working-draft state — discovery (F1)

**Date:** 2026-07-11  
**Mode:** Read-only. No build.  
**Product lock:** Clients see **last published** version; working-draft edits accumulate invisibly; **document downloads disabled** while a working draft exists.

---

## 1. Version lifecycle today

### Pointers (actual model)

| Concept | Reality |
|---------|---------|
| `latest_version_id` | **Does not exist** |
| Master pointer | `media_plan_master.version_number` (integer) |
| Computed latest | `max(version_number)` over rows for that MBA |
| Version row PK | `media_plan_versions.id` (docs upload target) |

### Create

- Create page / `POST /api/mediaplans` → version_number typically `1`, status often `Draft`.

### Edit save (`handleSaveAll` → MBA PUT)

Primary path: `app/mediaplans/mba/[mba_number]/edit/page.tsx` → `PUT /api/mediaplans/mba/[mba_number]`.

Rules in `app/api/mediaplans/mba/[mba_number]/route.ts`:

```
latestVersionNumber = max(existing) || master.version_number
nextVersionNumber   = latestVersionNumber + 1

overwriteMode =
  v1 exists AND latest === 1 AND v1.campaign_status === "draft"
```

| Mode | Behaviour |
|------|-----------|
| **overwrite** | PATCH v1 in place; master stays at 1 |
| **increment** | POST new version row; PATCH master `version_number` to next |

Then: save line items under that version; generate + upload docs to `/api/mediaplans/versions/{id}/documents`.

Draft-return guard runs before write (`getDraftReturnRejection`).

### What clients / systems read

| Surface | Rule |
|---------|------|
| Client hub / spend | `pickHighestVersionRow` (max version_number) |
| MBA campaign page | Default = latest / master `version_number`; optional `?version=` |
| Client downloads | Files on **selected version row** (`media_plan`, `mba_pdf`) |
| Finance relevant version | Master `version_number` map + month overlap |
| Pacing | Live masters → `master.version_number` |
| Forecast | Highest version per MBA after status filter |

**Philosophy today:** After leaving draft-v1 overwrite, every save is a new published tip. Clients already see every save.

---

## 2. Campaign status + `campaignStatusGuard`

**Editor vocabulary:** `approved` | `booked` | `cancelled` | `completed` | `draft` | `planned`  
(Also seen: `planning`, `probable` in other modules.)

**Guard** (`lib/mediaplan/campaignStatusGuard.ts`):

- If persisted ≠ `draft` and incoming = `draft` → **422** (“cannot be returned to Draft”).
- Wired on MBA PUT + PATCH.
- UI removes Draft from select once left draft.

**Live filters:** pacing `booked`|`approved`; dashboard spend also `completed`.

### Where `working_draft` would interact

| Approach | Interaction |
|----------|-------------|
| New **campaign_status** value | Collides with draft-return guard, live pacing, finance filters, status matrix |
| Separate publish pointer | Status stays `approved`/`booked`; gating orthogonal to guard |

---

## 3. Document download paths (gate while working draft exists)

### Client MBA dashboard (critical external surface)

- Download Media Plan / MBA / Billing — `CampaignActions`
- Mobile Downloads menu — same
- Version selector (`?version=`) — must not leak unpublished versions

### Media plan editor

- Generate MBA, Media Plan, Media Plan (AA), Naming Conventions, Save & Download All, Billing schedule Excel — `edit/page.tsx` / `CampaignExportsSection`

### Create page

- Same export pattern as editor

### Legacy detail

- `app/mediaplans/[id]/page.tsx` → `/api/mediaplans/download`

### API routes

| Route | Role |
|-------|------|
| `app/api/mediaplans/download/route.ts` | Excel (standard + AA) |
| `app/api/mediaplans/generate-pdf/route.ts` | Workbook generation |
| `app/api/mediaplans/[id]/download/route.ts` | Proxies Xano download |
| `app/api/mediaplans/versions/[id]/documents/route.ts` | **Upload** docs onto version |
| `app/api/finance/receivables/aa-media-plan/route.ts` | Finance AA via relevant version |

Save-time auto-upload still binds docs to the tip version — policy must decide whether unpublished saves upload client-visible files.

---

## 4. Options analysis (no build)

### (a) Status-based — new `campaign_status` (e.g. `working_draft`)

**Pros:** No new pointer column.  
**Cons:** Overloads lifecycle status; fights `campaignStatusGuard` and live filters; does not cleanly pin “last published content.”  
**Fit:** Poor. **~25%.**

### (b) Pointer-based — `published_version_number` (or id) on master

**Idea:** Edits keep creating tip versions; clients/downloads read **published_***; publish advances the pin. Working draft = tip ≠ published.

**Pros:** Matches product; preserves append-only history; orthogonal to status guard; clear download gate (`tip > published`).  
**Cons:** Schema + migrate (`published = current` for existing); retarget client/finance/default GET; Snowflake already syncs all versions’ line items unless filtered; pacing product choice (tip vs published).  
**Fit:** Best. **~75% recommended.**

### (c) Draft-row based — single mutable working row; publish = bump

**Pros:** Fewer rows while editing.  
**Cons:** Conflicts with post–draft-v1 append-only model, version-scoped line items, document-per-version, audit diffs. Overwrite mode today is draft-v1 only.  
**Fit:** Weak for booked/approved. **~40%.**

---

## 5. Recommendation

**Choose (b) pointer-based `published_version_number` on `media_plan_master` — ~75% confidence.**

Reasons:

1. Product needs two tips (invisible working vs client-visible published); status cannot express that cleanly.
2. Keeps current “new row per save” philosophy and adds a publish pin.
3. (c) fights version-scoped line items and docs; (a) fights status semantics.

**Follow-ons:** migrate existing rows; retarget client + finance readers; gate downloads; decide pacing/Snowflake scope (published vs tip).

**Confidence caveats (−25%):** pacing/Snowflake choice not locked; whether intermediate saves still create version rows under the pointer; historical “every save was published” expectations.
