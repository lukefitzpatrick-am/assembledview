/**
 * Codex search (F8, switch `codex_search`). Pure helpers shared by the route,
 * the repo and the search dialog. No server-only imports.
 *
 * What is searched (all staff, same rules as the lists):
 * - tasks: title, MBA number, description and comments. Live tasks only.
 * - Inbox items: meeting action items still waiting for a decision
 *   (`ava_task_proposals.status = 'proposed'`), title and description.
 * - meetings: `client_notes` title and summary. Internal meetings included:
 *   staff see internal summaries (decision 52). Never an Ava path (F9).
 *
 * Matching: Postgres full text (`to_tsvector('english') @@
 * plainto_tsquery('english')`, the repo's pattern) OR a literal ILIKE
 * substring, so a partial word or an MBA code still matches. No index is
 * needed at today's size; see the codex brain page.
 */

export const CODEX_SEARCH_MIN_CHARS = 2
export const CODEX_SEARCH_MAX_CHARS = 100
export const CODEX_SEARCH_DEFAULT_LIMIT = 8
export const CODEX_SEARCH_MAX_LIMIT = 25
export const CODEX_SEARCH_SNIPPET_CHARS = 160

/** Trimmed, single-spaced, capped query; null when too short to search. */
export function normaliseCodexSearchQuery(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const q = raw.replace(/\s+/g, " ").trim().slice(0, CODEX_SEARCH_MAX_CHARS).trim()
  if (q.length < CODEX_SEARCH_MIN_CHARS) return null
  return q
}

/** Per-group result limit: default 8, clamped to 1..25. */
export function codexSearchLimit(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (raw == null || raw === "" || !Number.isFinite(n)) return CODEX_SEARCH_DEFAULT_LIMIT
  return Math.min(CODEX_SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(n)))
}

/** ILIKE pattern with `\`, `%` and `_` treated as literals. */
export function codexSearchLikePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

/**
 * One line of plain text around the first case-insensitive hit of `q`, or
 * the start of the text when there is no literal hit (a full-text match on a
 * stemmed word). Whitespace collapsed; ellipses mark cut ends.
 */
export function codexSearchSnippet(
  text: string | null | undefined,
  q: string,
  max = CODEX_SEARCH_SNIPPET_CHARS
): string | null {
  if (typeof text !== "string") return null
  const flat = text.replace(/\s+/g, " ").trim()
  if (!flat) return null
  if (flat.length <= max) return flat
  const at = q ? flat.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return `${flat.slice(0, max).trimEnd()}…`
  const lead = Math.floor((max - q.length) / 3)
  const start = Math.max(0, Math.min(at - lead, flat.length - max))
  const end = Math.min(flat.length, start + max)
  const body = flat.slice(start, end).trim()
  return `${start > 0 ? "…" : ""}${body}${end < flat.length ? "…" : ""}`
}

/**
 * The text a meeting summary is searched on. `client_notes.body` is Fireflies
 * JSON (`{"summary": "...", "action_items": "..."}`, 341 of 341 rows on 13
 * Nov 2026), so the raw text would index the keys ("summary" and "action
 * items" matched every meeting) and glue a word after each `\n` escape onto
 * an `n` ("\nFollow" indexed as "nfollow"). The regexp blanks the two keys and
 * the `\n` `\r` `\t` escapes.
 *
 * This exact text is the expression of index `idx_client_notes_body_fts`
 * (migration 0116, `db/schema/codex.ts`, snapshot 0026). Change all of them
 * together, or Postgres stops using the index. Pinned by `test:codex-search`.
 */
export const CLIENT_NOTES_BODY_FTS_PATTERN = String.raw`"(summary|action_items)"\s*:|\\[nrt]`

export const CLIENT_NOTES_BODY_FTS_EXPRESSION = `to_tsvector('english'::regconfig, regexp_replace(coalesce(body, ''), '${CLIENT_NOTES_BODY_FTS_PATTERN}', ' ', 'g'))`

/**
 * Plain text of a meeting body for a snippet: the summary and the action
 * items from the Fireflies JSON (no keys, braces or escapes), bold markers
 * dropped. A body that is not that JSON is used as it is.
 */
export function meetingSearchText(body: string | null | undefined): string | null {
  if (typeof body !== "string" || !body.trim()) return null
  let text = body
  try {
    const parsed = JSON.parse(body) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      const parts = [record.summary, record.action_items].filter(
        (part): part is string => typeof part === "string" && part.trim() !== ""
      )
      if ("summary" in record || "action_items" in record) text = parts.join("\n")
    }
  } catch {
    /* not JSON: plain text */
  }
  const plain = text.replace(/\*\*/g, "").trim()
  return plain || null
}

export type CodexSearchMatchedIn = "title" | "mba" | "description" | "comment"

export type CodexSearchTaskHit = {
  id: number
  title: string
  status: string
  client_id: number | null
  mba_number: string | null
  assignee_email: string | null
  assignee_name: string | null
  due_date: string | null
  matched_in: CodexSearchMatchedIn
  snippet: string | null
}

export type CodexSearchProposalHit = {
  id: number
  title: string
  client_id: number | null
  mba_number: string | null
  source_note_id: number | null
  meeting_title: string | null
  meeting_date: string | null
  snippet: string | null
}

export type CodexSearchMeetingHit = {
  id: number
  title: string | null
  meeting_date: string | null
  client_id: number | null
  mba_number: string | null
  is_internal: boolean
  attributed_type: string | null
  transcript_url: string | null
  task_count: number
  snippet: string | null
}

export type CodexSearchGroup<T> = { items: T[]; more: boolean }

export type CodexSearchResults = {
  q: string
  tasks: CodexSearchGroup<CodexSearchTaskHit>
  inbox: CodexSearchGroup<CodexSearchProposalHit>
  meetings: CodexSearchGroup<CodexSearchMeetingHit>
}

/** Keep the first `limit` rows; `more` when the query returned limit + 1. */
export function takeSearchGroup<T>(rows: T[], limit: number): CodexSearchGroup<T> {
  return { items: rows.slice(0, limit), more: rows.length > limit }
}

/** Only http(s) transcript links are shown; anything else is dropped. */
export function safeTranscriptUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}
