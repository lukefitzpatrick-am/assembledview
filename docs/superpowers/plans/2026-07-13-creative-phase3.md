# Creative Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix social video preview, put Ad details beside AVA on wide screens, and add AVA no-brief research→emit copy mode.

**Architecture:** (1) Download route serves media inline + client blob URLs for video. (2) MockupDialog grows a third column at `xl`. (3) Ad-copy route runs a dedicated research Messages call then today’s forced emit call; research text is folded into the reply so follow-ups stay tool-free.

**Tech Stack:** Next.js route handlers, `@anthropic-ai/sdk` web_search_20250305, existing AVA Anthropic client, design-system tokens.

---

## File map

| Path | Role |
|------|------|
| `app/api/creative-assets/[id]/download/route.ts` | Inline disposition + Content-Length for image/video |
| `components/creative/mockups/social/useMediaObjectUrl.ts` | **Create** — fetch→blob URL hook |
| `components/creative/mockups/social/shared.tsx` | RawMedia uses hook for video |
| `components/creative/mockups/MockupDialog.tsx` | Three-column xl layout |
| `components/creative/mockups/copychat/CopyChatPanel.tsx` | Export form; accordion only when stacked; no-brief chip |
| `lib/creative/adCopy/avContext.ts` | **Create** — assemble AV context for no-brief |
| `lib/creative/adCopy/researchClient.ts` | **Create** — call 1 research with timeout |
| `lib/creative/adCopy/prompt.ts` | no_brief / research prompt bits |
| `app/api/creative-assets/ad-copy/route.ts` | mode no_brief, two-call flow |
| `lib/creative/adCopy/__tests__/avContext.test.ts` | Unit tests for context shaping |

---

### Task 1: Download route inline media

**Files:**
- Modify: `app/api/creative-assets/[id]/download/route.ts`

- [x] For `image/*` / `video/*` or `?inline=1`, set `Content-Disposition: inline` and `Content-Length` from `blobResult.blob.size` when available; else keep `attachment` for other types / downloads.

### Task 2: useMediaObjectUrl + RawMedia

**Files:**
- Create: `components/creative/mockups/social/useMediaObjectUrl.ts`
- Modify: `components/creative/mockups/social/shared.tsx`

- [x] Hook: fetch `mediaSrc(asset)` with credentials, createObjectURL, loading/error, revoke on unmount / asset change.
- [x] RawMedia videos: skeleton while loading, then `<video src={objectUrl}>`. Images unchanged.

### Task 3: Side-by-side layout

**Files:**
- Modify: `components/creative/mockups/MockupDialog.tsx`
- Modify: `components/creative/mockups/copychat/CopyChatPanel.tsx`

- [x] Export `SocialAdDetailsForm` (or keep internal + accept `layout: "stacked" | "workshop-only"`).
- [x] xl+: mock | details (~300px) | workshop (~380px). Below xl: current accordion + chat stack.
- [x] Workshop column: no accordion when details rendered beside it.

### Task 4: AV context helper

**Files:**
- Create: `lib/creative/adCopy/avContext.ts`
- Create: `lib/creative/adCopy/__tests__/avContext.test.ts`

- [x] Fetch campaign summary + line items (reuse `getAvaXanoSummary` / `fetchAllMediaContainerLineItems`), match asset `line_item_id`, pull platform/buying_demo/creative_targeting/creative/market/dates.
- [x] `listByMba` for sibling names; include destination URL from request body.

### Task 5: Research call + no_brief route

**Files:**
- Create: `lib/creative/adCopy/researchClient.ts`
- Modify: `lib/creative/adCopy/prompt.ts`
- Modify: `app/api/creative-assets/ad-copy/route.ts`
- Modify: `CopyChatPanel.tsx`

- [x] Call 1: web_search only, auto tool_choice, max_uses 3, ~20s AbortSignal; extract text brief.
- [x] Call 2: forced emit with image + AV context + brief; on research failure note thin research in system/user text.
- [x] Body: `mode: "no_brief"`, allow empty first-turn text via sentinel message; return research folded into `reply`.
- [x] UI chip + empty-first-turn send; disable empty send after first turn.

### Task 6: Smoke-check

- [x] Typecheck / targeted tests for avContext.
- [ ] Manual: MP4 in social frame plays; xl layout; no-brief yields research opener + 12 options.
