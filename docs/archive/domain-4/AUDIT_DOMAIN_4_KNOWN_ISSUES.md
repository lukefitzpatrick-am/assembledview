# Domain 4 — Known Issues / Deferred Work

## D4-K1: media_plan_production schema lacks mp_plannumber
- Surfaced: Stage 1 / Stage 2c
- Symptom: production line items render across all versions of a
  campaign regardless of which version the user is viewing
- Cause: media_plan_production table has no version FK or display
  column; Xano endpoint filters MBA-only
- Impact: low — production data is internal-organisation-only per
  product memory; no user-facing bug observed
- Fix path: Xano schema change (add mp_plannumber + backfill) +
  Xano endpoint update to filter on it. Out of scope for Domain 4.

## D4-K2: fetchAllXanoPages near-redundant on prog-display / prog-video
- Surfaced: Stage 2c
- Symptom: paginator runs against a Xano response that now fits in
  a single page after Stage-1 filtering
- Impact: ~negligible — pagination short-circuits after page 2 with
  "Pagination appears unsupported" log
- Fix path: structural refactor of these two route handlers to drop
  the paginator. Candidate for Stage 2d or post-Domain-4 cleanup.

## D4-K3: H1 hotfix (digi-bvod GET handler) not yet browser-verified
- Surfaced: Stage 1
- Status: API smoke via curl returned 200 + `[]` for BOSS002 v10 (no
  BVOD line items on that campaign). Handler does not 405.
- Fix path: explicit browser test on a BVOD-enabled campaign when available.

## D4-K4: Catch-all-routed types lack tagged debug logging
- Surfaced: Stage 2c integration smoke design
- Symptom: catch-all proxy doesn't emit [RADIO], [MAGAZINES], etc.
  logs, so we can't confirm via terminal whether those types are
  Xano-filtered post-Domain-4
- Workaround: inspect Network panel response sizes
- Fix path: optional — add tagged logging to catch-all proxy, or
  give each catch-all type its own dedicated route. Not required
  for Domain 4 success.

## D4-K5: Stage-1 Xano filtering not yet applied on all line-item tables
- Surfaced: Stage 2c integration smoke (2026-05-21)
- Symptom: `version_number` is forwarded from Next.js routes but
  raw Xano counts remain MBA-wide for some tables (e.g. newspaper
  174 raw / 3 kept; prog-display 227 raw / 2 kept) while search
  returns raw == kept (1/1).
- Cause: Stage-1 endpoint updates validated on `media_plan_search`
  (#207); other tables in `domain-4/stage-1/completion-checklist.md`
  remain unchecked.
- Impact: wire payload reduction deferred until per-table Xano deploy
- Fix path: complete Stage-1 Xano rollout per table; re-run Section 4
  integration smoke.
