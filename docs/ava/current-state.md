# Ava — current state

- **Chat endpoint:** `POST /api/chat-v2` only (legacy `/api/chat` and GPT handler removed).
- **Engine:** Anthropic Claude via `lib/ava/agentLoop.ts`. Optional kill-switch: `AVA_ENGINE=off` → 503.
- **Required env:** `ANTHROPIC_API_KEY`. Optional: `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`), `AVA_ENGINE=off`.
- **Admin-only:** unauthenticated → 401; non-admin → 403.
- **Route:** `maxDuration = 60` (multi-tool turns; streaming is a later phase).

## Prompting

- Claude system prompt: `lib/ava/buildAvaSystemPrompt.ts` (identity + voice + mode + PageContext summary).
- Modes: `general` | `mediaplan_create` | `mediaplan_edit` — wired from route in `ClientLayout`.
- Patches via `apply_form_patch` tool only — no JSON reply contract in prose.

## Types

- `PageContext` / `PageField` / `FormPatch` / `ModelChatReply` live in `lib/ava/types.ts`.

## OpenAI (non-Ava)

- `callOpenAIChat` in `lib/openai.ts` remains for `lib/planParser.ts` media-plan extraction only.
- Env: `OPENAI_API_KEY`, optional `OPENAI_MODEL`.

## Tools

- Registry: `lib/ava/tools/registry.ts`.
- Form: `apply_form_patch`, `get_media_plan_summary`.
- Context platform: `get_client_details`, `get_campaign_context`, `get_saved_audiences`, `get_best_practice`, `get_naming_rules`, `get_creative_assets`, `get_methodology`, `get_pacing_snapshot`.
- Tools receive session `roles` / `clientSlugs` / `mbaNumbers` and enforce scope internally.

## Client

- `ChatWidget` POSTs to `/api/chat-v2` without an `engine` field.
- Page providers register `pageContext` + actions on `window.__AV_ASSISTANT__` and clear on unmount.
- `AdminAssistantGate` ignores bridge contexts whose `route.pathname` ≠ current pathname.
