# Creative Phase 3 — Design (13 Jul 2026)

Fixes from Luke’s testing: video preview blank in social frames, Ad details + AVA side-by-side, AVA no-brief research mode.

## 9.1 Video blank in social mock frames

**Problem:** Download route sends `Content-Disposition: attachment` without `Content-Length` / Range. Chrome’s `<video>` progressive path fails for non-faststart MP4s.

**Fix:**
1. Download route: for `image/*` / `video/*` (or `?inline=1`), send `inline` disposition + `Content-Length` when blob size is known.
2. Client: `useMediaObjectUrl` — fetch blob, `URL.createObjectURL`, skeleton while loading, revoke on unmount. Videos in `RawMedia` use it; images keep the direct URL.

No Range support in this phase.

## 9.2 Ad details ∥ AVA layout

**xl+:** three columns — mock (`flex-1`, min ~480px) · Ad details (~300px, always visible, no accordion) · AVA workshop (~380px).

**&lt; xl:** existing two-column — mock | accordion + chat stacked.

## 9.3 AVA no-brief — two-call research

Primary chip “No brief — research & write”; empty send on first turn triggers the same.

**Call 1 (research):** only `web_search_20250305`, `tool_choice: auto`, `max_uses: 3`, ~20s budget. Compact research brief (~500–600 tokens). On error/timeout → skip to call 2 with AV context only; reply notes research was thin. Extract text summary only (no raw citation blocks into call 2).

**Call 2 (emit):** today’s forced `emit_copy_chat` with image + AV context + research brief.

**Persistence:** fold research into assistant `reply` (and/or return `researchBrief`) so follow-up turns carry knowledge in `messages` without re-attaching search.

AV context (server-assembled): campaign/client, linked line item (platform, buying_demo, creative_targeting, creative, market, flights), sibling asset names for MBA, destination URL.
