# 05 — Ways of working

## The change protocol

**One prompt = one commit = one gate review.**

Nothing is edited directly by an AI. Claude reviews, proposes and writes a prompt pack; Cursor applies it as a single commit; a human reads the diff before it goes anywhere. That constraint exists because this codebase is interconnected enough that a plausible-looking change in one domain has repeatedly broken another.

The same rule applies to the database. Migrations are **authored** into `db/migrations/` and applied by hand through the Supabase SQL editor. No tool applies DDL on its own.

## Branching

Two branches. That is the whole model.

- **`localhost`** — the working trunk. Everything lands here first.
- **`main`** — the deploy target. Cherry-pick only, auto-deploys to Vercel.

No feature branches, no direct commits to main, no force-push, Conventional Commits. The full law is in `/BRANCHING.md`.

And the detail that has bitten this project: **redeploy is the promote.** Setting a Vercel environment variable after a build does not reach that build. If you change an env var, redeploy.

## Before you change anything

1. Open `docs/brain/MAP.md` and find the section.
2. Open the module page for that section.
3. Search `docs/brain/BLAST-RADIUS.md` for every file you are about to touch. What it lists downstream is your test checklist.
4. Check `docs/brain/KNOWN-ISSUES.md` — the bug may already be recorded, with constraints on the fix.
5. Check `docs/brain/INVARIANTS.md`. If the task requires breaking one, that is a decision for Luke, not an implementation detail.

## After you change anything

Update the brain **in the same commit** if the change altered anything it describes — a contract, a dependency, a data shape, a gotcha created or resolved. Surgical edits; these are reference pages, not changelogs.

A new decision is one present-tense line in `INVARIANTS.md`. New debt gets the next free ID in `KNOWN-ISSUES.md`. A fixed issue is marked fixed with the commit — never deleted, because the row is the record that it was once true.

A brain that lags the code is worse than no brain, because it is trusted.

## Where things are written down

| Kind | Goes in |
|---|---|
| Durable architectural knowledge | `docs/brain/` |
| Human explanation of the same | `docs/handbook/` |
| Time-bound plans and specs | `docs/superpowers/{plans,specs}/` with an explicit `Status:` |
| Decisions with a date and a rationale | the relevant decisions log |
| Anything | **not the repo root** |

Around sixty one-off discovery and audit files sit in the repo root from earlier sessions. Their durable content has been folded into the brain. They are the pattern this structure replaces; `docs/brain/DOC-MAP.md` is the disposition list.

## The rules that exist because something broke

Each of these is here because it did not hold once.

- **Fee is a slice of gross**, computed in one file. Local fee splits caused billing errors.
- **The published version is a pointer**, not the highest number and not implied by a status field. Inferring it published the wrong plan.
- **Money is integer cents** in the plan core. Floating-point drift caused reconciliation gaps.
- **Reads fail loudly.** A read that soft-fails to an empty array renders as "no data" and hides an outage.
- **Every route does its own tenant check.** Middleware only authenticates.
- **Backfills need a marker guard.** `WHERE col IS NULL` stops being a safe re-run guard the moment the column is live, because NULL then means something real.
- **The two plan pages are twins.** Changing one and not the other ships half a feature.
- **Redeploy is the promote.** An env var set after the build did not reach production.

## Working with AI on this repo

`docs/brain/AI-DIRECTIONS.md` is the operating manual — context budgets, which file to open for which task, and the prompt-pack template.

Three habits matter more than the rest:

**Route before you read.** The repo is 350,000 lines. Nobody reads it. Use the map to find the two thousand lines that matter, and stop there.

**Name the files.** "Fix the billing bug" produces a search. "Edit this function in this file, do not touch that one" produces a diff you can review.

**Ask for confidence.** Anything the model is under 90% sure of should come back as a question with the file it needs, not as a guess that reads fluently. That is the project rule and it is the reason this system has stayed reviewable at its size.
