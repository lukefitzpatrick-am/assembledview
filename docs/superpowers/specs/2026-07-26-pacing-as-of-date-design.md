# Pacing toolbar: honest “As of” date (B)

**Date:** 2026-07-26  
**Status:** Approved — implement  
**Depends on:** P0-1b (in-memory pacing filters)

## Problem

The pacing filter toolbar showed a date **range** (`date_from` / `date_to`, URL `?from=&to=`), but channel/overview fetches used only the API default `asOfDate` (Melbourne today). The range did nothing. Spend/delivery aggregates are computed server-side against an as-of window, not a client date range.

## Decision

**Option (B):** Replace the range control with a single **As of** date mapped to the existing `asOfDate` query param. Real from/to windows (A) later; do not leave a dead control (C).

## Guardrails (confirmed)

1. **Consumers of `date_from`/`date_to`:** only `pacingFilters.ts`, `usePacingFilterStore.tsx`, `PacingFilterToolbar.tsx`, plus a comment in `applyPacingRowFilters.ts`. No AVA, export, or saved-filter dependency.
2. **`SingleDatePicker`** exists at `components/ui/single-date-picker.tsx`.
3. **`getAsOfDate()`** is client-safe (pure `Intl` Melbourne calendar day; no `server-only`).
4. Stale `?from`/`?to` ignored; missing `?asOf` → Melbourne today.
5. **`PacingRowFilterInput` unchanged** — dates stay server-side only.

## Design

### Filter model

- Replace `date_from` / `date_to` with `as_of_date: string` (YYYY-MM-DD).
- Default / Reset = `getAsOfDate()`.

### Toolbar + URL

- `DateRangePicker` → `SingleDatePicker`, label **As of**.
- URL: `asOf=YYYY-MM-dd`. Drop writing `from`/`to`. Ignore legacy `from`/`to` on read.

### Fetches

Append `asOfDate=${as_of_date}` and depend on it in:

- `/api/pacing/campaigns`, `social-campaigns`, `programmatic-campaigns`, `ad-serving-campaigns`, `direct-campaigns`
- `/api/pacing/overview` (same pass — shared toolbar)

### Out of scope

Snowflake from/to window semantics; in-memory date filtering.

## Verify

Changing As of triggers a refetch with the new `asOfDate` and updates numbers/labels; no range UI remains.
