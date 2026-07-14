# MI Spec Upload Discovery (Workstream B)

**Scope:** Discovery only — no implementation, no commits, no touch of workstream A local commits.  
**Feature under investigation:** When the MI resolver dead-ends, AVA offers “Do you have the publisher’s specs?” → user uploads a document in chat → parse into `MiFormatRecord`-shaped specs → CONFIRM CARD (approve/edit before row fill; export-only like existing answers) → optional “add these to the specs library?” → if yes, store file + extracted JSON on private Blob and email `luke.fitzpatrick@assembledmedia.com.au` a link + summary for the **manual** library import cycle. Runtime **never** writes `lib/specs/mi-library/` (vendored).

**Investigated:** 2026-07-13 against repo root `c:\Projects\avmediaplan`.

---

## Executive verdict

| Area | Finding |
|------|---------|
| Chat → AVA file **upload** | **Not supported today.** Attachments are download-side only. |
| Closest upload precedent | `POST /api/processPlan` (multipart) — **not wired to ChatWidget**; orphans to plan parsing. |
| Anthropic SDK | `@anthropic-ai/sdk@0.97.1` — **yes** typed `DocumentBlockParam` (PDF) + `ImageBlockParam`; AVA path currently **strips to plain text only**. |
| `needs_spec` dead-ends | Three paths in `resolve.ts`; after publisher/format dead-end there is **no** follow-up upload offer today. |
| Email | **Exists in-app** via SendGrid (`sendHtmlEmail`); default ops recipient is already Luke’s address. **No Xano email change required** for v1. |
| Library write | Vendored; import is manual outside the app. Runtime must stay Blob + email only. |

---

## 1. CHAT UPLOAD

### 1.1 Does ChatWidget / chat-v2 support user file uploads to AVA?

**No — in either direction as an upload.**

Evidence:

- `components/ChatWidget.tsx` `sendMessage` posts **JSON only** to `/api/chat-v2` (`Content-Type: application/json`, `JSON.stringify(payload)`). No `FormData`, no `<input type="file">`, no base64 file fields. (~376–379)
- Payload shape is `{ messages, pageContext, mode }` only (~370–374).
- `app/api/chat-v2/route.ts` reads `await req.json()` into `ChatRequestBody` with `messages` / `pageContext` / `mode` only (~63–67, 107).
- `toAnthropicMessages` extracts **text only** from OpenAI-shaped messages; non-text content parts are ignored (~231–266). User content becomes a plain string `content: text`.

**Download-side (existing):**

- `lib/ava/chatFileAttachment.ts` — builds/coerces `ChatFileAttachment` for **assistant → user** download cards (`kind: "file"`, `url`, `fileName`, `contentType`).
- `ChatWidget` renders `ChatFileCard` which `fetch`es the attachment URL with credentials and triggers browser download (~146–174, 599–602).
- MI workbook tool emits attachments pointing at `/api/mi/exports/download?path=…` (`lib/ava/tools/generateMiWorkbook.ts` ~224–229).

### 1.2 `processPlan` — how it receives files (closest upload path)

`app/api/processPlan/route.ts`:

1. `POST` with `req.formData()` (~10).
2. Accepts field keys `"file"` or `"files"` via `formData.getAll` (~14–19).
3. Requires `entry instanceof File` (~18).
4. Converts each file to `{ fileName, buffer: Buffer.from(await file.arrayBuffer()) }` (~26–30).
5. Calls `processPlanFiles` from `lib/planParser.ts` (~33).
6. Returns JSON parse result; `maxDuration = 60` (~6).

**No size/type allowlist** in the route itself — acceptance is by filename extension inside `processPlanFiles` (`pdf`, `csv`, `xlsx`/`xls`, `docx`/`doc`, images as stub, else utf-8 text) — `lib/planParser.ts` ~41–64.

**Wiring:** Grep finds **no UI or chat caller** of `/api/processPlan` — only the route + `planParser`. Treat as a standalone/legacy API, not an AVA chat upload path.

### 1.3 What a chat upload would need

