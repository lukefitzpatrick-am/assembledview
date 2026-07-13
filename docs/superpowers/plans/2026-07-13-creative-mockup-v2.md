# Creative Mockup v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three Creative mockup dialog features — AVA inline ad copy, lounge-room TV scene composites, and a ScreenshotOne-backed live-page screenshot pipeline — replacing the broken fetch-and-iframe live mockup.

**Architecture:** Feature C is a staff-gated Anthropic route + SocialAdForm UI. Feature B is entirely client-side (frame extract → homography warp → canvas PNG). Feature A adds a signed public frame URL, a swappable screenshot provider adapter, slot-injection JS, and a LivePageMockup rewrite with manual canvas placement. Build order is C → B → A; Feature A has a day-0 ScreenshotOne/Akamai gate.

**Tech Stack:** Next.js App Router API routes, `@anthropic-ai/sdk`, ScreenshotOne HTTP API, Canvas 2D, `@vercel/blob`, existing `requireRole` + in-memory rate limiters, `file-saver`, lucide `Sparkles`, design-system tokens only.

---

## Blockers / gates (verify before the matching phase)

| Gate | Status at plan time | Action |
|------|---------------------|--------|
| `ANTHROPIC_API_KEY` | Present in `.env.local` | Feature C unblocked |
| `public/mockups/tv-lounge-*.jpg` | **Missing** | Luke must drop photos before Feature B UI can be visually verified |
| `SCREENSHOTONE_ACCESS_KEY` | **Not set** | Day-0 curl gate before any Feature A app code |
| `CREATIVE_FRAME_SIGNING_SECRET` | **Not set** | Generate before Feature A routes |
| `maxDuration = 60` | Already used widely in repo | Confirmed OK for live-mockup route |

---

## File map

### Feature C — AVA ad copy
| Path | Role |
|------|------|
| `app/api/creative-assets/ad-copy/route.ts` | **Create** — staff-gated Anthropic structured copy |
| `lib/creative/adCopy/rateLimit.ts` | **Create** — 10/min/session |
| `lib/creative/adCopy/prompt.ts` | **Create** — system prompt + platform limits trim |
| `components/creative/mockups/MockupDialog.tsx` | **Modify** — Generate with AVA + variant chips |
| `components/creative/CreativeAssetTable.tsx` | **Modify** — pass `campaignName` / `clientName` |
| `components/creative/CreativeAssetManager.tsx` | **Modify** — pass `campaignName` into table |

### Feature B — TV scene
| Path | Role |
|------|------|
| `public/mockups/tv-lounge-modern.jpg` | **Add** (Luke) |
| `public/mockups/tv-lounge-4k.jpg` | **Add** (Luke) |
| `components/creative/mockups/scenes/sceneTemplates.ts` | **Create** |
| `components/creative/mockups/scenes/useVideoFrames.ts` | **Create** |
| `components/creative/mockups/scenes/TvSceneMockup.tsx` | **Create** |
| `lib/creative/homography.ts` | **Create** — DLT + mesh warp helpers |
| `lib/creative/__tests__/homography.test.ts` | **Create** |
| `components/creative/mockups/mockTemplates.ts` | **Modify** — `kind: "scene"`, `tv-lounge` |
| `components/creative/mockups/MockupDialog.tsx` | **Modify** — wire scene tab |

### Feature A — Live screenshot pipeline
| Path | Role |
|------|------|
| `lib/creative/adSizes.ts` | **Create** — move `IAB_SIZES` + nearest-size helpers out of `rewritePage.ts` |
| `lib/creative/liveMockup/provider.ts` | **Create** — adapter interface + `getLiveMockupProvider` |
| `lib/creative/liveMockup/screenshotone.ts` | **Create** |
| `lib/creative/liveMockup/injectScript.ts` | **Create** |
| `lib/creative/liveMockup/frameSign.ts` | **Create** — HMAC mint/verify |
| `lib/creative/liveMockup/rateLimit.ts` | **Create** — 5/min/session |
| `lib/creative/liveMockup/validateTargetUrl.ts` | **Create** — reuse fetchSafe URL/IP rules without fetching |
| `app/api/creative-assets/live-mockup/route.ts` | **Create** |
| `app/api/creative-assets/[id]/frame/route.ts` | **Create** — signed public frame |
| `components/creative/mockups/LivePageMockup.tsx` | **Rewrite** |
| `env.local.example` | **Modify** — new env keys |
| Delete after cutover: `app/api/creative-assets/mock-page/route.ts`, `lib/creative/mockPage/*` (keep URL validation logic via extract), related tests updated |

