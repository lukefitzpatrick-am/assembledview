# IG-12 — Ingest evaluation corpus and per-publisher accuracy

**Status:** Implemented (harness + goldens; CI cron in the follow-up commit)  
**Surface:** `scripts/ingest-eval.ts`, `lib/mediaplans/ingest/ingestEval.ts`, `tests/fixtures/ingest-golden/`  
**Non-goals:** Storing original xlsx on `ingest_stages`; a Blob ingest path; scoring live published plans without a retrievable file; running Anthropic audit in CI

## Live corpus (REPORT 1)

There is **no** `ingest_stage_id` column on `media_plan_versions`. Join paths:

- `ingest_stages.accepted_version_id` = `media_plan_masters.published_version_id`
- `ingest_runs.accepted_version_id` where `outcome = 'accepted'`
- `line_item_panels.source_row_ref` via `line_items.line_item_id` onto the published pointer

Stages store `review_package` jsonb + `file_name`, not the workbook bytes. No ingest Blob writer exists. Live probe (2026-09-06): **0** published versions with a retrievable source file, per publisher. 7 pending stages, 0 accepted, 0 retained, 0 ingest panels on published pointers.

The evaluable corpus is the five checked-in fixtures.

## Scoring

For each `(file, golden)` pair, run today's parser (`buildIngestReviewFromFile` + `stampProposalForSave`; skip AVA; skip audit). Per `source_row_ref`: money exact, dates exact, format (canonical or `unresolved:` raw), placement, buy type.

Goldens: `tests/fixtures/ingest-golden/{jcd,qms,sca-v1,sca-v2,sen}.json`. JCD locks 95 / 131,250.01 / the unique burst date list.

A moved golden number fails the build. Do not regenerate goldens to hide a parser regression (`npx tsx scripts/ingest-eval.ts --write-golden` is deliberate).

## Schedule

Weekly **Vercel cron** `GET /api/cron/ingest-eval` (not a GitHub Action) writes `ingest_eval_runs` (0067 AUTHOR ONLY) so the Publisher Hub can show the latest per-publisher score. Fail-soft until applied (C-76).
