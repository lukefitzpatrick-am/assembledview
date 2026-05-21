# Domain 4 — Stage 1 prerequisites (Task 2.5)

Stage 1 is **Xano-only** endpoint replication (19 remaining tables). Do not start until every item below is checked.

---

## Blocking checklist

- [x] All Section 4 curl tests pass with expected results (see `curl-test-results.md`) — **2026-05-21 PASS**
- [ ] Truth table (`endpoints-truth-table.md`) has no remaining `UNKNOWN_NEEDS_TEST` in **`route_layer_pattern`** or **`browser_path_segment`** columns
- [ ] Baseline performance capture (`baseline-performance.md`) is populated with at least one BOSS002 v10 edit-page load (median of 3 runs)
- [ ] Decision logged on **O3**: JOIN-based filter (`media_plan_version` → `media_plan_versions.version_number`) vs denormalised `mp_plannumber` direct match
- [ ] Xano endpoint shapes documented for 4 sample endpoints (`xano-endpoint-shapes.md` — Tasks 3.1–3.2)
- [ ] Schema portability confirmed or denied (Task 3.2) — updates `version-column-hypotheses.md` if needed
- [ ] Open questions **O1**, **O2**, **O3** have resolutions logged (below)
- [ ] Code verification (`code-verification.md`) reviewed — no unaddressed surprises for pilot wiring

---

## Open questions resolution log

| ID | Question | Resolution | Resolved by | Date |
|----|----------|------------|-------------|------|
| O1 | How does Xano handle missing `version_number`? | **Returns MBA-scoped set (10 rows for BOSS002), same as A1/C1 — not 0** | curl C1 2026-05-21 | 2026-05-21 |
| O2 | Is FK-via-join filter portable to other tables? | _Pending Task 3.2_ | Xano schema check | |
| O3 | JOIN path vs `mp_plannumber` direct match? | _Pending Task 3.2 + mp_plannumber population audit_ | Team decision | |
| O4 | Xano endpoint rollback story? | _Pending Luke confirmation of version history in Xano UI_ | Xano UI | |

**Recommendation (preliminary):** Prefer **JOIN pattern from #207** unless Task 3.2 proves `mp_plannumber` is reliable on every table.

---

## Pilot-specific gates (search #207)

Before replicating pattern to 19 endpoints:

- [x] Test B1: `mba_number=BOSS002&version_number=10` row count ≈ prior `[SEARCH] Kept N` log (≈1 for v10) — **1 row**
- [x] Test B1 ≪ Test A1 (MBA-only row count) — **1 vs 10**
- [x] Test B2 differs from B1 (proves version dimension works) — **both 1 row (one per version); filter active**
- [x] Test D1 == D2 for `media_plan_radio` (control — still unfiltered) — **899 == 899**

---

## Known code-layer follow-ups (Stage 2+, not Stage 1 blockers)

Documented in `code-verification.md`:

1. Search route must forward `version_number` to Xano after #207 validated.
2. `fetchLineItemsFromApi` should align with `lineItemPaginationParams` (add `version_number`).
3. `digi-bvod` GET handler gap — browser BVOD loads may 405 today.
4. Edit page double `filterLineItemsByPlanNumber` — deprecate in Stage 3.
5. Production route MBA-only fallback when filter returns 0 — review when Xano filters.

---

## Exit artifact for Stage 0 → Stage 1 handoff

When all blocking items are checked, create:

`AUDIT_DOMAIN_4_STAGE_1_XANO_ROLLOUT.md`

(per Domain 4 plan §6 — not started in Stage 0).
