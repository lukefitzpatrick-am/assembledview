# AVA Auto-Populate Skill — Golden-File Acceptance Tests (P1)

**Date:** 14 Jul 2026 · **Prepared by:** Claude (Cowork). P1 is built (detector + Claude
mapper + apply path + skill). The 19 unit tests prove the plumbing; **these tests prove it
parses the real, heterogeneous media-owner files** — where the traps live. Derived from
ground-truth analysis of the five example plans.

**Do this:** add the five example .xlsx as repo fixtures (`tests/fixtures/ava-plans/`) and
assert the golden facts below on the **detector** output (fast, deterministic, no LLM). Then
one manual end-to-end per file through AVA. Recommend as a merge gate for the skill.

---

## P0 — must-fix found during analysis (before this ships)

**QMS selects the wrong sheet.** The detector's "largest sheet" heuristic picks
`QMS_2026_Bonus` (229 rows) over `QMS_2026_Paid` (223 rows) — so a paid OOH plan would be
parsed from the **bonus** tab. Sheet selection must **prefer a "Paid" sheet and deprioritise
"Bonus"** (mirror how it already deprioritises Double Check / Audience / R+F), and read the
Bonus tab as a second pass tagged `is_bonus=true`. Add a `bonus` term to the sheet-score
penalty and, when a `*Paid` sibling exists, pick it. This is the single highest-value fix.

---

## Fixture files (in `tests/fixtures/ava-plans/`)

| Label | Fixture filename | Original |
|---|---|---|
| ARN | `arn_boss-engineering_annual-laydown-fy26.xlsx` | ARN_x_BOSS_Engineering__Annual_Laydown_FY26__Schedule.xlsx |
| SCA v1 | `sca_boss-engineering_fy26_v1.xlsx` | Boss_Engineering__SCA_FY_26_Recommendation.xlsx |
| SCA v2 | `sca_boss-engineering_fy26_v2-rev.xlsx` | REV13.05.25__Boss_Engineering__SCA_FY_26_Recommendation_with_RF.xlsx |
| QMS | `qms_strength-meals_esb-ooh.xlsx` | QMS__Strength_Meals_Co_ESB_OOH_Sept_26__June_27_10.07.26_CLIENT.xlsx |
| SEN | `sen_boss-engineering_fy26.xlsx` | SEN_x_BOSS_Engineering_FY26.xlsx |

Key `detect.golden.json` by the fixture filename column.

## Golden facts per file (assert on detector output)

| File | Correct sheet | Header row | Flight granularity | Junk cols | Bonus handling | Metadata source |
|---|---|---|---|---|---|---|
| **ARN** (Boss Eng, Annual Laydown FY26) | `ARN Schedule` (only) | 10 | **text months + week-number rows** — NOT ISO dates; mapper must build bursts from the month/week headers | none | inline | top block (client/campaign/demo/timing/prepared) — detector got this ✓ |
| **SCA v1** (Boss Eng FY26 Recommendation) | `Boss Engineering` | 9 | 4-weekly (~28–31d) | none | inline (bonus columns present) | top block ✓ |
| **SCA v2** (REV 13.05.25) | `Boss Engineering` (NOT Double Check / Audience / R+F) | 9 | 4-weekly | none | inline | top block ✓ |
| **QMS** (Strength Meals ESB OOH) | **`QMS_2026_Paid`** (NOT `QMS_2026_Bonus`) | 8 | weekly (~7d), ~96 cols | none | `QMS_2026_Bonus` sheet → `is_bonus=true` lines | `Campaign MOVE Summary` sheet (not the data sheet) |
| **SEN** (Boss Eng FY26) | `OPTION 2` | 16 | weekly (~7d) | **`CS–DP` band (1900-dates / "Error") must be dropped** | none | booking/header block |

Notes the mapper must honour (locked decisions):
- **Prefer investment totals** as the authoritative cost cell (over derived rate×qty) where the
  plan gives an investment/total column — ARN Total Cost/Value, SCA Client/Market Total &
  Investment, SEN Total Investment, QMS Media Value.
- **Confirm-before-apply** — summary → user confirms → lines land in the form, never Xano.
- Numbers copied from cells only; anything <80% confident → `needs_review`, not a guess.

---

## Per-file end-to-end pass criteria (manual, via AVA)

For each file: create/edit a plan with the right channel (Radio for ARN/SCA/SEN, OOH for QMS),
AVA → channel → attach → review summary → confirm → inspect the form.

1. **Correct sheet parsed** (esp. QMS = Paid, SCA v2 ≠ Double Check).
2. **Line-item count is sane** — not inflated by group/subtotal rows (ARN groups by State→
   Network→Station; those headers are context, not lines). Rough real-line ballpark after
   group-row exclusion: ARN ~mid-tens, SCA v1 ~teens, SCA v2 ~single-to-low-teens, QMS ~low-
   tens, SEN ~20. (Counts above include group rows — the mapper should output fewer.)
3. **Bursts populated** across the right weeks — and for **ARN specifically**, bursts exist
   despite there being no ISO date row (the text-month/week-number case). If ARN yields zero
   bursts, the mapper isn't handling text-month flighting — that's a fail.
4. **Junk excluded** — SEN's 1900/"Error" band must not appear as weeks or costs.
5. **Bonus separated** — QMS bonus inventory tagged `is_bonus`, not added to paid budget.
6. **Metadata filled** — client/campaign/demo/dates present even when off the data sheet
   (QMS from the MOVE Summary sheet; SEN from the booking header).
7. **Provenance/needs_review** — spot-check 2–3 numbers against the source cells; confirm any
   ambiguous rows landed in `needs_review` rather than being invented.

---

## Regression fixtures (recommended)

Commit the five files + a `detect.golden.json` capturing the table above, and a test that runs
`detectPlanStructure` on each and asserts sheet, headerRow, granularity, junk columns, and
flight-column count. Detector-level (no LLM) keeps it fast and deterministic; the mapper's
semantic output is better checked by the manual end-to-end + a couple of pinned `needs_review`
expectations. Re-run before the Friday push.
