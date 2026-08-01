# Migration anomaly dispositions

Audit trail for Xano → Supabase ETL disposition CSVs. T6 deployment campaign relies on this file — do not silently absorb anomalies.

**Decided by:** Luke Fitzpatrick · **Recorded:** 2026-07-30 · **Branch:** `localhost`

---

## Decision log (pre-agreed, do not re-litigate)

| MBA / scope | Decision | Who | Date |
|---|---|---|---|
| jayco016 v1–v4 (empty schedules) | **ACCEPT as-is.** No Xano repair — no live campaign activity is to be updated. | Luke | 2026-07-30 |
| krusty005 v1 (104 lines, empty blobs) | **ACCEPT** (save-outage-era test campaign). | Luke | 2026-07-30 |

---

## A — `production-skips.csv`

### A.a — `media_plan_version=0` (~25 rows)

| Field | Value |
|---|---|
| Symptom | Rows skipped with `media_plan_version=0 not found in versions` |
| Root cause | ETL treated `0` as a real version id and never attempted the mba_number + mp_plannumber fallback required by Prompt 3 addendum §6 |
| Fix | `_lineItemTransform.resolveVersionId`: treat `0` as unset; always attempt mba+mp fallback before skip (all channels) |
| Decision | **FIX** — fallback wired; rescues all 25 version=0 rows (deterministic: `mp_plannumber` → that MBA's `version_number`) |
| Who / date | Cursor (T1) · 2026-07-30 |

### A.b — Lines pointing at DROPPED duplicate version ids

| Group | Dropped ids | Kept id | Equivalent under kept? | Decision |
|---|---|---|---|---|
| PENFOLD017 v1 | 774–776 (chain 773→…→777) | 777 | **Yes** — same `line_item_id` already on 777 (OH1/PD1/PV1) | Remap transitively → collapse into kept; logged in `duplicates.csv` |
| jayco013 v1 | 693–697 (chain 692→…→698) | 698 | **Yes** — `jayco013SM1` already on 698 | Remap transitively → collapse into kept; logged in `duplicates.csv` |
| BICAU004 v1 | 457 (chain 456→457→458) | 458 | **Yes** — PD1/SM1 already on 458 | Remap transitively → collapse into kept; logged in `duplicates.csv` |

| Field | Value |
|---|---|
| Root cause | `versionRemap` was one-hop only; intermediate dropped ids still failed lookup |
| Fix | `resolveRemappedVersionId` walks remap chains to the final kept id; collisions with kept-version rows collapse via existing dedupe → `duplicates.csv` |
| Decision | **REMAP** (transitive) + collapse; equivalent-under-kept confirmed for all three groups |
| Who / date | Cursor (T1) · 2026-07-30 |

### A residual skips (post-fix)

| Row | Decision | Reason |
|---|---|---|
| krusty004 search id 12 (`media_plan_version=55`) | **REMAP via mba+mp** (mp=1 → version 976) | Phantom FK (55 never existed); no search line under kept v1 — fallback rescues |
| krusty013 (`no version with version_number=1`) | **ACCEPT skip** | Only v2 (id 1058) exists; mp_plannumber=1 has no matching version — no invent |

---

## B — `parse-failures.csv` (3 rows)

| version_id | MBA | vn | Blob | Why `normalizeBillingScheduleToArray` rejected | Decision |
|---|---|---|---|---|---|
| 60 | curatif002 | 1 | `deliverySchedule: {}` | Empty object is not an array and has no `months` array → returns `null` | **ACCEPT no-delivery** — `{}` is an empty sentinel, not a schedule; ETL `isEmpty` now treats `{}` / `{months:[]}` as empty (no rows, no failure). Never synthesize $0. |
| 61 | curatif002 | 2 | `deliverySchedule: {}` | Same | **ACCEPT no-delivery** (same) |
| 62 | malay001 | 2 | `deliverySchedule: {}` | Same | **ACCEPT no-delivery** (same) |

| Field | Value |
|---|---|
| Parser extension? | No tolerant amount parsing — shape is empty, not a legacy amount variant |
| Who / date | Cursor (T1) · 2026-07-30 |

---

## C — jayco016 empty schedules

Covered by pre-agreed ACCEPT (see decision log). No ETL change.

---

## D — Synthesized orphan `media_plan_masters` row

| Field | Value |
|---|---|
| MBA | **test123001** |
| Why | Orphan version row id 128 (`version_number=1`, campaign "BUXTON ROODING ST") has no matching `media_plan_master`; ETL synthesizes master id `10000128` (`version.id + 10_000_000`). (Gate-review "189th" was vs the prior 188-master snapshot; fresh export has 189 Xano masters incl. golf022 + this synthesized orphan.) |
| Decision | **ACCEPT** synthesized master (ETL orphan path) |
| Who / date | Cursor (T1) · 2026-07-30 |

---

## Other CSV classes (unchanged this pass)

| CSV | Expected band | Disposition policy |
|---|---|---|
| `duplicates.csv` | ~270+ groups (grows when remapped lines collapse onto kept) | Collapse to highest Xano id; dropped $ logged — not silent |
| `version-duplicates.csv` | 14 rows | Keep highest id per (mba, version_number); feed `versionRemap` |
| `schedule-divergence.csv` | 53 (was ~47) | See §E — ACCEPT; empty in Xano too (parity, not regression) |

---

## E — `schedule-divergence.csv` class breakdown (53 rows)

Billing vs delivery divergence from recon. **All ACCEPT** — schedules are empty in Xano too; Postgres parity, not a regression. Not a finance/pacing cutover blocker.

| Campaign status class | Count |
|---|---|
| draft | 8 |
| planned | 19 |
| completed | 13 |
| cancelled | 1 |
| approved-historic | 9 |
| booked | 6 |
| **Total** | **53** |

Booked MBAs in this class (empty both sides): **BOSS002** v1, **buxton003** v3, **hartm002** v2, **jayco016** v4, **PENFOLD004** v1, **PGAAUS002** v1.

| Field | Value |
|---|---|
| Decision | **ACCEPT** — empty-in-Xano parity |
| Who / date | Luke · 2026-07-30 |

---

## T6 — `XANO_LINE_ITEMS_SNAPSHOT` repoint (deferred)

| Field | Value |
|---|---|
| Current source | `lib/xano/fetchAllLineItems.ts` → cron `app/api/cron/xano-line-item-sync` → `lib/snowflake/syncXanoLineItems.ts` → `MART.XANO_LINE_ITEMS_SNAPSHOT` |
| T2d decision | **FROZEN on Xano.** Do not wire through `DATA_BACKEND_PACING` / Postgres. Pacing overview + campaign delivery keep reading plan lines from Xano channel tables until T2e; the warehouse snapshot stays Xano-fed until deployment. |
| Where the repoint happens | **T6 deployment campaign** (handoff §5 T6): after domain flips + soak, repoint the snapshot ingest to Postgres `line_items` (or a view), dual-run parity, then disable the Xano crawl. |
| Related | Channel `media_plan_*` GETs used by `resolveLive*LineItems` / burst context → **T2e media-plans** (reassemble from consolidated `line_items`). |
| Who / date | Cursor (T2d) · 2026-07-30 |

---

## F — `readPacingMasters` null `published_version_id` version_number fallback

| Field | Value |
|---|---|
| Symptom | Masters with null `published_version_id` (golf022 zero-versions debris, krusty009 test, test123001 orphan synth) emitted `version_number: 0` while Xano still had a watermark / max(vn) → spurious shadow field diffs; blocked `DATA_BACKEND_PACING=postgres` pre-flip |
| Fix | Resolve `version_number` as `COALESCE(published version_number, max(version_number) for master, 0)` in map — **does not invent a published_version_id pointer** |
| Decision | **FIX** (read-layer only; no data touch) |
| Who / date | Cursor (T2e carry-in) · 2026-07-30 |

---

## Recon gate (must hold after every reload)

- 0 count mismatches (Xano snapshot vs Supabase)
- 0 money deltas > $0.01 / MBA
- `npm run db:recon` exit 0
