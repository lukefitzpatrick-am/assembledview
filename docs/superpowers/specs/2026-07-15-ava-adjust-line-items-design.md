# AVA adjust_line_items — design

**Date:** 2026-07-15  
**Status:** Approved (Approach A)

## Goal

Let AVA bulk-align descriptor fields on already-loaded radio/OOH plan lines from plain English, with confirm-before-apply and no invented numbers.

## Architecture

1. Bridge `getLineItems({ channel })` reads page state (`radioMediaLineItems` / `oohMediaLineItems`) on create + edit.
2. ChatWidget, on each chat send, posts `currentLineItems: { radio?, ooh? }` (same client→server pattern as `pendingParsedPlan`).
3. Tool `adjust_line_items` applies structured ops to a copy server-side; on `confirm: true` sets `capturedLineItemsLoad` → existing `setLineItems` path.

## Ops & scope

- Ops: `setField` | `clearField` | `copyField` | `moveField`
- Scope: `"all"` | `{ where }` | `{ isBonus: true }` | `{ rowIndexes }`
- Allowed: descriptor/text + boolean flags only. Money/dates/quantities/bursts rejected.

## Confirm

- `confirm !== true` → diff summary only, no apply.
- `confirm === true` → `setLineItems({ channel, items, replace: true })` via side-channel.