---

## Phase 0 — Day-0 ScreenshotOne gate (before Feature A only)

### Task 0: Prove ScreenshotOne can render news.com.au

**Files:** none (manual curl; record result in PR notes)

- [ ] **Step 1: Luke adds keys to `.env.local`**

```
SCREENSHOTONE_ACCESS_KEY=...
SCREENSHOTONE_SECRET=...   # optional
CREATIVE_FRAME_SIGNING_SECRET=<long random>
```

- [ ] **Step 2: Curl a trivial scripts inject against news.com.au**

```bash
# PowerShell — substitute key; scripts just paints a red box
$key = $env:SCREENSHOTONE_ACCESS_KEY
$scripts = [uri]::EscapeDataString("document.body.insertAdjacentHTML('afterbegin','<div style=\"position:fixed;top:0;left:0;width:200px;height:50px;background:red;z-index:99999\">AV</div>')")
curl.exe -L "https://api.screenshotone.com/take?access_key=$key&url=https://www.news.com.au/&full_page=true&format=jpg&viewport_width=1440&ip_country_code=au&block_cookie_banners=true&block_ads=false&delay=3&scripts=$scripts" -o news-gate.jpg
```

- [ ] **Step 3: Decide**
  - Image returns with page content → proceed with ScreenshotOne adapter.
  - Bot wall / empty / error → **stop Feature A adapter work**, implement Scrapfly adapter against the same `LiveMockupProvider` interface before any UI beyond provider-not-configured.

**Do not start Tasks 10–16 until this gate passes or Scrapfly is chosen.**

---

## Phase 1 — Feature C: AVA ad copy (build first)

### Task 1: Ad-copy rate limiter

**Files:**
- Create: `lib/creative/adCopy/rateLimit.ts`

- [ ] **Step 1: Implement 10/min limiter** (clone mock-page pattern)

```ts
import "server-only"

const WINDOW_MS = 60_000
const MAX_HITS = 10

type Bucket = { timestamps: number[] }
const buckets = new Map<string, Bucket>()

export function checkAdCopyRateLimit(sessionKey: string): {
  ok: boolean
  remaining: number
} {
  const now = Date.now()
  let bucket = buckets.get(sessionKey)
  if (!bucket) {
    bucket = { timestamps: [] }
    buckets.set(sessionKey, bucket)
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS)
  if (bucket.timestamps.length >= MAX_HITS) {
    return { ok: false, remaining: 0 }
  }
  bucket.timestamps.push(now)
  return { ok: true, remaining: MAX_HITS - bucket.timestamps.length }
}
```

- [ ] **Step 2: Commit** `feat(creative): add ad-copy rate limiter`

---

### Task 2: Prompt + platform limit trim helpers

**Files:**
- Create: `lib/creative/adCopy/prompt.ts`
- Create: `lib/creative/adCopy/__tests__/prompt.test.ts`

- [ ] **Step 1: Write failing tests for trim helpers**

```ts
import { describe, expect, it } from "vitest"
import { PLATFORM_LIMITS, trimVariantToLimits } from "../prompt"

describe("trimVariantToLimits", () => {
  it("trims facebook-feed fields to hard limits", () => {
    const out = trimVariantToLimits("facebook-feed", {
      angle: "benefit",
      primaryText: "x".repeat(200),
      headline: "y".repeat(40),
      description: "z".repeat(40),
      cta: "Learn More",
    })
    expect(out.primaryText.length).toBe(PLATFORM_LIMITS["facebook-feed"].primaryText)
    expect(out.headline.length).toBe(PLATFORM_LIMITS["facebook-feed"].headline)
    expect(out.description.length).toBe(PLATFORM_LIMITS["facebook-feed"].description)
  })

  it("clears description for tiktok", () => {
    const out = trimVariantToLimits("tiktok", {
      angle: "hook",
      primaryText: "Hi",
      headline: "H",
      description: "should go",
      cta: "Learn More",
    })
    expect(out.description).toBe("")
  })
})
```

- [ ] **Step 2: Implement**

