# IG-11 — Parse Review (per-row gate)

**Status:** Implemented
**Surface:** `/mediaplans/mba/[mba_number]/ingest/[stageId]` (staff). Create and Hub use `mba_number=create`. Chat card “Review N lines” and Hub open this page.
**Non-goals:** A new `ingest_stages` column or table; applying recurring field overrides silently; putting profile rules in the audit prompt.

## Schema

Nested `IngestReviewPackage.parse_review` on existing `ingest_stages.review_package` jsonb (0050). Same overlay as `line_audit` / `ava_chat`. **No 0068.** Per-row decisions, confirmations, who, when, and recurring-override *proposals* live here so reload and hand-over work.

Why not a new table: the stage already *is* the overlay until apply (C-76). A `parse_review` column would be AUTHOR-ONLY ceremony with no query pattern that jsonb cannot serve.

## Route

`/mediaplans/mba/[mba]/ingest/[stageId]` — staff (not client), same gate as Trafficking. State is the stage, never URL params. Load writes a pending form payload and returns the planner to create/edit; the form door stays `ingestReviewToFormLineItems`.

## Audit (already on the stage)

Server-side in `stageIngestReviewFromBuffer` after the deterministic proposal. Strongest available model (`claude-opus-4-6`), temperature omitted (Opus 4.6 rejects `temperature ≠ 1`), adaptive thinking, structured output. Input per section: A1 text grid (header band repeated) + compact proposal rows. **Never profile rules.** Re-runnable via the page.

### Token / time (measured grid, estimated tokens)

| File | Buy rows | Non-empty cells | Grid chars | Input tokens (chars/4) | Sections |
|---|---|---|---|---|---|
| JCD Strength Meals | 95 | 7,450 | 94,105 | **~23.5k** one-pass; **~30–40k** with header-band + proposal | 7 |
| QMS Paid (smaller grid) | 41 | 1,580 | 24,027 | **~6k** | 1 |

JCD is the largest fixture by cells. Output ~95 × 200 tok ≈ **19k**. Adaptive thinking ~4–10k/chunk × 7 ≈ **28–70k**. Wall **~45–90s** at concurrency 3 (`maxDuration` 300). Rough Opus 4.6: **~$2–8 / JCD attach** if thinking is heavy. Live billed tokens were not run in CI.

## Reconcile + invariants

Per source row: identity / money / dates / format / **buy type** (parser stamp vs audit status-runs: all-bonus vs any-paid). Agree or disagree with both readings. Invariants: money only on paid runs; bonus $0 with own flight; bursts inside runs; one section per line; format from that section; **line inside campaign window or flagged** (when campaign dates are known; never invent dates). Unresolved controlled values → value card on the row; answer is publisher-scoped `learnSynonym`; siblings with the same raw resolve together.

## Load gate

`load_ingest_into_form` and Hub Accept refuse unless every proposed row is **confirmed or excluded**. Bulk “Confirm all green” covers rows with no disagreement, no breach, and no unresolved value. Excluded leftover rows stay listed with counts (`rows_unparsed_labels`).

## Learning

Every decision → stage `parse_review`. Value resolutions → `publisher_value_synonyms`. Rule-changing remaps from this page are **proposed** (same header on 3 files) onto `parse_review.override_proposals` — never applied silently. Applying a proposal writes `publisher_profiles` + `publisher_profile_changes` through `remapIngestColumn`.

## Page stats

Numbers come only from `summariseIngestReview` + staged `parse_review` / `line_audit`. Never re-summed in the prompt or the page. Chat `full_review_path` and the confirmed-block footer are this page.

## Below 90%

Live token counts / wall seconds are estimates. Recurring-override “3 files” uses an in-process + stage tally keyed by publisher+header+canonical — not historical `ingest_runs`. Campaign-window flag is skipped when create/Hub has no campaign dates. Hub Accept stays gated the same as load so Hub is not a back door. Re-run audit reads the staged `source_file` (409 only when null — pre-IG-14).
