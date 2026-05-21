# Domain 4 — Xano endpoint shapes (Tasks 3.1 & 3.2)

**Owner:** Luke (Xano UI access required)  
**Status:** Template — fill after UI inspection and schema check.

---

## Task 3.1 — Sample endpoint function stacks

Record for each: **endpoint #**, **declared inputs**, **function stack summary**, **filter type** (none / query-all / custom query + join).

### media_plan_search (#207) — reference (updated)

- [ ] Screenshot or summary attached
- Endpoint #:
- Inputs:
- Join:
- Custom query filter:
- Notes:

### media_plan_production

- [ ] Screenshot or summary attached
- Endpoint #:
- Inputs:
- Function stack:
- Notes:

### media_plan_television

- [ ] Screenshot or summary attached
- Endpoint #:
- Inputs:
- Function stack:
- Notes:

### media_plan_radio (#114)

- [ ] Screenshot or summary attached
- Endpoint #:
- Inputs:
- Function stack:
- Notes:

---

## Task 3.2 — Schema check (one alternate table)

**Table inspected:** _e.g. media_plan_radio or media_plan_television_

| Check | Result (Y/N/?) | Notes |
|-------|----------------|-------|
| Has `media_plan_version` column (FK → `media_plan_versions.id`) | | |
| Has `mp_plannumber` column (denormalised display version) | | |
| Has `mba_number` on row directly | | |
| `mba_number` only via join | | |

### Portability verdict

- [ ] **Portable as-is** — search #207 JOIN pattern applies unchanged
- [ ] **Needs per-table mapping** — describe:
- [ ] **Blocked** — describe:

---

## Screenshots

<!-- Paste or link screenshots below -->