```ts
import type { SocialCtaLabel } from "@/components/creative/mockups/social/types"

export type AdCopyPlatform =
  | "facebook-feed"
  | "instagram-feed"
  | "instagram-story"
  | "tiktok"

export type AdCopyVariant = {
  angle: string
  primaryText: string
  headline: string
  description: string
  cta: SocialCtaLabel
}

export const PLATFORM_LIMITS: Record<
  AdCopyPlatform,
  { primaryText: number; headline: number; description: number }
> = {
  "facebook-feed": { primaryText: 125, headline: 27, description: 27 },
  "instagram-feed": { primaryText: 125, headline: 27, description: 0 },
  "instagram-story": { primaryText: 100, headline: 27, description: 0 },
  tiktok: { primaryText: 100, headline: 27, description: 0 },
}

export function buildAdCopySystemPrompt(args: {
  platform: AdCopyPlatform
  brandName: string
  clientName?: string
  campaignName?: string
}): string {
  const { platform, brandName, clientName, campaignName } = args
  return `You are AVA, Assembled Media's creative assistant. Write ad copy for a ${platform}
ad using the attached creative image as the primary source of truth — reference
what is actually shown (product, offer, colours, text overlays, mood).

Brand/page: ${brandName}. Client: ${clientName ?? "n/a"}. Campaign: ${campaignName ?? "n/a"}.

Assembled's approach: hook first — the opening line must earn the next second of
attention; write for out-of-market buyers (clear brand + category entry points,
no insider jargon); concrete and specific beats clever; one idea per variant;
Australian English.

Produce exactly 3 variants with genuinely different angles (e.g. benefit-led,
curiosity/question hook, proof/offer-led) — not three rewordings.

Platform limits (hard):
- facebook-feed:   primaryText ≤125 chars before truncation, headline ≤27, description ≤27
- instagram-feed:  primaryText ≤125, headline ≤27, description = ""
- instagram-story / tiktok: primaryText ≤100 (overlay-safe), headline ≤27, description = ""

If existing copy is provided, diverge from it — do not lightly rephrase it.`
}

export function trimVariantToLimits(
  platform: AdCopyPlatform,
  variant: AdCopyVariant,
): AdCopyVariant {
  const lim = PLATFORM_LIMITS[platform]
  return {
    angle: variant.angle.trim(),
    primaryText: variant.primaryText.slice(0, lim.primaryText),
    headline: variant.headline.slice(0, lim.headline),
    description:
      lim.description === 0 ? "" : variant.description.slice(0, lim.description),
    cta: variant.cta,
  }
}
```

- [ ] **Step 3: Run** `npx vitest run lib/creative/adCopy/__tests__/prompt.test.ts` — expect PASS

- [ ] **Step 4: Commit** `feat(creative): add AVA ad-copy prompt helpers`

---

### Task 3: `POST /api/creative-assets/ad-copy`

**Files:**
- Create: `app/api/creative-assets/ad-copy/route.ts`

- [ ] **Step 1: Implement route**

Mirror `mock-page` auth: `requireRole(request, ["admin", "manager"])`, then rate limit, zod-parse body.

Body schema:
```ts
z.object({
  assetId: z.number().int().positive(),
  platform: z.enum(["facebook-feed", "instagram-feed", "instagram-story", "tiktok"]),
  brandName: z.string().min(1).max(120),
  clientName: z.string().max(120).optional(),
  campaignName: z.string().max(200).optional(),
  videoFrameDataUrl: z.string().max(2_800_000).optional(), // ~2MB base64 data URL
  existingCopy: z
    .object({
      primaryText: z.string().optional(),
      headline: z.string().optional(),
      description: z.string().optional(),
      ctaLabel: z.string().optional(),
    })
    .optional(),
})
```

Logic:
1. `getById(assetId)` — 404 if missing.
2. Reject `application/zip` → `{ error: "unsupported_mime", message: "…" }` 400.
3. Image: `get(row.blob_url, { access: "private" })` → buffer → base64; media type from `row.mime_type`.
4. Video: require `videoFrameDataUrl` matching `^data:image/(jpeg|png|webp);base64,`; reject otherwise.
5. Call `getAnthropicClient().messages.create` with:
   - `model: AVA_MODEL`
   - `max_tokens: 1500`
   - `system: buildAdCopySystemPrompt(...)`
   - user content: image block + optional existing-copy text
   - one tool `emit_ad_copy` with `input_schema` requiring `variants` array length 3; each variant has `angle`, `primaryText`, `headline`, `description`, `cta` enum from `SOCIAL_CTA_OPTIONS`
   - `tool_choice: { type: "tool", name: "emit_ad_copy" }`
