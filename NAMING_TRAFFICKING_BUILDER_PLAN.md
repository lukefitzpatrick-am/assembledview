# Naming & Trafficking Builder — plan (repo copy, 2026-07-11)
Combines the app naming generator with the manual master-file workflow. Decisions D1–D3
resolved. The template LAW is code: `lib/naming/templates.ts` (N1, commit 88bd65f) — that
file, not this doc, is authoritative for element orders.

## Idea
Media plan auto-fills the base; buyers personalise per platform (duplicate rows, creative
sizes, targeting/custom tokens); every name composed by the strict templates in lib/naming.
No persistence back into AV (D3): the builder is a starting guide for downloads; the
terminal line_item_id token is the durable Snowflake pacing link; future pushes recompose
from plan + templates at push time.

## Global rules (engine-enforced, already tested in N1)
- DV360 templates cover ALL programmatic channels; CM360 covers other digital channels.
- line_item_id is ALWAYS the last element at each platform's pacing-grain level.
- Element values use `_` internally; `-` is the separator; slug charset [a-z0-9_+x].

## Build sequence
- N0 template law — DONE (lib/naming/templates.ts)
- N1 rule engine — DONE (88bd65f): compose/parse/validate + 13 tests
- **N2 builder UI** — trafficking page: base generation from the MBA, per-platform grids,
  duplicate row, size multi-select expansion, targeting/custom tokens, live preview,
  best-practice rail (reads existing media_container_best_practice content)
- N3 outputs — copy per cell/level + Excel export shaped like the old master workbook
- N4 asset linking — creative_assets sizes/names offered in the builder
- N5 (later) push handshake — recompose + round-trip validate before any platform API call

## Surface
`/mediaplans/mba/[mba_number]/trafficking` — sibling of /creative, linked from the same
header actions. Staff-only (same guard pattern as the creative page).

## Base generation source
The MBA GET (`/api/mediaplans/mba/{mba}`) — same discovery shape the creative page uses:
client/brand/campaign/mba/dates from the master; per-channel line items with publisher,
media type, buy type, line_item_id. `lib/namingConventions.ts` remains untouched until a
later reconciliation build.

## Open template defaults (greppable `DEFAULT(Qn)` in lib/naming/templates.ts)
Q1 CM360 campaign case · Q4 DV360 ad token · Q5 YouTube custom slots · Q6 Meta ad elements
· Q10 month token format. All adjustable one-line; none block N2–N4.
