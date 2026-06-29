# Finance Review Decisions Log

## Build 2 — Per-line billing provenance

Outcome: complete.

- Added `billingMode?: "auto" | "manual"` inside the existing `billingSchedule` JSON line-item payload. No Xano column changes were made.
- Confirmed the persistence path remains opaque: the edit page still sends `billingSchedule: billingScheduleJSON`, and the API routes continue storing/forwarding that blob without line-item endpoint changes.
- Accepted the sibling-stamp rule: when a line is marked manual, legacy sibling lines with `billingMode === undefined` are materialized as `auto` so only the manual row freezes.
- Manual rows are protected from auto resync, zero-to-real backfill, and line-fee seeding. Explicit `auto` rows keep following auto even when plan-level manual billing is true.
- Row reset and full reset stamp affected lines back to explicit `auto`.

Next: Build 3 should start with the derived finance reporting adapter and subtotal splits. `buyType` normalization remains the main known gap from Discovery 5.

Open backend contract item: finance-to-Xano/Xero AR/AP row handling remains a decisions-doc item until the backend exposes Xero AR/AP rows.
