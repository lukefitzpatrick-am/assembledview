# Creative Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix private blob reads (SDK 403), surface media/AVA failures with retry + distinct error UI, and float Ad details / AVA as cards at xl+.

**Architecture:** (1) Diagnostic script compares REST bearer fetch vs `@vercel/blob` `get()` using the same `.env.local` token load as other scripts; upgrade package if SDK-only failure. (2) Client hook gains a retry key; RawMedia shows error+retry; CopyChatPanel keeps failed turns with critical-styled bubbles. (3) MockupDialog xl layout becomes a single centered floating row instead of docked asides.

**Tech Stack:** `@vercel/blob`, Next.js route handlers, existing design tokens (`rounded-card`, `shadow-e1`, `bg-card`, status/critical tones).

**Spec:** `docs/superpowers/specs/2026-07-13-creative-phase4-design.md`

---

## File map

| Path | Role |
|------|------|
| `scripts/repro-blob-private-get.ts` | **Create** — env load + REST vs SDK get |
| `package.json` / `package-lock.json` | Bump `@vercel/blob` if SDK path fails |
| `components/creative/mockups/social/useMediaObjectUrl.ts` | Retry counter API |
| `components/creative/mockups/social/shared.tsx` | Error glyph + retry wiring |
| `components/creative/mockups/copychat/CopyChatPanel.tsx` | Critical error bubble on capture/POST fail |
| `components/creative/mockups/MockupDialog.tsx` | Floating cards at xl+ |

---

### Task 1: Standalone repro (REST vs SDK)

**Files:**
- Create: `scripts/repro-blob-private-get.ts`

- [ ] Load `.env.local` via the same `loadEnvLocal` pattern as `scripts/verify-kpi-scale.ts`.
- [ ] Resolve asset id (default 6) via Xano `getById` or accept `BLOB_URL` override.
- [ ] Print token presence (boolean only — never the secret), URL host, REST status for direct blob GET with bearer, SDK `get(url, { access: "private" })` status/error.
- [ ] Run: `npx tsx scripts/repro-blob-private-get.ts`
- [ ] If REST 200 + SDK 403 → proceed to Task 2 upgrade. If both fail → stop and re-check token/store.

### Task 2: Prefer explicit RW token (own commit)

**Note:** `@vercel/blob@2.6.1` is already latest — do not bump. Root cause is auth precedence (OIDC + `BLOB_STORE_ID` over RW token).

- [ ] Create `lib/creative/getPrivateBlob.ts` — pass `BLOB_READ_WRITE_TOKEN` when set.
- [ ] Repoint creative + MI + report private `get()` call sites to the helper.
- [ ] Re-run repro; confirm `getPrivateBlob()` 200.
- [ ] Commit: `fix(blob): prefer BLOB_READ_WRITE_TOKEN over stale local OIDC`

### Task 3: Media error + retry

**Files:**
- Modify: `useMediaObjectUrl.ts`, `shared.tsx`

- [ ] Hook returns `{ url, loading, error, retry }` where `retry()` bumps a counter in deps so fetch re-runs.
- [ ] `RawMedia`: when `error` and not loading, show broken-media (lucide `ImageOff` or similar) + Retry button; stop infinite skeleton on failed load.
- [ ] Story shared-video path surfaces the same error/retry.

### Task 4: AVA critical error bubble

**Files:**
- Modify: `CopyChatPanel.tsx`

- [ ] Extend `ChatMessage` with optional `tone?: "error"` (or `kind: "error"`).
- [ ] On frame-capture throw or non-OK / network failure: keep user message; append assistant bubble with critical/muted styling and the media-download failure copy; `console.error` the underlying cause.
- [ ] Do not remove the user turn on these failures.

### Task 5: Floating panels

**Files:**
- Modify: `MockupDialog.tsx` (and CopyChatPanel layout classes if needed for pinned input)

- [ ] xl+ social: one scrollable canvas with `flex items-start justify-center gap-6`; mock + Ad details card (~300px) + AVA card (~380px, `max-h-[80vh]`).
- [ ] Cards use `rounded-card shadow-e1 border border-border bg-card`; heights fit-content (not stretched to dialog).
- [ ] Below xl: keep stacked accordion + chat behaviour.

### Task 6: Verify + commit Phase 4 UI

- [ ] Manual: open Curatif video in FB frame; confirm play / PNG / TV frame extract after blob fix.
- [ ] Commit remaining UI/error work separately from the deps bump if both landed: `feat(creative): Phase 4 floating panels and media failure surfacing`.
