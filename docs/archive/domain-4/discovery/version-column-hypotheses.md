# Domain 4 — Version column hypotheses (Task 2.3)

**Status:** Hypotheses only — do not use for Xano endpoint edits until Task 3.2 schema check confirms per table.

**Reference filter** (`filterLineItemsByPlanNumber`) treats these as **equivalent for matching** when their string value equals the requested display version (e.g. `10`):

`media_plan_version` · `media_plan_version_number` · `version_number` · `versionNumber` · `mp_plannumber` · `mp_plan_number`

**Canonical rollout filter (pilot #207):** JOIN `line_items.media_plan_version` → `media_plan_versions.id`, filter `media_plan_versions.version_number == input.version_number`.

---

## Hypothesis key

| Symbol | Meaning |
|--------|---------|
| **FK** | Plausible FK → `media_plan_versions.id` (integer id, e.g. 689) |
| **DISP** | Plausible denormalised display version (human plan number, e.g. 10) |
| **?** | Unknown until Xano DATABASE view inspected |
| **—** | Unlikely on line-item row (may appear only on joined `version` record) |

---

## Per-table hypotheses

### media_plan_search (pilot — partial CSV evidence)

| Field | Role | Evidence / rationale |
|-------|------|----------------------|
| `media_plan_version` | **FK** | Documented FK 689 → `media_plan_versions.id` |
| `mp_plannumber` | **DISP** | Documented denormalised 16 (may ≠ `version_number` 10) |
| `media_plan_version_number` | **—** | Not cited in schema export |
| `version_number` | **—** | On joined `media_plan_versions`, not row |
| `versionNumber` | **—** | camelCase variant only in JS |
| `mp_plan_number` | **?** | Alternate spelling in filter only |
| `mba_number` | direct | Filter input |

---

### media_plan_television

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | Declared `number` on route `TelevisionData` interface |
| `mp_plannumber` | **DISP** | Declared `string` on same interface |
| `version_number` | **—** | Not in POST interface |
| Others | **?** | Confirm in Xano DB |

---

### media_plan_radio

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | Consistent across media_plan_* family |
| `mp_plannumber` | **DISP** (likely) | Consistent denormalised pattern |
| Others | **?** | Task 3.2 sample table — **use radio or television for schema check** |

---

### media_plan_newspaper

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | Same `NewspaperData` shape as television route |
| `mp_plannumber` | **DISP** (likely) | Same |
| Others | **?** | |

---

### media_plan_magazines

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | Family default |
| `mp_plannumber` | **DISP** (likely) | |
| Others | **?** | |

---

### media_plan_ooh

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (likely) | |
| Others | **?** | |

---

### media_plan_cinema

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (likely) | |
| Others | **?** | |

---

### media_plan_digi_display

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (likely) | |
| Others | **?** | |

---

### media_plan_digi_audio (API alias: `digital_audio_line_items`)

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (?)) | Confirm population — endpoint name differs from table |
| Others | **?** | |

---

### media_plan_digi_video (API alias: `digital_video_line_items`)

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (?) | |
| Others | **?** | |

---

### media_plan_digi_bvod (browser path `digi-bvod`)

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (?) | |
| Others | **?** | |

---

### media_plan_integrations

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | `IntegrationData` interface |
| `mp_plannumber` | **DISP** (likely) | Same interface |
| Others | **?** | |

---

### media_plan_production

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | Route sends all three version params today |
| `mp_plannumber` | **DISP** (likely) | Production fallback suggests inconsistent version fields on some rows |
| Others | **?** | |

---

### media_plan_social

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | Paginated modern route |
| `mp_plannumber` | **DISP** (likely) | |
| Others | **?** | |

---

### media_plan_prog_display

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (likely) | |
| Others | **?** | |

---

### media_plan_prog_video

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (likely) | |
| Others | **?** | |

---

### media_plan_prog_bvod (API alias: `prog_bvod_line_items`)

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (?) | |
| Others | **?** | |

---

### media_plan_prog_audio (API alias: `prog_audio_line_items`)

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (?) | |
| Others | **?** | |

---

### media_plan_prog_ooh (API alias: `prog_ooh_line_items`)

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (?) | |
| Others | **?** | |

---

### media_plan_influencers

| Field | Role | Rationale |
|-------|------|-----------|
| `media_plan_version` | **FK** (likely) | |
| `mp_plannumber` | **DISP** (likely) | |
| Others | **?** | |

---

## Cross-cutting risks for O3 (JOIN vs direct `mp_plannumber`)

1. **`media_plan_version` on rows may store FK id or display number** — JS filter accepts either because it compares stringified values to display version `10`. JOIN path avoids that ambiguity.
2. **`mp_plannumber` may be stale or empty** on some tables (production fallback hints at this).
3. **API path aliases** (`digital_audio_line_items`, etc.) may point at views with different column sets — verify each endpoint’s backing table in Xano, not only the physical table name in `lib/api.ts` server getters.

## Recommended default for Stage 1 (pending Task 3.2)

Use **JOIN pattern from #207** unless schema check proves `mp_plannumber` is non-null and equals `media_plan_versions.version_number` for **all** rows in that table.