6. Parse tool_use block; map `cta` → validate against `SOCIAL_CTA_OPTIONS` (fallback `"Learn More"`); `trimVariantToLimits` each; return `{ variants }`.

- [ ] **Step 2: Smoke locally** with an image asset id (staff session cookie) via browser Network tab or curl with session — expect 3 variants.

- [ ] **Step 3: Commit** `feat(creative): add AVA ad-copy API route`

---

### Task 4: Wire Generate with AVA into SocialAdForm

**Files:**
- Modify: `components/creative/mockups/MockupDialog.tsx`
- Modify: `components/creative/CreativeAssetTable.tsx`
- Modify: `components/creative/CreativeAssetManager.tsx`

- [ ] **Step 1: Prop chain**

`CreativeAssetManager` already has `campaignName` / `clientName`. Pass:

```tsx
<CreativeAssetTable
  ...
  defaultBrandName={clientName}
  campaignName={campaignName}
  clientName={clientName}
  metaPageId={resolvedMetaPageId}
/>
```

Table → `MockupDialog` same props.

- [ ] **Step 2: Extend `SocialAdForm`**

Add props: `asset`, `platform`, `clientName?`, `campaignName?`, and use `useToast`.

At top of form, secondary `Button` with `Sparkles` icon: **"Generate with AVA"**.

On click:
1. If `asset.mime_type.startsWith("video/")`, fetch `/api/creative-assets/${id}/download` → blob URL → hidden video → seek `0.03 * duration` → canvas JPEG data URL (inline helper or shared with Feature B later — for C, a local `captureFirstFrame(asset)` is fine; Feature B will extract `useVideoFrames`).
2. If zip → toast unsupported; return.
3. `POST /api/creative-assets/ad-copy` with body; button label **"AVA is writing…"** + disabled while pending.
4. On success, store `variants` in local state; show 3 chips (`Angle 1` / tooltip = `variant.angle`). Selecting a chip calls `onChange({ ...copy, primaryText, headline, description, ctaLabel: cta, brandName: copy.brandName })`.
5. **Regenerate** re-posts with `existingCopy` from current form fields.
6. Errors → destructive toast; form stays editable.

- [ ] **Step 3: Manual accept**
  1. Image FB feed → 3 variants fill fields.
  2. TikTok → empty description, caption ≤100.
  3. Video → frame sent; copy references image.
  4. Regenerate diverges.
  5. Zip → toast.
  6. Spam → 429 toast.

- [ ] **Step 4: Commit** `feat(creative): generate social mockup copy with AVA`

---

## Phase 2 — Feature B: Lounge TV scene

### Task 5: Homography + mesh warp (TDD)

**Files:**
- Create: `lib/creative/homography.ts`
- Create: `lib/creative/__tests__/homography.test.ts`

- [ ] **Step 1: Failing test — identity + known quad**

```ts
import { describe, expect, it } from "vitest"
import { computeHomography, applyHomography } from "../homography"

describe("computeHomography", () => {
  it("maps unit square corners to themselves for identity quad", () => {
    const H = computeHomography(
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    )
    for (const p of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5],
    ] as const) {
      const [x, y] = applyHomography(H, p[0], p[1])
      expect(x).toBeCloseTo(p[0], 5)
      expect(y).toBeCloseTo(p[1], 5)
    }
  })
})
```

- [ ] **Step 2: Implement DLT 8-equation solve** (`computeHomography(srcQuad, dstQuad)` → 3×3), `applyHomography`, and `drawImagePerspective(ctx, image, dstQuadPx, opts)` that:
  - letterboxes source into a virtual rect matching `object-fit: contain` inside the destination quad’s axis-aligned bounds (or into the quad via black fill of quad then contain-rect mapped through H — prefer: fill quad black, then warp the contain-fitted bitmap into the same quad),
  - subdivides 16×16, uses `setTransform` affine per cell.

Keep API documented in file header comments.

- [ ] **Step 3: Vitest pass → commit** `feat(creative): add homography mesh warp`

---

