# IG-11 — Independent line audit + load parity gate

**Status:** Implemented  
**Surface:** AVA chat attach + Hub `POST /api/admin/ingest/review`  
**Non-goals:** Chat-turn model call; profile rules in the audit prompt; auto-accepting the audit over the parser; a new `ingest_stages` column (nested jsonb on `review_package`)

## Pipeline

`detectShape` → `proposeLineItemsFromSheet` → `buildIngestReviewFromBuffer` → **`runLineAudit` (this)** → `putIngestStage` → `get_pending_ingest_review` (parity report) → `load_ingest_into_form` (refuses while discrepancies unresolved).

The audit is **not** an agent tool. It runs once while staging, then the stage jsonb is free to re-read.

## Where / persist

Server-side in `stageIngestReviewFromBuffer`, after the deterministic proposal, before the review is returned. Nested `IngestReviewPackage.line_audit` on existing `ingest_stages.review_package` jsonb (same overlay as `ava_chat`). No 0067.

## Model

`INGEST_AUDIT_MODEL` default `claude-opus-4-6`. Forced `tool_use` structured output (same pattern as column mapping). Adaptive thinking. **Temperature omitted** — Opus 4.6 rejects `temperature ≠ 1`. Kill switch `INGEST_AUDIT=off`. Tests inject a client; production `POST /api/admin/ingest/review` passes the live client. Incomplete audit fails loud (500), never a silent skip of buy rows.

Input per chunk: detected header band (`header_row-3…header_row`; JCD = 16–19) + section grouping rows + buy-row cells as `A1<TAB>value`, plus compact proposal rows for those `source_row_ref`s. **Never** `column_map` / `money_rules` / legend / publisher_profiles.

Chunking: `grouping_rows` as section headers; consecutive grouping rows without data collapse. JCD = 7 sections (2–33 buy rows). Concurrency 3.

Output per source row: `{ row, identity {panel, name, market, section}, status_runs [{status, from_col, to_col}], money {cell, amount, basis_guess}, dates_implied [{from, to}], format_header, notes[] }`.

## Reconcile

Join on Excel row / `…!r62`. Parser vs audit on identity, money (`roundCents`), dates, format. Agree → green. Disagree → discrepancy card with both readings and cells. Invariants (parser-side, independent of agreement): money only on paid runs; bonus $0 with its own flight; bursts inside status runs; one section per line; format from that section.

## Parity + gate

`formatIngestConfirmedBlock` becomes the parity report: totals (line sum, stated cell, per-section subtotals, rate-card + discount), lines (count, paid/bonus, green/discrepancy), empty fields, discrepancy list. Cards `ingest:discrepancy:<row>` — Parser / Audit / Other (typed). Resolutions recorded on `line_audit.resolutions`. `load_ingest_into_form` and Hub `executeIngestAccept` refuse while any discrepancy is unresolved.

## Cost / time (measured grid, estimated tokens)

| File | Buy rows | Non-empty cells | Grid chars | Input tokens (chars/4) | Sections |
|---|---|---|---|---|---|
| JCD Strength Meals | 95 | 7,450 | 94,105 | **~23.5k** one-pass; **~30–40k** with header-band repeat + proposal | 7 |
| QMS Paid (smaller grid) | 41 | 1,580 | 24,027 | **~6k** | 1 |

JCD is the largest fixture by cells. Output ~95 × 200 tok ≈ **19k**. Adaptive thinking ~4–10k/chunk × 7 ≈ **28–70k**. Wall ~45–90s at concurrency 3 (review route `maxDuration` 300). Rough Opus 4.6 list: **~$2–8 / JCD attach** if thinking is heavy. Accuracy over cost.

## Below 90%

Live token counts and wall seconds are estimates (not a billed Anthropic run). Hub Accept is gated as well as load so Hub is not a back door (prompt named the load tool only).
