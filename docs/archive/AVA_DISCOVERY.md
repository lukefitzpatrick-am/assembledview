# AVA discovery & repair (A0)

**Date:** 2026-07-11  
**Scope:** Read-only map of Ask Ava surfaces + surgical fixes for obviously dead/broken wiring.  
**Luke’s symptoms:** `[PENDING — 3 bullets]` — failure inventory below is from code paths only; re-cross-check when bullets arrive.

---

## 1. Surfaces

### UI mount

| Piece | Role |
|-------|------|
| `components/ClientLayout.tsx` → `AdminAssistantGate` | Mounts `<ChatWidget getPageContext={…} />` for **admin** users when the app shell is visible (not `/` or `/auth/*`). |
| `components/ChatWidget.tsx` | Floating **Ask Ava** / **Close Ava** button; POSTs to `/api/chat-v2`. |
| `lib/assistantBridge.ts` | `window.__AV_ASSISTANT__` bridge: `setAssistantContext` / `getAssistantContext` for `pageContext` + DOM action handlers. |

**Not** the chat widget: `app/tools/behavioural-planner/components/AvaNarration.tsx` is deterministic BCS copy only (no API).

### API routes

| Route | Status |
|-------|--------|
| `POST /api/chat-v2` | **Only** Ava chat endpoint (`app/api/chat-v2/route.ts`). |
| `POST /api/chat` | **Gone** — `docs/ava/current-state.md` is stale. |

Admin-only: unauthenticated → 401; non-admin → 403 `"AVA is available to Admin users only."`

### Routing decision (quoted)

Client (`ChatWidget.resolveAvaEngine`):

```ts
// localStorage "ava:engine" override, else NEXT_PUBLIC_AVA_ENGINE === "claude", else "openai"
```

Server (`app/api/chat-v2/route.ts`):

```ts
const engine = body.engine === "openai" ? "openai" : "claude"

if (engine === "openai") {
  return await handleOpenAvaGptChat(...)   // legacy OpenAI
}

if (process.env.AVA_ENGINE !== "claude") {
  return 503 "AVA Claude engine is not enabled on this deployment."
}

const result = await runAvaAgent(...)     // Anthropic agentLoop
```

**Default today:** client sends `engine: "openai"` → **legacy `handleOpenAvaGptChat`**. Claude requires both client (`NEXT_PUBLIC_AVA_ENGINE=claude` or `localStorage`) **and** server `AVA_ENGINE=claude`.

---

## 2. Legacy path

### Is `openAvaGptHandler` still reachable?

**Yes — it is the default production path** whenever the widget does not opt into Claude.

Sole caller: `app/api/chat-v2/route.ts` when `body.engine === "openai"`.

Behaviour: `buildSystemPrompt` + optional Xano (`getAvaXanoSummary`) + admin Snowflake (`getAvaSnowflakeSummary`) → `callOpenAIChat` with `response_format: json_object` → validate `FormPatch` against PageContext → `{ replyText, patch, meta.usedXano }`.

### `lib/openai` type coupling

| Consumer | Coupling |
|----------|----------|
| `lib/ava/agentLoop.ts` | `import type { FormPatch, PageContext }` — **type-only** (erased at compile). |
| `lib/ava/tools/types.ts`, `applyFormPatch.ts` | type-only `FormPatch` / `PageContext`. |
| `src/ava/modes.ts`, `assistantBridge`, `ChatWidget`, dashboard | types (+ ChatWidget uses `ModelChatReply`). |
| `app/api/chat-v2`, `openAvaGptHandler` | **runtime** `buildSystemPrompt` / `callOpenAIChat`. |
| `lib/planParser.ts` | **runtime** `callOpenAIChat` (media-plan extraction — not Ava UI). |

Conclusion: Anthropic loop does **not** call OpenAI at runtime; it still shares prompt/types living under `lib/openai.ts`.

---

## 3. Retirement plan (Anthropic-only)

Structural — do not do in A0:

1. **Extract** `PageContext` / `PageField` / `FormPatch` / `ModelChatReply` → `lib/ava/types.ts` (or `src/ava/types.ts`).
2. **Split prompts:** Claude path must **not** use the GPT JSON reply contract; keep `buildSystemPrompt` GPT-shaped only until deleted, or add `buildClaudeSystemPrompt` without `jsonReplyContract`.
3. **Default engines to Claude:** `ChatWidget` → `"claude"`; drop `engine` body field; remove `AVA_ENGINE` / `NEXT_PUBLIC_AVA_ENGINE` dual gate (or single `AVA_ENGINE=claude` kill-switch).
4. **Port** Snowflake enrichment into a Claude tool (or drop) — today Snowflake is GPT-path only.
5. **Delete** `lib/ava/openAvaGptHandler.ts` and OpenAI branch in `chat-v2`.
6. **Keep** `callOpenAIChat` in `lib/openai.ts` for `planParser` until that migrates separately.
7. **Wire modes** from routes: create → `mediaplan_create`, edit → `mediaplan_edit` (today always `general`).
8. **Document** `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AVA_ENGINE` in `env.local.example`.

