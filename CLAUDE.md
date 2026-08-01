# AssembledView — rules for AI-assisted changes

This app is deeply interconnected. Uncoordinated changes cause regressions in distant domains. The architecture brain at **`docs/brain/`** exists to prevent that. These rules are mandatory for every session.

## Before you change anything

1. Read `docs/brain/README.md` if this is your first time in this repo this session.
2. Open the relevant `docs/brain/modules/*.md` page for the area you're touching.
3. Search `docs/brain/BLAST-RADIUS.md` for **every file you plan to modify**. The listed downstream consumers are your review-and-test checklist — verify each one still behaves.
4. Check `docs/brain/KNOWN-ISSUES.md` — the bug you're chasing may already be recorded, and your fix may be constrained by an entry there.
5. Never violate `docs/brain/INVARIANTS.md`. If a task requires breaking an invariant, stop and flag it to Luke — that's a decision, not an implementation detail.

## After you change anything

6. **Update the brain in the same commit** if your change altered anything it describes: a contract, a dependency edge, a data shape, a gotcha introduced or resolved. Surgical edits only — these are reference pages, not changelogs.
7. New decision made? One present-tense line in `INVARIANTS.md` (no dates, no branch names). New debt discovered? Add it to `KNOWN-ISSUES.md` with the next free ID. Fixed a known issue? Mark it `FIXED (commit)` — don't delete the row.
8. Major module dependency added/removed? Update the `GRAPH` data block in `docs/brain/dependency-map.html`.

## Hard rules (violations cause production incidents)

- **Fee math** changes go through `lib/mediaplan/burstAmounts.ts` only. Never introduce a local media/fee split. Fee is a slice of gross, never `net × fee%`.
- **`bursts_json` shape** (serializeBurstsJson/formatBurstsForPersist) and **`line_item_id`** (lineItemIds.ts) are cross-domain contracts — pacing, billing, finance, Snowflake, dashboards and exports all parse them. Change both sides or neither.
- **Published version = `media_plan_master.version_number`**, never `max(versions)`.
- **ZERO-$ LAW**: ad-serving/CM360 surfaces never compute or display spend pacing.
- `NaN` from deliverable math is a "no recompute" sentinel, not a zero.
- The `PacingStatus` ladder order mirrors a Snowflake view — do not reorder.
- Any change to `create/page.tsx` likely needs the twin change in `edit/page.tsx` and vice versa.
- New API routes must implement their own tenant checks — middleware only authenticates.
- Adding a media channel: complete ALL ~12 registry maps listed in BLAST-RADIUS.md, or the channel half-works.

## Workflow

- Branching: `localhost` = working trunk, `main` = cherry-pick-only deploy target (auto-deploys). No other branches, no direct commits to main, no force-push. Conventional Commits. Full law in `/BRANCHING.md`.
- Root of the repo is not a documentation destination. Durable knowledge → `docs/brain/`; time-bound plans/specs → `docs/superpowers/` (use its template with an explicit `Status:`).
- Prefer `tsx --test` / existing test patterns; run the relevant `lib/**/__tests__` suites for any helper you touch.