### Task 6: Scene templates + video frame hook

**Files:**
- Create: `components/creative/mockups/scenes/sceneTemplates.ts`
- Create: `components/creative/mockups/scenes/useVideoFrames.ts`
- Add assets: `public/mockups/tv-lounge-modern.jpg`, `public/mockups/tv-lounge-4k.jpg` (**blocked until Luke provides**)

- [ ] **Step 1: `sceneTemplates.ts`** as in spec (quads from estimates; label 4K scene as soft/low-res).

- [ ] **Step 2: `useVideoFrames`**
  - `mediaSrc` = `/api/creative-assets/${asset.id}/download`
  - fetch → blob → object URL
  - seek `[0.03, 0.33, 0.66, 0.97] * duration` sequentially
  - return `{ frames, loading, error }`
  - cleanup revokeObjectURL on unmount

- [ ] **Step 3: Commit** (photos may be committed separately by Luke) `feat(creative): add TV scene templates and frame extractor`

---

### Task 7: `TvSceneMockup` + dialog wiring

**Files:**
- Create: `components/creative/mockups/scenes/TvSceneMockup.tsx`
- Modify: `mockTemplates.ts` — add `kind: "scene"` and `{ id: "tv-lounge", label: "Lounge room TV", kind: "scene" }`
- Modify: `MockupDialog.tsx`

- [ ] **Step 1: UI** — left rail scene thumbs + frame thumbs (images skip frame picker); main canvas preview; Download PNG via `file-saver`; optional “Download start & end” for video (frames 0 and 3).

- [ ] **Step 2: Dev calibration** — when `process.env.NODE_ENV === "development"`, click on scene image logs fractional `[x,y]`.

- [ ] **Step 3: Wire `template.kind === "scene"`; HTML5 zip → `Html5Notice` from `social/shared.tsx`.

- [ ] **Step 4: Manual accept** (spec §2.5) after photos land; calibrate quads if needed.

- [ ] **Step 5: Commit** `feat(creative): add lounge TV scene mockup`

---

## Phase 3 — Feature A: Live page screenshot pipeline

**Prerequisite:** Task 0 gate passed (or Scrapfly chosen).

### Task 8: Extract shared `adSizes.ts`

**Files:**
- Create: `lib/creative/adSizes.ts`
- Modify: `lib/creative/mockPage/rewritePage.ts` to re-export from `adSizes` (temporary until mock-page deleted)

- [ ] Move `IAB_SIZES` + `nearestIabSize` (tolerance ±4 for inject; keep ±2 for cheerio until delete).
- [ ] Commit `refactor(creative): extract shared IAB ad sizes`

---

### Task 9: Frame signing helpers

**Files:**
- Create: `lib/creative/liveMockup/frameSign.ts`
- Create: `lib/creative/liveMockup/__tests__/frameSign.test.ts`

- [ ] HMAC-SHA256 hex of `${id}.${exp}` with `CREATIVE_FRAME_SIGNING_SECRET`; `timingSafeEqual`; reject expired or `exp > now + 10min`.
- [ ] `mintFrameUrl({ origin, id, ttlSec = 300 })`.
- [ ] Commit `feat(creative): add signed creative frame URL helpers`

---

### Task 10: `GET /api/creative-assets/[id]/frame`

**Files:**
- Create: `app/api/creative-assets/[id]/frame/route.ts`

- [ ] No Auth0 session. Verify `exp` + `sig`. Only `image/*` and `video/*`. Stream blob like download. `Cache-Control: private, no-store`.
- [ ] Commit `feat(creative): add signed public creative frame route`

---

### Task 11: Provider adapter + ScreenshotOne

**Files:**
- Create: `lib/creative/liveMockup/provider.ts`
- Create: `lib/creative/liveMockup/screenshotone.ts`
- Create: `lib/creative/liveMockup/validateTargetUrl.ts` (hostname/https/private-IP from `fetchSafe` without fetch)
- Create: `lib/creative/liveMockup/injectScript.ts`
- Create: `lib/creative/liveMockup/rateLimit.ts` (5/min)

ScreenshotOne params (verified docs):
- `full_page=true`, `format=jpg`, `image_quality=90`, `viewport_width=1440`
- `ip_country_code=au`, `block_cookie_banners=true`, **`block_ads=false`**
- `scripts=<inject>`, `delay=3`
- If `SCREENSHOTONE_SECRET` set: HMAC-SHA256 of query string (without signature), append `signature=`