---

## 4. Config

| Constant / env | Value / notes |
|----------------|---------------|
| `AVA_MODEL` | `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5"` (`lib/ava/anthropic.ts`) |
| `AVA_MAX_TOKENS` | `2048` (hardcoded) |
| `AVA_MAX_TOOL_ITERATIONS` | `6` (hardcoded) |
| `ANTHROPIC_API_KEY` | Required for Claude path |
| `AVA_ENGINE` | Server must be `"claude"` or Claude returns 503 |
| `NEXT_PUBLIC_AVA_ENGINE` | Client default engine (`claude` or else openai) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Legacy GPT path (`gpt-4o-mini` default) |

**`env.local.example`:** has `OPENAI_*` only — **no** `ANTHROPIC_*`, `AVA_ENGINE`, or `NEXT_PUBLIC_AVA_ENGINE`.

**Vercel:** project linked (`prj_9NduYxPJCL0SuI1rgu6BYadszoJk`); CLI/MCP not authenticated in this session — **could not list remote env**. Verify `ANTHROPIC_API_KEY`, `AVA_ENGINE`, `NEXT_PUBLIC_AVA_ENGINE` in the Vercel dashboard.

### Missing key behaviour (after A0 fix)

| Engine | Before | After (this pass) |
|--------|--------|-------------------|
| Claude, no `ANTHROPIC_API_KEY` | 500 via `runAvaAgent` → `"AVA agent loop failed: ANTHROPIC_API_KEY is not set…"` | **503** JSON `{ error: "ANTHROPIC_API_KEY is not configured…" }` before the loop |
| GPT, no `OPENAI_API_KEY` | 500 `"OPENAI_API_KEY is not set"` | **503** clear message before `handleOpenAvaGptChat` |

`ChatWidget` surfaces `data.error` in the panel and as an assistant line.

---

## 5. PageContext

Canonical shape (`lib/openai.ts`):

```ts
PageContext = {
  route?: { pathname?, clientSlug?, mbaSlug? } | string
  fields?: PageField[]  // fieldId|id, label, value, editable, type, options, semanticType, group, source…
  generatedAt?: string
  state?: Record<string, any>
  saveSelector?: string
  entities?: { clientSlug?, clientName?, mbaNumber?, campaignName?, mediaTypes? }
  pageText?: { title?, headings?, breadcrumbs? }
}
FormPatch = { updates: { fieldId: string; value: unknown }[] }
```

### Who provides it

| Page | Snapshot | Actions registered? |
|------|----------|---------------------|
| `/mediaplans/create` | Campaign fields + media-type toggles; `entities` (no `mbaNumber`) | Yes (`setField` / click / select / toggle / `updateBurstBudget`) via separate effect; `pageContext` refreshed in another |
| `/mediaplans/mba/[mba]/edit` | Same family + `route.mbaSlug` / `entities.mbaNumber` | Yes (`setField`, click, select, toggle) |
| Dashboard (`DashboardOverview`) | Filter/sort/action fields + rich `state` (counts, previews) | Yes (`setField` only) |
| All other shell routes | **None** unless leftover on `window` | No |

`AdminAssistantGate` reads `getAssistantContext()?.pageContext` only — stale context can linger after navigating off a provider page.

### `apply_form_patch` expectations

Tool (`lib/ava/tools/applyFormPatch.ts`): requires `updates[]` with `fieldId` + `value`; field must appear in `pageContext.fields` with `editable === true` (matches `fieldId` or `id`). Sets `context.capturedPatch`; **does not** mutate the DOM. Client `maybeApplyPatch` calls bridge `actions.setField`. No editable fields → tool error string.

---

## 6. Modes / systemPrompt / voiceSpec

### Modes (`src/ava/modes.ts`) — quoted

```ts
export type ChatMode = "general" | "mediaplan_create" | "mediaplan_edit"
```

- **general:** “General assistant mode. Provide concise, helpful answers grounded in the provided PageContext when available.” + patchGuidance  
- **mediaplan_create:** “Media plan creation mode. Clarify missing goals, budgets, dates, and media mix…” + patchGuidance  
- **mediaplan_edit:** “Media plan editing mode. Respect current values, propose incremental improvements…” + patchGuidance  

`patchGuidance` still says **“Return JSON only matching the response contract.”**

**Who sets mode:** `ChatWidget` defaults `mode = "general"`. `ClientLayout` never passes `mode`. Create/edit modes are **API-reachable but UI-unused**.

### Identity / boundaries (`src/ava/systemPrompt.ts`) — quoted

```
You are Ava, the in-product assistant for AssembledView.
You guide users through media plan work, explain next steps clearly, and stay grounded in provided data.
Be concise, action-focused, and explicit with dates, numbers, and owners.

Stay within the current workflow and PageContext; avoid inventing fields or routes.
When data is missing or ambiguous, ask for the smallest clarification needed before acting.
Prefer clear, verifiable instructions over speculation.
```

