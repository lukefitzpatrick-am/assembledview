# AI-DIRECTIONS — how to work this repo with an AI

Written for the AI, and for the person briefing it. The repo is 350,000 lines across ~2,300 source files. No model reads all of it. Quality comes from reading the **right 2,000 lines**, and this page is how you find them.

## The routing rule

> Never open a file until the brain has told you which one.

Order, every task, no exceptions:

1. `docs/brain/MAP.md` → find the section. Note its routes, lib, API prefix and tables.
2. `docs/brain/modules/<section>.md` → the detail for that section.
3. `docs/brain/BLAST-RADIUS.md` → search **every file you intend to modify**. The listed consumers are your test checklist.
4. `docs/brain/KNOWN-ISSUES.md` → the bug may already be recorded, with constraints on how it may be fixed.
5. `docs/brain/INVARIANTS.md` → if the task requires breaking one, stop and escalate. That is a decision, not an implementation detail.
6. Only now, open code.

Skipping step 3 is what causes the regressions this repo is known for.

## Context budget

A task should be scopeable inside roughly:

| Budget | Content |
|---|---|
| ~1,500 lines | `MAP.md` + one module page + the relevant `BLAST-RADIUS` rows |
| ~2,000 lines | the two or three lib files that hold the rule you are changing |
| ~500 lines | the route handler |
| as needed | the component, opened at the region you are editing |

If you find yourself opening the 13,771-line edit page or the 9,121-line create page **in full**, stop. Search within them for the symbol or section you need. Those two files exist as they are; enlarging your context to hold them buys nothing.

Files large enough to require targeted reading rather than full reads:

`app/mediaplans/mba/[mba_number]/edit/page.tsx` (13,771) · `app/mediaplans/create/page.tsx` (9,121) · `lib/mediaplan/expertChannelMappings.ts` (8,434) · `components/media-containers/ExpertGrid.tsx` (5,257) · `lib/api.ts` (3,799) · `lib/mediaplan/expertGridChannelConfig.ts` (3,170) · `lib/mediaplan/containerChannelConfig.ts` (3,103) · `components/dashboard/DashboardOverview.tsx` (2,491)

## Task → starting file

| Task shape | Start at |
|---|---|
| Add or change a media channel | `db/schema/enums.ts` → `lineItemAttrs.ts` → `lib/api/media-containers.ts` → `lib/data/planShapes.ts` → the ~12-map list in `BLAST-RADIUS.md`. **All of them, or the channel half-works** |
| Change how money is split | `lib/mediaplan/burstAmounts.ts` only. Nowhere else |
| Change the schedule | `lib/data/savePlan.ts` and `schedule_months`. Not the legacy blobs |
| Change publication behaviour | `media_plan_masters.published_version_id` and `media_plan_versions.published_at`. Never `max(version_number)`, never `campaign_status` |
| Add an API route | Copy the auth + tenant-check shape from a sibling in the same folder. Middleware authenticates only |
| Add a table or column | Write `db/migrations/00NN_*.sql`, hand it to Luke to apply, then hand-sync `db/schema/*.ts` and confirm `db:generate` is an empty diff. Backfills need a `migration_markers` guard |
| Give AVA a new capability | `lib/ava/tools/registry.ts` + a tool file. Reading a **new table** also needs a migration granting `ava_readonly` |
| Fix a pacing number | `lib/pacing/maths` and the Snowflake fact. Do not reorder the `PacingStatus` ladder |
| Anything on `/dashboard/[slug]/**` | Assume a client-role user is looking at it. Tenant scope is mandatory |

## Writing a Cursor prompt pack

The working rule on this project: **Claude proposes, Cursor applies, a human reviews. One prompt = one commit = one gate review.** A prompt pack that follows this shape survives review; one that does not gets sent back.

```
PASTE INTO CURSOR — <ID>: <one-line intent>

Branch: localhost. One commit. Report-only if anything below is ambiguous.

CONTEXT
  Section: <from MAP.md>
  Brain pages read: docs/brain/modules/<x>.md, BLAST-RADIUS rows for <files>
  Invariants in scope: <the ones this touches>

CHANGE
  1. <file> — <precise change>
  2. <file> — <precise change>

MUST NOT
  - <the adjacent thing that must not move>
  - <the invariant that constrains this>

VERIFY
  - <the specific downstream consumers from BLAST-RADIUS>
  - npm run typecheck; <the targeted npm test script>

REPORT
  What changed, what you verified, and anything you were under 90% confident about.
```

Rules that make packs work here:

- **One commit per prompt.** Cherry-pick safety onto `main` depends on it.
- **Name the files.** "Fix the billing bug" produces a search; "edit `lib/billing/x.ts` line region Y" produces a diff.
- **State the MUST NOTs.** The twin-page trap, the fee formula, the publication pointer and the bursts shape are the four things models break by helpfulness.
- **Demand a confidence line.** Anything under 90% comes back as a question, not a guess.
- **Never let a prompt author DDL and apply it.** Migrations are authored in the pack and applied by hand.

## Confidence protocol

State it, do not perform it.

- Below 90% confident → say so explicitly and name what would raise it (a file, a query, a screenshot).
- Missing a file or context → ask for it. Never infer a schema, a route or a business rule from a filename.
- Live database questions → query it. Row counts, constraints and enum values are cheap to verify and expensive to guess.
- A brain page that contradicts the code → the code is right. Fix the page in the same commit.

## Anti-patterns

| Don't | Why |
|---|---|
| Grep the whole repo for a concept | `lib/planning/` and `lib/reports/` are 45 MB of reference data. Use `git grep` with a path filter, or use `MAP.md` |
| Re-derive a calculation locally | Every fee incident traced to a local media/fee split |
| "Tidy up" a name containing `xano` | `MART.XANO_LINE_ITEMS_SNAPSHOT` and `xano-line-item-sync` are frozen contract names |
| Add a second cache | Six already exist. Reuse one |
| Change `create/page.tsx` alone | Its twin is `mba/[mba]/edit/page.tsx` |
| Fix a failing `db:generate` diff by applying it | The live DB is ahead by design. Fix the mirror |
| Write a discovery doc into the repo root | ~60 already sit there. That is the pattern this brain replaces |
| Soft-fail a read to `[]` | It renders as "no data" and hides an outage |

## Keeping the brain honest

The brain is only worth reading if it is true. Every commit that changes a contract, a dependency edge, a data shape or a gotcha updates the relevant page **in the same commit**. Surgical edits, present tense, no dates, no branch names. A brain that lags the code is worse than no brain, because it is trusted.