Prefer **POST** JSON body for long scripts (signed links are GET-oriented; keep unsigned server-side POST with access key in body/header when secret signing for public links isn’t needed). ⚠️ If account forces signing, use GET signed URL path from docs.

`injectScript`: candidate selectors from rewritePage; score by size then `rect.top`; replace/inject `<img|video>` from `frameUrl`; try/catch everything; keep < ~6KB.

- [ ] Commit `feat(creative): add ScreenshotOne live-mockup provider`

---

### Task 12: `POST /api/creative-assets/live-mockup`

**Files:**
- Create: `app/api/creative-assets/live-mockup/route.ts`

- [ ] `maxDuration = 60`, staff gate, 5/min rate limit, validate URL, mint frame URL, build inject (or null for `mode: "plain"`), call provider, return `{ image: base64, contentType, provider, tookMs }`.
- [ ] Typed errors: `provider_not_configured`, `provider_blocked`, `provider_timeout`, `rate_limited`, `invalid_url`.
- [ ] Zip / non image-video → force plain + message in JSON `hint`.
- [ ] Commit `feat(creative): add live-mockup screenshot API`

---

### Task 13: Rewrite `LivePageMockup.tsx`

**Files:**
- Modify: `components/creative/mockups/LivePageMockup.tsx`

- [ ] Success: scrollable `<img>`, Download PNG via `file-saver` named `{asset_name}-{hostname}-mockup.png`.
- [ ] Manual placement: plain screenshot + draggable/resizable creative on canvas; creative from authenticated download; export PNG.
- [ ] Friendly error map + “Use built-in templates” hatch.
- [ ] Copy when injection uncertain: “Creative placed into detected ad slots — if you don't see it, use manual placement.”
- [ ] Commit `feat(creative): screenshot-based live page mockup UI`

---

### Task 14: Env example + delete dead mock-page path

**Files:**
- Modify: `env.local.example`
- Delete: `app/api/creative-assets/mock-page/route.ts`, `lib/creative/mockPage/*` (after moving any still-needed URL validation)
- Update/remove: `lib/creative/__tests__/mockPage.test.ts`, `rewriteMockPage.test.ts`

```
SCREENSHOTONE_ACCESS_KEY=
SCREENSHOTONE_SECRET=
CREATIVE_FRAME_SIGNING_SECRET=
# NEXT_PUBLIC_APP_URL=   # if not already present
```

- [ ] Grep for `mock-page` / `mockPage` — zero remaining imports.
- [ ] Commit `chore(creative): remove fetch-iframe live mockup pipeline`

---

### Task 15: Live verification checklist

Against **deployed** preview (per handoff lesson), not only local:

1. Friendly AU publisher 728×90 inject visible.
2. news.com.au returns a screenshot (go/no-go).
3. No-slot size → manual placement export works.
4. Video → first frame in slot.
5. No key → not-configured card.
6. Frame URL: wrong sig 401; +6 min 401/410; works without cookies.
7. 6th live-mockup / min → 429.

---

## Spec coverage self-check

| Spec section | Tasks |
|--------------|-------|
| §1.2 live-mockup route | 12 |
| §1.3 provider adapter | 11, 0 |
| §1.4 frame route | 9–10 |
| §1.5 inject script | 11 |
| §1.6 client rework | 13 |
| §1.7 env | 14 |
| §1.8 accept | 15 |
| §2 scene/TV | 5–7 |
| §3 AVA copy | 1–4 |
| Delete old mock-page | 14 |
| Build order C→B→A | Phases 1–3 |

## Open ⚠️ items (resolve during build, don’t assume)

1. ScreenshotOne vs Akamai — Task 0.
2. Prefer POST for long `scripts`; verify account signing requirements.
3. Calibrate TV quads with click helper after photos land.
4. Angled 4K photo soft — ship labelled.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-13-creative-mockup-v2.md`.

**Recommended start:** Phase 1 (Feature C) immediately — Anthropic is configured; no external screenshot vendor or TV photos required.

**Blocked until Luke acts:**
- Feature B visuals → drop `public/mockups/tv-lounge-modern.jpg` + `tv-lounge-4k.jpg`
- Feature A → ScreenshotOne trial key + Task 0 curl gate