### Voice (`src/ava/voiceSpec.ts`) — quoted

```
- Lead with the direct answer; keep replies brief.
- Use bullets or short steps for multi-part guidance; surface key numbers explicitly.
- State assumptions before relying on them; ask a targeted follow-up when confidence is low.
- When proposing UI actions, note the goal first and then provide a single, clean JSON action block.
- Keep tone calm, helpful, and professional.
```

Claude appendix (`AVA_V2_APPENDIX` in `chat-v2`): Australian English, short sentences, tool discipline for `get_media_plan_summary` / `apply_form_patch`. **Conflicts** with JSON-only rules still injected via `buildSystemPrompt` + modes.

---

## 7. Failure inventory

Tools in the Claude loop: `get_media_plan_summary`, `apply_form_patch`.

| # | Failure | Path |
|---|---------|------|
| 1 | **Default engine is GPT**, not Claude | Client default `openai` |
| 2 | Claude **dual gate**: client on, server `AVA_ENGINE≠claude` → 503 | `chat-v2` |
| 3 | Missing Anthropic/OpenAI keys | Was opaque 500; now explicit 503 (A0) |
| 4 | **Prompt conflict** on Claude: JSON-only contract + tool/plain-English appendix → JSON dumped in `replyText` or confused tool use | `buildSystemPrompt` + modes + appendix |
| 5 | **No streaming** — full blocking `messages.create`; multi-tool up to 6×2048 tokens; no `maxDuration` on route → Vercel timeout risk | `agentLoop` |
| 6 | **Missing PageContext** on non-plan pages (and stale bridge after navigate) | bridge |
| 7 | **`get_media_plan_summary`** needs `clientSlug`/`mbaNumber` from context — empty on dashboard/create-without-client | tool |
| 8 | **`apply_form_patch`** validates only; client needs `actions.setField` — message if missing | ChatWidget |
| 9 | Create/edit **modes never set** from UI | ClientLayout |
| 10 | Claude path **no Snowflake**; GPT path has it — capability gap | engines |
| 11 | Admin-only — non-admins never see widget (or get 403 if they hit API) | gate |
| 12 | GPT path: model non-JSON → validation error | openAvaGptHandler |
| 13 | Stale docs (`/api/chat`, OpenAI-only) | `docs/ava/current-state.md` |

**Luke’s symptoms:** pending — append and map to rows above when provided.

---

## 8. Verdict table

| Component | Verdict | A1-readiness notes |
|-----------|---------|-------------------|
| `ChatWidget` | **repair** | Default engine → Claude; pass `mode` from route; drop dual localStorage/env confusion when retiring GPT |
| `ClientLayout` / `AdminAssistantGate` | **keep** | Optionally clear bridge on route change; pass mode |
| `assistantBridge` | **keep** | Consider explicit clear on unmount of providers |
| `POST /api/chat-v2` | **repair** | Anthropic-only; Claude-specific system prompt; optional `maxDuration` |
| `lib/ava/agentLoop.ts` | **keep** | Core Claude path; consider streaming in later phase |
| `lib/ava/anthropic.ts` | **keep** | Config OK; document env |
| `lib/ava/tools/*` | **keep** | Add Snowflake tool if parity needed |
| `lib/ava/openAvaGptHandler.ts` | **retire** | After Claude default + soak |
| `lib/openai.ts` (Ava types + `buildSystemPrompt`) | **repair → split** | Move types; GPT JSON prompt stays until handler deleted; keep `callOpenAIChat` for planParser |
| `src/ava/modes.ts` | **repair** | Remove JSON patchGuidance for Claude; wire modes from UI |
| `src/ava/systemPrompt.ts` / `voiceSpec.ts` | **keep** | Soften “JSON action block” for tool era |
| `lib/xano/ava.ts` | **keep** | Shared by GPT path + Claude tool |
| `lib/avaSnowflake.ts` | **repair or retire** | Wire as tool or drop from Ava |
| `AvaNarration` (behavioural planner) | **keep** (separate) | Not Ask Ava |
| `docs/ava/current-state.md` | **repair** | Point at chat-v2 + dual engine |

---

## 9. A0 commits (surgical)

1. **`chat-v2`: return 503 when `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` missing** (clear user-facing error; drop unused `FormPatch` type import).

No other code was **provably unreachable** for deletion: `openAvaGptHandler` is the live default path.

---

## 10. Next (A1+)

1. Flip defaults to Claude; enable `AVA_ENGINE=claude` + keys in Vercel.  
2. Claude-specific system prompt (no JSON contract).  
3. Pass `mediaplan_*` modes from create/edit.  
4. Clear or refresh PageContext on navigation.  
5. Retire GPT handler after soak.  
6. Re-run failure inventory against Luke’s three symptom bullets.
