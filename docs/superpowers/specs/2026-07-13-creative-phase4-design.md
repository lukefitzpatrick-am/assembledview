# Creative Phase 4 — Design (13 Jul 2026)

Approved design for blob-read failures, failure surfacing, and floating social panels.

## 11.1 Root cause — Vercel Blob private reads → 403

**Evidence (13 Jul):** Asset 6 host matches the local store; list REST with bearer returned **200**. Standalone repro then showed:

| Path | Result |
|------|--------|
| REST `GET` blob URL + `BLOB_READ_WRITE_TOKEN` | **200** (21.8 MB) |
| SDK `get(url, { access: "private", token })` | **200** |
| SDK `get(url, { access: "private" })` (env default) | **403** |

**Actual cause:** `@vercel/blob` `resolveBlobAuth` prefers OIDC when `@vercel/oidc` returns a token **and** `BLOB_STORE_ID` is set — even if `BLOB_READ_WRITE_TOKEN` is present. Local OIDC tokens (Vercel CLI / linked project) often cannot read private blobs → 403. An explicitly passed `token` always wins per SDK docs.

`@vercel/blob@2.6.1` is already latest 2.x — a package bump alone does not fix this.

### A — Fix

1. Shared `getPrivateBlob()` helper passes `BLOB_READ_WRITE_TOKEN` when set; falls back to SDK default (OIDC) only when no RW token.
2. All private `get()` call sites (creative download/frame/preview/ad-copy, MI + report exports) use the helper.
3. Keep `scripts/repro-blob-private-get.ts` for regression checks.

### B — Surface failures (no silent empty UI)

**B1 — `useMediaObjectUrl` / `RawMedia`:** on error show broken-media glyph + **Retry** that re-triggers the fetch (increment a retry counter / clear failed state so the effect runs again — not a no-op re-render).

**B2 — `CopyChatPanel`:** if frame capture or ad-copy POST fails, keep the user turn and append an assistant error bubble with muted/critical styling (distinct from normal AVA copy), e.g. “Couldn't read the creative — media downloads are failing (see console)”. Do not toast-and-roll-back into “no activity”.

## 11.2 Floating panels

At **xl+**, Ad details + AVA become floating cards on the same canvas as the phone mock — not full-height right-docked columns.

- Row: `items-start justify-center gap-6` (mock · Ad details ~300px · AVA ~380px), scroll together on the dialog canvas.
- Cards: `rounded-card shadow-e1 border border-border bg-card`, height `fit-content`.
- AVA: `max-h-[80vh]`, thread scrolls inside, input pinned at card bottom; keep workshop header + chips.
- Ad details: subtle own header.
- Below xl: stacked as today.

## 11.3 Acceptance

- Curatif MP4 plays in FB frame; PNGs render; TV tab extracts frames.
- AVA no-brief on video: frame captures → research opener + 12 options; failures show the critical error bubble.
- Social xl: three floating cards, independent heights, AVA thread scrolls inside its card.

## Deploy checklist (unchanged from §10)

After commits: set Vercel env (`SCREENSHOT_ACCESS` / ScreenshotOne keys, `SCREENSHOT_SECRET`, `CREATIVE_FRAME_SIGNING_SECRET`, `APP_BASE_URL` if needed), then deployed-URL run-through — live inject with visible creative, TV composites, no-brief research, MI prefill workbook.
