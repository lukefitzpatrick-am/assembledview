/**
 * Codex search reads (F8). Staff only: the route gates switch, session and
 * admin before this runs. Rules match the lists:
 * - tasks: live rows (deleted_at null), every assignee (All tasks).
 * - Inbox items: `ava_task_proposals.status = 'proposed'` (the Inbox tab).
 * - meetings: every `client_notes` row, internal included (decision 52).
 *
 * Full text uses `to_tsvector('english') @@ plainto_tsquery('english')`, the
 * repo's pattern (`lib/insights/queryCampaignInsights.ts`). Meeting bodies are
 * searched with the JSON keys and escapes blanked
 * (`CLIENT_NOTES_BODY_FTS_EXPRESSION`), which is the expression of
 * `idx_client_notes_body_fts` (migration 0116). Without the index the same
 * query runs as a sequential scan, just slower.
 */
import "server-only"

import { sql, type SQL } from "drizzle-orm"
import { db, type Db } from "@/db"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import {
  CLIENT_NOTES_BODY_FTS_EXPRESSION,
  codexSearchLikePattern,
  codexSearchSnippet,
  safeTranscriptUrl,
  takeSearchGroup,
  type CodexSearchMatchedIn,
  type CodexSearchMeetingHit,
  type CodexSearchProposalHit,
  type CodexSearchResults,
  type CodexSearchTaskHit,
  meetingSearchText,
} from "@/lib/codex/search"

type ExecuteClient = { execute: (query: SQL) => Promise<unknown> }

function num(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  const s = String(value)
  return s === "" ? null : s
}

function bool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1
}

function matchedIn(value: unknown): CodexSearchMatchedIn {
  return value === "title" || value === "mba" || value === "description" ? value : "comment"
}

/** The tsvector both the task query and its rank read. */
function taskDocument(): SQL {
  return sql`to_tsvector('english'::regconfig, coalesce(t.title, '') || ' ' || coalesce(t.description, ''))`
}

export function buildTaskSearchSql(q: string, limit: number): SQL {
  const p = codexSearchLikePattern(q)
  const tsq = sql`plainto_tsquery('english'::regconfig, ${q})`
  return sql`
    SELECT t.id, t.title, t.status, t.client_id, t.mba_number, t.assignee_email,
           t.assignee_name, t.due_date, t.description,
           CASE
             WHEN t.title ILIKE ${p} THEN 'title'
             WHEN coalesce(t.mba_number, '') ILIKE ${p} THEN 'mba'
             WHEN coalesce(t.description, '') ILIKE ${p} OR ${taskDocument()} @@ ${tsq} THEN 'description'
             ELSE 'comment'
           END AS matched_in,
           (
             SELECT c.body FROM task_comments c
              WHERE c.task_id = t.id
                AND (coalesce(c.body, '') ILIKE ${p}
                     OR to_tsvector('english'::regconfig, coalesce(c.body, '')) @@ ${tsq})
              ORDER BY c.created_at DESC, c.id DESC
              LIMIT 1
           ) AS comment_body
      FROM tasks t
     WHERE t.deleted_at IS NULL
       AND (
         t.title ILIKE ${p}
         OR coalesce(t.mba_number, '') ILIKE ${p}
         OR coalesce(t.description, '') ILIKE ${p}
         OR ${taskDocument()} @@ ${tsq}
         OR EXISTS (
           SELECT 1 FROM task_comments c
            WHERE c.task_id = t.id
              AND (coalesce(c.body, '') ILIKE ${p}
                   OR to_tsvector('english'::regconfig, coalesce(c.body, '')) @@ ${tsq})
         )
       )
     ORDER BY (t.title ILIKE ${p}) DESC,
              ts_rank(${taskDocument()}, ${tsq}) DESC,
              coalesce(t.updated_at, t.created_at) DESC,
              t.id DESC
     LIMIT ${limit + 1}
  `
}

