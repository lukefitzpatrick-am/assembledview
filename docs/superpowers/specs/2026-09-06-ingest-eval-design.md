# IG-12 — Ingest evaluation corpus and per-publisher accuracy

**Status:** Implemented  
**Surface:** `scripts/ingest-eval.ts`, `lib/mediaplans/ingest/ingestEval.ts`, `tests/fixtures/ingest-golden/`  
**Non-goals:** Running Anthropic audit in CI. Weekly cron stays golden-only. Live pairs require `source_file` (IG-14 / 0068).

## Live corpus (REPORT 1)

There is **no** `ingest_stage_id` column on `media_plan_versions`. Join is `ingest_stages.accepted_version_id` / `ingest_runs.accepted_version_id` / `line_item_panels.source_row_ref`. IG-14 stores the workbook as private Blob `ingest/{stageId}/{filename}` on `ingest_stages.source_file`. Live pairs (`ingest-eval --dry-run` / `--full`) keep a retained stage when `published_version_number >= accepted_version_number` on the same master; sha256 dedupes the same file twice on one plan. Pre-IG-14 stages (`source_file` null) are omitted. Cron stays golden.

## Scoring

For each `(file, golden)` pair, run today's parser (`buildIngestReviewFromFile` + `stampProposalForSave`; skip AVA; skip audit). Per `source_row_ref`: money exact, dates exact, format (canonical or `unresolved:` raw), placement, buy type.

Goldens: `tests/fixtures/ingest-golden/{jcd,qms,sca-v1,sca-v2,sen}.json`. JCD locks 95 / 131,250.01 / the unique burst date list.

A moved golden number fails the build. Do not regenerate goldens to hide a parser regression (`npx tsx scripts/ingest-eval.ts --write-golden` is deliberate).

## Schedule

Weekly **Vercel cron** `GET /api/cron/ingest-eval` (not a GitHub Action) writes `ingest_eval_runs` (0067 AUTHOR ONLY) so the Publisher Hub can show the latest per-publisher score. Fail-soft until applied (C-76).
