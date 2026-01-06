# OpenAI Integration – Current State

- **Models referenced:** `process.env.OPENAI_MODEL` (default `gpt-4o-mini`).
- **API used:** OpenAI Chat Completions (`/v1/chat/completions`) via the official `openai` SDK.
- **Core helper:** `callOpenAIChat` in `lib/openai.ts` wraps the SDK call; defaults `temperature` to `0.2`, returns `{ reply, completion }` where `reply` is `choices[0].message.content`.

## Call Sites

- `lib/openai.ts`
  - **API type / endpoint:** Chat Completions → `openai.chat.completions.create` (`/v1/chat/completions`).
  - **Request shape:** `{ model, temperature, messages }`; `model` from `OPENAI_MODEL` env or `gpt-4o-mini`.
  - **Response handling:** Extracts first choice content as `reply`; returns raw completion too.
  - **Prompts:** `buildSystemPrompt` composes system text with page data, optional Xano summary, and caller-supplied instructions.

- `app/api/chat/route.ts`
  - **API type / endpoint:** Uses `callOpenAIChat` (Chat Completions `/v1/chat/completions`).
  - **Request shape to OpenAI:** Prepends `{ role: "system", content: buildSystemPrompt(...) }` to incoming `messages`. `buildSystemPrompt` includes page data summary, optional Xano fetch summary, and `systemInstructions`. Temperature/model defaults come from `callOpenAIChat`.
  - **Response handling:** Sends back `{ reply, meta: { usedXano } }` to the client; errors return `{ error }` with 500.
  - **Prompts:** System prompt built server-side; user/assistant history passed through from client.

- `lib/planParser.ts`
  - **API type / endpoint:** Uses `callOpenAIChat` (Chat Completions `/v1/chat/completions`) for file-to-JSON extraction.
  - **Request shape:** Messages: system prompt instructing JSON-only media-plan extraction; user message contains file name and content (truncated to 12,000 chars).
  - **Response handling:** Parses `reply` via `coerceJson` to `items`; attaches `sourceFile`; also returns raw model text.
  - **Prompts:** Extraction prompt defined inline in `extractPlanFromText`.

## Prompt Locations

- System prompt builder: `lib/openai.ts` (`buildSystemPrompt`).
- Media-plan extraction prompt: `lib/planParser.ts` (`extractPlanFromText`).
- Client-provided additions: `components/ChatWidget.tsx` assembles `systemInstructions` and page data before sending to `/api/chat`; these end up inside `buildSystemPrompt`.

## Environment

- `OPENAI_API_KEY` required; `OPENAI_MODEL` optional (defaults to `gpt-4o-mini`); configured in `env.local.example`.