| Layer | Gap / requirement |
|-------|-------------------|
| **UI affordance** | New control on a question card (or composer) — file picker + optional paste-text path. `ChatQuestionCard` today has only choice / multichoice / text (`components/ChatQuestionCard.tsx` ~79–145). |
| **Transport** | Today chat is JSON text. Options: (A) multipart to a **new** dedicated route (preferred for large PDFs; mirrors `processPlan` / creative upload), then send `[mi:…]` answer referencing a server pathname; (B) base64 inside JSON (works for small images/PDFs, blows request size); (C) Vercel Blob client upload token pattern like creative assets (`app/api/creative-assets/upload/route.ts`). |
| **chat-v2 / agentLoop** | Must either not put binary in Anthropic history, or extend `toAnthropicMessages` to emit `DocumentBlockParam` / `ImageBlockParam`. Today text-only (~252–266). |
| **Size / type limits** | **OPEN QUESTION** for MI specs v1 caps. Creative upload uses `MAX_UPLOAD_BYTES = 500 * 1024 * 1024` and allowlist including `application/pdf` (`creative-assets/upload/route.ts` ~13–21) — too large for chat/LLM; recommend a much lower MI-specific cap (e.g. 10–25 MB) — **not defined in codebase**. |
| **Where files land** | See §5 — reuse private Blob under an MBA-scoped path, not `mi-library/`. |

---

## 2. PARSING

### 2.1 Anthropic SDK in use

| Source | Value |
|--------|--------|
| `package.json` | `"@anthropic-ai/sdk": "^0.97.1"` |
| Installed (`node_modules/@anthropic-ai/sdk/package.json`) | **0.97.1** |
| Client | `lib/ava/anthropic.ts` — singleton `new Anthropic({ apiKey })`, model `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5"` (~15–32) |

### 2.2 Document / image content blocks