export function buildProposalSearchSql(q: string, limit: number): SQL {
  const p = codexSearchLikePattern(q)
  const tsq = sql`plainto_tsquery('english'::regconfig, ${q})`
  return sql`
    SELECT p.id, p.proposed_title, p.proposed_description, p.client_id,
           p.proposed_mba_number, p.source_note_id,
           n.title AS meeting_title, n.meeting_date
      FROM ava_task_proposals p
      LEFT JOIN client_notes n ON n.id = p.source_note_id
     WHERE p.status = 'proposed'
       AND (
         p.proposed_title ILIKE ${p}
         OR coalesce(p.proposed_description, '') ILIKE ${p}
         OR to_tsvector('english'::regconfig, p.proposed_title || ' ' || coalesce(p.proposed_description, '')) @@ ${tsq}
       )
     ORDER BY (p.proposed_title ILIKE ${p}) DESC, n.meeting_date DESC NULLS LAST, p.id DESC
     LIMIT ${limit + 1}
  `
}

/**
 * Body by full text on `CLIENT_NOTES_BODY_FTS_EXPRESSION` (the 0116 index
 * expression, exactly), title by ILIKE. A UNION keeps the indexed arm
 * indexable.
 */
export function buildMeetingSearchSql(q: string, limit: number): SQL {
  const p = codexSearchLikePattern(q)
  const tsq = sql`plainto_tsquery('english'::regconfig, ${q})`
  return sql`
    SELECT n.id, n.title, n.body, n.meeting_date, n.client_id, n.mba_number,
           n.is_internal, n.attributed_type, n.transcript_url,
           (SELECT count(*) FROM tasks t WHERE t.source_note_id = n.id AND t.deleted_at IS NULL) AS task_count
      FROM client_notes n
     WHERE n.id IN (
             SELECT id FROM client_notes
              WHERE ${sql.raw(CLIENT_NOTES_BODY_FTS_EXPRESSION)} @@ ${tsq}
             UNION
             SELECT id FROM client_notes WHERE coalesce(title, '') ILIKE ${p}
           )
     ORDER BY (coalesce(n.title, '') ILIKE ${p}) DESC, n.meeting_date DESC NULLS LAST, n.id DESC
     LIMIT ${limit + 1}
  `
}

function taskHit(row: Record<string, unknown>, q: string): CodexSearchTaskHit {
  const where = matchedIn(row.matched_in)
  const snippetSource =
    where === "comment" ? row.comment_body : where === "description" ? row.description : null
  return {
    id: Number(row.id),
    title: str(row.title) ?? "",
    status: str(row.status) ?? "todo",
    client_id: num(row.client_id),
    mba_number: str(row.mba_number),
    assignee_email: str(row.assignee_email),
    assignee_name: str(row.assignee_name),
    due_date: str(row.due_date),
    matched_in: where,
    snippet: codexSearchSnippet(str(snippetSource), q),
  }
}

function proposalHit(row: Record<string, unknown>, q: string): CodexSearchProposalHit {
  return {
    id: Number(row.id),
    title: str(row.proposed_title) ?? "",
    client_id: num(row.client_id),
    mba_number: str(row.proposed_mba_number),
    source_note_id: num(row.source_note_id),
    meeting_title: str(row.meeting_title),
    meeting_date: str(row.meeting_date),
    snippet: codexSearchSnippet(str(row.proposed_description), q),
  }
}

function meetingHit(row: Record<string, unknown>, q: string): CodexSearchMeetingHit {
  return {
    id: Number(row.id),
    title: str(row.title),
    meeting_date: str(row.meeting_date),
    client_id: num(row.client_id),
    mba_number: str(row.mba_number),
    is_internal: bool(row.is_internal) || row.attributed_type === "internal",
    attributed_type: str(row.attributed_type),
    transcript_url: safeTranscriptUrl(row.transcript_url),
    task_count: num(row.task_count) ?? 0,
    snippet: codexSearchSnippet(meetingSearchText(str(row.body)), q),
  }
}

/** Three reads in parallel. `q` must already be normalised (normaliseCodexSearchQuery). */
export async function searchCodex(
  q: string,
  limit: number,
  database: ExecuteClient = db as Db
): Promise<CodexSearchResults> {
  const [taskRows, proposalRows, meetingRows] = await Promise.all([
    database.execute(buildTaskSearchSql(q, limit)),
    database.execute(buildProposalSearchSql(q, limit)),
    database.execute(buildMeetingSearchSql(q, limit)),
  ])
  return {
    q,
    tasks: takeSearchGroup(executeRows(taskRows).map((r) => taskHit(r, q)), limit),
    inbox: takeSearchGroup(executeRows(proposalRows).map((r) => proposalHit(r, q)), limit),
    meetings: takeSearchGroup(executeRows(meetingRows).map((r) => meetingHit(r, q)), limit),
  }
}
