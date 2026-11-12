/**
 * Codex search (F8, B37): pure helpers, the SQL each group runs, and the
 * row mapping. No database: the executor is a fake.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import {
  CLIENT_NOTES_BODY_FTS_EXPRESSION,
  CLIENT_NOTES_BODY_FTS_PATTERN,
  CODEX_SEARCH_DEFAULT_LIMIT,
  CODEX_SEARCH_MAX_LIMIT,
  codexSearchLikePattern,
  codexSearchLimit,
  codexSearchSnippet,
  meetingSearchText,
  normaliseCodexSearchQuery,
  safeTranscriptUrl,
  takeSearchGroup,
} from "../search.js"
import {
  buildMeetingSearchSql,
  buildProposalSearchSql,
  buildTaskSearchSql,
  searchCodex,
} from "../searchRepo.js"

const dialect = new PgDialect()
const render = (q: SQL) => dialect.sqlToQuery(q)
const flat = (text: string) => text.replace(/\s+/g, " ")

test("query: trimmed, single-spaced, capped at 100, null under 2 characters", () => {
  assert.equal(normaliseCodexSearchQuery("  weekly   report "), "weekly report")
  assert.equal(normaliseCodexSearchQuery("a"), null)
  assert.equal(normaliseCodexSearchQuery("   "), null)
  assert.equal(normaliseCodexSearchQuery(null), null)
  assert.equal(normaliseCodexSearchQuery("x".repeat(150))?.length, 100)
})

test("limit: default 8, clamped to 1..25", () => {
  assert.equal(codexSearchLimit(null), CODEX_SEARCH_DEFAULT_LIMIT)
  assert.equal(codexSearchLimit("abc"), CODEX_SEARCH_DEFAULT_LIMIT)
  assert.equal(codexSearchLimit("0"), 1)
  assert.equal(codexSearchLimit("500"), CODEX_SEARCH_MAX_LIMIT)
  assert.equal(codexSearchLimit("12"), 12)
})

test("like pattern escapes %, _ and backslash", () => {
  assert.equal(codexSearchLikePattern("50%_off\\"), "%50\\%\\_off\\\\%")
})

test("snippet: a window around the first hit, ellipses on cut ends, whole text when short", () => {
  assert.equal(codexSearchSnippet("short\n text", "x"), "short text")
  const long = `${"a ".repeat(100)}NEEDLE${" b".repeat(100)}`
  const s = codexSearchSnippet(long, "needle", 60)!
  assert.ok(s.includes("NEEDLE"))
  assert.ok(s.startsWith("…") && s.endsWith("…"))
  assert.ok(s.length <= 62)
  assert.equal(codexSearchSnippet("x".repeat(200), "zz", 20), `${"x".repeat(20)}…`)
  assert.equal(codexSearchSnippet(null, "q"), null)
})

test("transcript links: http(s) only", () => {
  assert.equal(safeTranscriptUrl("https://app.fireflies.ai/view/abc"), "https://app.fireflies.ai/view/abc")
  assert.equal(safeTranscriptUrl("javascript:alert(1)"), null)
  assert.equal(safeTranscriptUrl("not a url"), null)
  assert.equal(safeTranscriptUrl(null), null)
})

test("group: keeps limit rows and flags more when the query returned limit + 1", () => {
  assert.deepEqual(takeSearchGroup([1, 2, 3], 2), { items: [1, 2], more: true })
  assert.deepEqual(takeSearchGroup([1, 2], 2), { items: [1, 2], more: false })
})

test("task SQL: live tasks only; title, MBA, description and comments; full text plus literal; limit + 1", () => {
  const { sql: text, params } = render(buildTaskSearchSql("brand report", 8))
  const s = flat(text)
  assert.match(s, /FROM tasks t WHERE t\.deleted_at IS NULL AND \(/)
  assert.match(s, /t\.title ILIKE \$\d+/)
  assert.match(s, /coalesce\(t\.mba_number, ''\) ILIKE/)
  assert.match(s, /coalesce\(t\.description, ''\) ILIKE/)
  assert.match(s, /OR EXISTS \( SELECT 1 FROM task_comments c WHERE c\.task_id = t\.id/)
  assert.match(s, /to_tsvector\('english'::regconfig, coalesce\(t\.title, ''\) \|\| ' ' \|\| coalesce\(t\.description, ''\)\) @@ plainto_tsquery\('english'::regconfig, \$\d+\)/)
  assert.ok(params.includes("%brand report%"))
  assert.ok(params.includes("brand report"))
  assert.ok(params.includes(9))
})

test("Inbox SQL: only items waiting for a decision", () => {
  const s = flat(render(buildProposalSearchSql("report", 5)).sql)
  assert.match(s, /FROM ava_task_proposals p LEFT JOIN client_notes n ON n\.id = p\.source_note_id WHERE p\.status = 'proposed' AND \(/)
})

test("meeting SQL: the body arm uses exactly the 0116 index expression, title by ILIKE", () => {
  const s = flat(render(buildMeetingSearchSql("report", 5)).sql)
  assert.ok(
    s.includes(`WHERE ${CLIENT_NOTES_BODY_FTS_EXPRESSION} @@ plainto_tsquery('english'::regconfig, $`),
    s
  )
  assert.match(s, /UNION SELECT id FROM client_notes WHERE coalesce\(title, ''\) ILIKE/)
  // Every meeting, internal included (decision 52): no is_internal filter.
  assert.doesNotMatch(s, /is_internal\s*(IS|=)/)
})

const ROOT = path.resolve(import.meta.dirname, "../../..")
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8")

test("meeting body expression: blanks the JSON keys and escapes, and is byte for byte the 0116 index", () => {
  // The SQL text Postgres sees (standard_conforming_strings on).
  assert.equal(CLIENT_NOTES_BODY_FTS_PATTERN, '"(summary|action_items)"\\s*:|\\\\[nrt]')
  assert.equal(
    CLIENT_NOTES_BODY_FTS_EXPRESSION,
    `to_tsvector('english'::regconfig, regexp_replace(coalesce(body, ''), '${CLIENT_NOTES_BODY_FTS_PATTERN}', ' ', 'g'))`
  )
  // What the pattern does, checked with the same regexp in JS.
  const re = new RegExp(CLIENT_NOTES_BODY_FTS_PATTERN, "g")
  const body = JSON.stringify({ summary: "- **Budget:** cut\nFollow up", action_items: "**Sam**\nSend report" })
  const blanked = body.replace(re, " ")
  assert.doesNotMatch(blanked, /summary|action_items/)
  assert.doesNotMatch(blanked, /\\[nrt]/)
  assert.match(blanked, / Follow up/)
  // The migration, the run file, the drizzle SQL and the latest snapshot carry the same expression.
  const indexSql = `USING gin (${CLIENT_NOTES_BODY_FTS_EXPRESSION})`
  assert.ok(read("db/migrations/0116_codex_search_index.sql").includes(indexSql), "migration 0116")
  assert.ok(read("sql/supabase/2026-11-13_0116_codex_search_index_SUPABASE.sql").includes(indexSql), "run file 0116")
  const quoted = CLIENT_NOTES_BODY_FTS_EXPRESSION.replace("coalesce(body,", 'coalesce("body",')
  assert.ok(read("db/drizzle/0026_codex_search_index.sql").includes(`USING gin (${quoted})`), "drizzle 0026 SQL")
  for (const snap of ["db/drizzle/meta/0026_snapshot.json", "db/drizzle/meta/0027_snapshot.json"]) {
    const json = JSON.parse(read(snap)) as {
      tables: Record<string, { indexes: Record<string, { columns: Array<{ expression: string }> }> }>
    }
    const idx = json.tables["public.client_notes"].indexes.idx_client_notes_body_fts
    assert.equal(idx.columns[0].expression, quoted, snap)
  }
})

test("meeting snippet text: summary and action items, no JSON keys, escapes or bold markers", () => {
  const body = JSON.stringify({ summary: "- **Q3 Plan:** budget agreed\n- **Media:** report due", action_items: "**Sam**\nSend the report" })
  const text = meetingSearchText(body)!
  assert.doesNotMatch(text, /summary|action_items|[{}"]|\*\*|\\n/)
  assert.ok(text.startsWith("- Q3 Plan: budget agreed\n- Media: report due\nSam\nSend the report"))
  assert.equal(meetingSearchText('{"summary": "", "action_items": "Call Sam"}'), "Call Sam")
  assert.equal(meetingSearchText("plain **notes**"), "plain notes")
  assert.equal(meetingSearchText("[1, 2]"), "[1, 2]")
  assert.equal(meetingSearchText("   "), null)
  assert.equal(meetingSearchText(null), null)
  const snippet = codexSearchSnippet(meetingSearchText(body), "report")!
  assert.doesNotMatch(snippet, /summary|[{}"]/)
})

test("task SQL: a title hit on a word stem is labelled title and ranks with title hits", () => {
  const s = flat(render(buildTaskSearchSql("reports", 8)).sql)
  const titleHit = /\(t\.title ILIKE \$\d+ OR to_tsvector\('english'::regconfig, coalesce\(t\.title, ''\)\) @@ plainto_tsquery\('english'::regconfig, \$\d+\)\)/
  assert.match(s, new RegExp(`CASE WHEN ${titleHit.source} THEN 'title' WHEN coalesce\\(t\\.mba_number`))
  assert.match(s, new RegExp(`ORDER BY ${titleHit.source} DESC, ts_rank`))
})

test("searchCodex maps rows, groups with more, picks the comment snippet for a comment hit", async () => {
  const calls: string[] = []
  const fake = {
    execute: async (q: SQL) => {
      const s = flat(render(q).sql)
      calls.push(s)
      if (s.includes("FROM client_notes n WHERE")) {
        return [{ id: 11, title: "WIP", body: JSON.stringify({ summary: "- **WIP:** we talked about the report", action_items: "**Sam**\nSend it" }), meeting_date: null, client_id: null, mba_number: null, is_internal: "t", attributed_type: "internal", transcript_url: "javascript:x", task_count: "2" }]
      }
      if (s.includes("FROM tasks t WHERE")) {
        return [
          { id: "7", title: "Pull report", status: "todo", client_id: "3", mba_number: "KRUS015", assignee_email: "alex.james@x.au", assignee_name: null, due_date: null, description: "d", matched_in: "title", comment_body: null },
          { id: 8, title: "Other", status: "done", client_id: null, mba_number: null, assignee_email: null, assignee_name: null, due_date: "2026-11-20T00:00:00Z", description: null, matched_in: "comment", comment_body: "the report is late" },
          { id: 9, title: "Third", status: "todo", matched_in: "description", description: "report body" },
        ]
      }
      if (s.includes("FROM ava_task_proposals")) {
        return { rows: [{ id: 4, proposed_title: "Send report", proposed_description: null, client_id: 3, proposed_mba_number: null, source_note_id: 11, meeting_title: "WIP", meeting_date: "2026-11-10T00:00:00Z" }] }
      }
      throw new Error(`unexpected SQL: ${s}`)
    },
  }
  const out = await searchCodex("report", 2, fake)
  assert.equal(calls.length, 3)
  assert.equal(out.tasks.items.length, 2)
  assert.equal(out.tasks.more, true)
  assert.equal(out.tasks.items[0].id, 7)
  assert.equal(out.tasks.items[0].client_id, 3)
  assert.equal(out.tasks.items[0].snippet, null)
  assert.equal(out.tasks.items[1].matched_in, "comment")
  assert.equal(out.tasks.items[1].snippet, "the report is late")
  assert.equal(out.inbox.items[0].title, "Send report")
  assert.equal(out.inbox.more, false)
  assert.equal(out.meetings.items[0].is_internal, true)
  assert.equal(out.meetings.items[0].transcript_url, null)
  assert.equal(out.meetings.items[0].task_count, 2)
  assert.equal(out.meetings.items[0].snippet, "- WIP: we talked about the report Sam Send it")
})