**SDK supports both** on the stable Messages API (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`):

- `ContentBlockParam` includes `DocumentBlockParam` | `ImageBlockParam` (~527).
- `DocumentBlockParam`: `type: 'document'`, `source: Base64PDFSource | PlainTextSource | ContentBlockSource | URLPDFSource` (~551–561).
- `Base64PDFSource`: `media_type: 'application/pdf'`, `type: 'base64'` (~100–104).
- `ImageBlockParam` + `Base64ImageSource`: `image/jpeg` \| `image/png` \| `image/gif` \| `image/webp` (~95–98, 582–588).

**AVA does not use them today** — `toAnthropicMessages` and `agentLoop` operate on string / text blocks only.

### 2.3 Recommended v1 accept types

| Type | Fit | Approach in existing stack |
|------|-----|----------------------------|
| **PDF** | **Primary** | Native Anthropic document block **or** `pdf-parse` text extract (`planParser.ts` ~81–87 already uses `pdf-parse`). |
| **PNG / JPEG / WEBP / GIF** | Secondary | Anthropic image blocks; `planParser` currently stubs images (“OCR not available”) (~49–55). |
| **DOCX** | Useful | `mammoth.extractRawText` already in `planParser.ts` (~195–207); dependency `mammoth` in `package.json`. Feed extracted text to Claude as plain text (not a document block). |
| **XLSX** | Useful | `exceljs` already used (`planParser.ts` ~155–192; also MI workbook). Extract sheet text → Claude. Anthropic document blocks are **PDF-oriented**, not xlsx. |
| **DOC / XLS (legacy)** | Defer | `planParser` attempts `.doc` via mammoth fallback; fragile. |

**OPEN QUESTION:** Prefer Anthropic-native PDF document blocks vs always `pdf-parse` → text for cost/latency consistency with xlsx/docx path.

### 2.4 Extraction → structured specs

Closest existing LLM extract pattern: `extractPlanFromText` in `planParser.ts` (~130–152) — OpenAI chat, JSON-only prompt, 12k char truncate. MI feature should target **Claude** (AVA’s engine) with a schema aimed at `MiFormatRecord` (§4), not the plan `MediaContainer` shape.

---

## 3. INTERVIEW INTEGRATION

### 3.1 Where the three `needs_spec` paths emit (`lib/specs/resolve.ts`)

| Dead-end | Trigger | Emit site | Result |
|----------|---------|-----------|--------|
| **Publisher not in library** | Answer `"not in library"` (case-insensitive) | `resolvePublisher` ~727–728 → `resolveLine` ~985–990 | `buildResolved(…, "needs_spec", …, "Publisher not in MI library")`; **`questions` empty** |
| **Format none of these** | Answer `"none of these"` | `resolveFormat` ~770–771 → `resolveLine` ~1071–1076 | `buildResolved(…, "needs_spec", …, "Format is not in the MI library")`; **`questions` empty** |
| **Custom Direct Digital** | Container `Direct Digital` + `CUSTOM_DIRECT_TERMS` on format/placement (~111, ~995) | First: open `custom_specs` **text** question (~1000–1004). After answer: resolve with `needs_spec` + optional `customText` (~1007–1013) | Text paste already exists; still marks `needs_spec` |

Publisher choice that *leads* to the dead-end includes option `"not in library"` (~741). Format choice/multichoice includes `"none of these"` (~789, 836, 864).

**Gap vs desired UX:** After publisher/format dead-ends, the interview currently **stops asking** for that row (row is resolved as gap). There is **no** “Do you have the publisher’s specs?” question today. That offer must be **new** open-question emission (or a post-needs_spec follow-up field) before export.

### 3.2 Tool-driven contract (one card / turn, `[mi:id]` round-trip)

Documented in `lib/ava/miInterviewGuidance.ts` and implemented by:

- `start_mi_interview` — one `currentQuestion` + side-channel `questions` array of length 1 (`startMiInterview.ts` ~56–120, ~216–223).
- Confirm → `formatQuestionAnswerMessage` → `"[mi:${questionId}] ${answer}"` (`chatInterviewQuestion.ts` ~74–82).
- Answers keyed by `questionId` (= `appliesTo` = `` `${field}:${line_item_id}` ``) in `resolveMiPlan` answer map (~1138–1139, `question()` ~266–276).
- Guidance: answers are **conversation-only / export-only** — not saved to the plan (`miInterviewGuidance.ts` point 6).

### 3.3 Fitting a new `upload_specs` (or similar) question type

**`MiOpenQuestion.type` today:** `"choice" | "dimensions" | "text" | "multichoice"` (`resolve.ts` ~42).  
**`ChatInterviewQuestion.type` today:** `"choice" | "multichoice" | "text"` — `dimensions` coerced to `text` (`chatInterviewQuestion.ts` ~13–18; `types.ts` ~78–82).

Proposed fit (implementation later):

1. Emit new field e.g. `upload_specs` / `offer_specs` after needs_spec dead-ends, type **`choice`** first wave: options like `upload document` / `paste text` / `per booking` / `skip` — **no new card type required** for the offer itself.
2. If `upload document`: either (a) second question with a **new** chat type e.g. `upload`, or (b) dedicated UI when answer is `upload document`.  
3. If `paste text`: reuse existing `text` type (already used by `custom_specs`).
4. Confirm of extracted JSON: needs a **new card variant** (structured editable fields) — not expressible as choice/text alone. Options:
   - Extend `ChatInterviewQuestion.type` with `confirm_specs` (or similar) + payload of extracted fields;
   - Or a separate side-channel (like `attachments`) for confirm cards, still one card per turn.

**OPEN QUESTION:** Whether confirm-card edits round-trip as a single `[mi:upload_specs:…]` JSON string answer, or as multiple field-scoped answers. Current contract assumes one answer string per question id.

### 3.4 `ChatQuestionCard` changes needed

Today: Confirm builds answer via `formatQuestionAnswerMessage(question.id, question.type, selected, freeText)` (~57–66). Locked state shows `confirmedAnswer` (~147–152).

New upload control + confirm-specs editor would be additive branches beside the existing three type UIs (~79–145).

---

## 4. EXTRACTION SCHEMA

### 4.1 Target: `MiFormatRecord`

Defined in `lib/specs/library.ts` ~11–33:

Required for library formats: **`format_name`** (validated in `validatePublisherJson` ~258–259).  
Common optional fields used by `buildSpecsFields` / renderers: `container`, `placement`, `file_type`, ratios/dimensions, `max_file_size`, `text`, duration fields, `supply_deadline_rule`, `naming_convention`, `best_practice_notes`, `restrictions`, `aliases`, plus open index signature `[key: string]: unknown`.

Publisher-level packaging for library import later also needs `publisher_slug`, `publisher_name`, `last_refreshed`, source key, container category (`validatePublisherJson` ~220–237) — **runtime export fill does not write the library**; only Blob + email do.

### 4.2 Validation approach

| Existing pattern | Notes |
|------------------|-------|
| `validatePublisherJson` | Hand-rolled issue list, not zod (`library.ts` ~210–265). |
| Zod elsewhere | Widely used (`package.json` `"zod": "^4.3.6"`) e.g. mediaplan schemas, admin invites — **not** for MI library formats. |

**Recommendation:** New zod schema for **extracted + user-confirmed** format payload (strict enough for confirm UI + `fields_specs`), optionally run `validatePublisherJson`-compatible checks only when user opts into library submission. Do not invent a second hand-rolled validator without reason.

### 4.3 Confidence / provenance

`MiResolvedSpec.confidence` today: `"high" | "medium" | "fallback" | "needs_spec"` (~64).  
`sourceNote` is a free string on the resolved row (~69, set in dead-end paths).

There is **no** structured provenance field today. Options for v1:

- Put provenance in `sourceNote` / SPECS `Source` / `Publisher-Specific Notes` (already rendered via `buildSpecsFields` ~588, `renderBestPracticeNotes` ~402–421).
- Or extend `MiResolvedSpec` with optional `provenance` — **OPEN QUESTION** (touches resolve + workbook).

Suggested provenance string shape (product):  
`AI-extracted from <filename>, confirmed by <userEmail> <ISO date>` — user email already available on `AvaToolContext.userEmail` (`chat-v2/route.ts` ~131).

### 4.4 Flow into `buildResolved` / `fields_specs` (row only)

Path today:

1. `buildResolved(line, publisher, format, confidence, variant?, sourceNote?, customText?)` (~927–959).
2. `fields_specs = buildSpecsFields(line, publisher, format, customText, sourceNote)` (~531–592).
3. If `format` is non-null, SPECS columns fill from format fields; if only `customText`, notes / Publisher-Specific Notes get the paste (~408, ~587).

For uploaded specs: after user confirms, treat confirmed object as an in-memory `MiFormatRecord` passed into `buildResolved` for **that `line_item_id` only**, with confidence e.g. `"medium"` (or keep `"needs_spec"` cleared to medium/high — **OPEN QUESTION**). Must wire via answers so `resolveLine` can apply it on re-run (deterministic resolve + answer map), without mutating `mi-library/`.

**OPEN QUESTION:** Exact answer encoding so re-running `resolveMiPlan` with answers reconstructs the confirmed format (JSON blob in answer vs server-side session store keyed by upload id). Conversation-only answers today have no server session store beyond the transcript.

---

## 5. STORAGE

### 5.1 Existing MI private-Blob pattern

`lib/specs/storeMiExport.ts`:

```ts
put(`exports/mi/${mba}/${filename}`, buffer, {
  access: "private",
  contentType: XLSX_CONTENT_TYPE,
  addRandomSuffix: true,
})
```

Returns `{ pathname, filename }` — **pathname only** (signed URLs expire) (~20–22).

### 5.2 Auth-gated retrieval

`app/api/mi/exports/download/route.ts`:

- Auth0 session required (~26–28).
- `parseMiExportPath` validates `exports/mi/<mba>/...` (no `..`, must start with prefix) — `lib/specs/parseMiExportPath.ts` ~7–39.
- Client role: `checkClientMbaAccess(request, parsed.mba)` (~42–44).
- `get(pathname, { access: "private" })` then stream attachment (~49–62).

### 5.3 Reuse for spec uploads

**Recommended path scheme** (parallel, not overloading xlsx content-type assumptions):

- Docs: `exports/mi-specs/<mba>/<uploadId>/<safeOriginalName>`
- Extracted JSON: `exports/mi-specs/<mba>/<uploadId>/extracted.json`

Requires either:

- Generalising `parseMiExportPath` / download route to allow `exports/mi-specs/` and non-xlsx content types, **or**
- New `storeMiSpecUpload` + `GET /api/mi/specs/download` cloning the auth/MBA checks.

Do **not** put uploads under `lib/specs/mi-library/`.

Creative assets use a different Blob + Xano metadata path (`creative-assets/upload`) — reusable for large binary UX, but heavier than needed; MI export pattern is the closer semantic match (ephemeral ops artefact scoped by MBA).

---

## 6. EMAIL

### 6.1 What exists (no guessing)

| Mechanism | Location | Notes |
|-----------|----------|-------|
| **SendGrid HTML** | `lib/email/sendHtmlEmail.ts` | `SENDGRID_API_KEY` + `EMAIL_FROM`; `sendgridMail.send` (~24–35). |
| **Ops recipients** | `getOpsEmailRecipients()` same file (~47–56) | Default **`["luke.fitzpatrick@assembledmedia.com.au"]`**; override `OPS_EMAIL_TO` comma-list. |
| **Consumers** | `app/api/cron/ops-health/route.ts`, `app/api/cron/pacing-digest/route.ts` | Already call `sendHtmlEmail` + `getOpsEmailRecipients`. |
| **Invite email** | `lib/email/inviteSender.ts` | SendGrid **or** nodemailer SMTP fallback (~72–83). |
| **Deps** | `package.json` / lock | `@sendgrid/mail`, `nodemailer`. |

**No Resend / SES / Postmark usage found** in app code.  
**No Xano email endpoint** found in `app/api` for outbound mail (Xano is used for data; invites/digests are Next-side).

### 6.2 Recommendation (smallest addition)

**Reuse `sendHtmlEmail` + `getOpsEmailRecipients()`** (or hardcode Luke only if product wants a dedicated env e.g. `MI_SPECS_EMAIL_TO`).  
Subject/body: MBA, publisher label, filename, confidence summary, **auth-gated app download links** (not raw Blob URLs), extracted JSON summary.

**Not a Xano change** for sending. Luke’s library import remains a **manual** cycle after the email (§7).

**OPEN QUESTION:** Whether email should attach the file via SendGrid attachments API vs link-only (link-only matches MI export security model better).

---

## 7. LIBRARY IMPORT CYCLE

### 7.1 How the vendored library is produced today

- Location: `lib/specs/mi-library/` — comment in `library.ts` ~1–3: *“vendored verbatim… never edited repo-side.”*
- `VERSION.json` (current):

```json
{
  "formatCount": 66,
  "sourceZip": "material-instructions-builder v1 2026-05-25",
  "importedAt": "2026-07-11T10:17:39Z",
  "publisherCount": 14
}
```

- Tests assert `sourceZip` includes `"material-instructions-builder"` and `importedAt` present (`library.test.ts` ~65–71).
- Loader: `loadMiLibraryVersion` / `loadMiLibrary` / `listPublisherLibraryFiles` read disk JSON at runtime (`library.ts` ~268–285).

### 7.2 Import tooling in this repo

- **No** `scripts/save_to_library.py` (or similar) in this repository.
- Stub publisher `news-corp.json` documents an **external** refresh process: download PDF → `pdftotext` → `scripts/save_to_library.py` → update `last_refreshed` / remove stub (~50–55 of that file). That script is **outside** this Next app (referenced as documentation only).

### 7.3 How emailed submissions should land

Email package should be shaped for a human (Luke) to:

1. Download original doc + `extracted.json` from gated links.
2. Merge / edit into publisher JSON offline (material-instructions-builder / save_to_library pipeline).
3. Drop updated publisher files into `lib/specs/mi-library/`.
4. Bump `VERSION.json` (`importedAt`, `sourceZip`, counts).
5. Commit / deploy — **runtime never does steps 3–5.**

Suggested `sourceZip` / submission metadata for the email: include MBA, upload id, original filename, submitter email, timestamp — so the next vendored drop can cite e.g. `chat-spec-upload <mba> <uploadId>` in changelog notes even if `sourceZip` remains the builder zip name.

---

## 8. SECURITY

| Control | Existing precedent | Apply to MI spec upload |
|---------|--------------------|-------------------------|
| Auth | chat-v2 admin-only (~78–84); MI download session + client MBA check | Upload + download must require session; **admin-only** if chat remains admin-gated, else same role policy as MI tools. |
| Path traversal | `parseMiExportPath` rejects `..`, `\`, null, `//` | Same for any new prefix. |
| Private Blob | `access: "private"` on put/get | Never return long-lived public URLs in email/chat. |
| MBA scoping | Download checks `parsed.mba` for clients | Encode MBA in pathname; verify against scoped MBA from tool context. |
| Type allowlist | Creative upload has allowlist; processPlan does **not** | **Must add** for chat uploads (pdf/docx/xlsx/png/jpeg/webp). |
| Size cap | Creative 500MB; processPlan none | Define MI-specific low cap; reject oversize before LLM. |
| Filename | Blob `addRandomSuffix: true` on MI export | Sanitize display name; store random suffix; never trust client path segments. |
| Prompt injection | N/A today for chat files | Treat extracted text as untrusted; confirm card is the trust boundary before SPECS fill. |
| Library integrity | Vendored, validated on load tests | Runtime must not write `mi-library/`. |

**OPEN QUESTION:** Retention / TTL for `mi-specs` blobs (exports currently have no documented expiry in `storeMiExport`).

---

## 9. PLAN — proposed implementation slices (future commits)

Workstream B only; each slice = one logical commit. No code in this discovery.

| # | Slice | Touches (expected) | Test surface | Risk |
|---|-------|--------------------|--------------|------|
| B1 | Resolver: after publisher/format `needs_spec`, emit offer question (`choice`: upload / paste / per booking / skip) | `resolve.ts`, resolve tests | `resolve.test.ts` — dead-end → open offer; skip leaves NEEDS_SPEC | Medium — changes interview length / question totals |
| B2 | Answer handling: paste / per booking / skip wired through `fields_specs` without library write | `resolve.ts`, `buildMiWorkbook` if needed | resolve + workbook gap tests | Low–medium |
| B3 | Chat question card: `upload` UI + file picker; multipart upload API + private Blob store | `ChatQuestionCard`, new API route, store helper, path parser | API path validation unit tests; card unit if any | **High** — new upload surface |
| B4 | Parse pipeline: pdf/docx/xlsx/images → candidate `MiFormatRecord` (Claude + existing extractors) | new `lib/specs/extractMiSpecs*` or similar; zod schema | unit tests with fixture buffers; schema validation | **High** — LLM nondeterminism |
| B5 | Confirm card variant + `[mi:…]` encoding of confirmed JSON; apply on resolve re-run for that row | `types.ts`, `chatInterviewQuestion.ts`, `ChatQuestionCard`, `startMiInterview` | chatInterviewQuestion tests; resolve with confirmed answer | Medium–high — contract change |
| B6 | Library opt-in question + email via `sendHtmlEmail` + gated links | tool or route after confirm; email template | mock SendGrid; path auth tests | Low (email already exists) — ops noise if over-triggered |
| B7 | Docs/guidance: `miInterviewGuidance` + tool descriptions for upload/confirm/library ask | `miInterviewGuidance.ts`, tool defs | prompt/guidance snapshot if present | Low |

### Estimated risk hotspots

1. **Interview progress math** (`questionTotal` / baseline open count) when inserting new questions after former terminal needs_spec rows (`startMiInterview.ts` ~65–84).
2. **Putting binaries into Anthropic message history** vs server-side parse-then-text (chat-v2 currently text-only).
3. **Answer persistence** — no server session; large JSON in `[mi:…]` transcript may hit context limits.
4. **Accidental library mutation** — keep write paths Blob/email-only; code review gate.
5. **Security** of a new upload endpoint (type/size/MBA) — processPlan is a cautionary under-validated precedent.

---

## OPEN QUESTIONS (rollup)

1. Exact size/type allowlist and max bytes for v1 chat spec uploads.
2. Anthropic native PDF document blocks vs always text-extract for all types.
3. Confirm-card answer encoding (inline JSON vs upload-id indirection / server store).
4. Confidence value after user-confirmed AI extract (`medium` vs `high` vs new enum).
5. Whether to extend `MiResolvedSpec` with structured provenance or reuse `sourceNote`.
6. Blob retention policy for `mi-specs` artefacts.
7. Email: link-only vs SendGrid file attachment.
8. Whether offer should also fire when `custom_specs` text path already exists (avoid double-ask) or only on publisher/format dead-ends.
9. External `material-instructions-builder` / `save_to_library.py` location and handoff format Luke expects in the email body (not in this repo).

---

## Explicit non-goals (this workstream)

- No commits, no PRs, no edits to `lib/specs/mi-library/`.
- No implementation of upload UI or email send in this change set (doc only).
- No coupling to workstream A local commits.
