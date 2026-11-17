/**
 * Codex saved views store (F8). Every caller is behind `codex_saved_views`,
 * which can't be on before the marker 0117_codex_saved_views exists (registry
 * `requiresMarker`, B48), so nothing here checks the marker (C-76 holds
 * through the switch).
 *
 * Access (plan section 13, after the route's switch, session and staff
 * gates): a person sees their own views and every shared view; only the
 * owner renames, shares or deletes. Someone else's private view is reported
 * as not found, so its existence is not confirmed.
 */
import "server-only"

import { and, asc, count, eq, or, sql, type SQL } from "drizzle-orm"

import { db, schema, type Db } from "@/db"
import {
  canonicalFiltersForScreen,
  isProjectSavedViewScreen,
  parseSavedViewScreen,
  sanitiseSavedViewFilters,
  SAVED_VIEW_LAYOUTS,
  SAVED_VIEW_LENSES,
  type CodexSavedView,
  type SavedViewInput,
  type SavedViewPatch,
} from "@/lib/codex/savedViews"
import type { TasksFilterView } from "@/lib/codex/queryHelpers"
import { normaliseEmail } from "@/lib/email/address"

const { codexSavedViews } = schema

/** A person can keep this many views (own, shared or not). */
export const SAVED_VIEWS_PER_OWNER_MAX = 50

export class SavedViewsLimitError extends Error {
  readonly code = "SAVED_VIEWS_LIMIT"
  constructor() {
    super(`You can keep up to ${SAVED_VIEWS_PER_OWNER_MAX} saved views. Delete one first.`)
    this.name = "SavedViewsLimitError"
  }
}

export type SavedViewWriteResult =
  | { ok: true; view: CodexSavedView }
  | { ok: false; reason: "not_found" | "not_owner" }

export type SavedViewDeleteResult = { ok: true } | { ok: false; reason: "not_found" | "not_owner" }

type Row = typeof codexSavedViews.$inferSelect

function ownerIs(email: string) {
  return sql`lower(${codexSavedViews.ownerEmail}) = ${normaliseEmail(email)}`
}

export function savedViewRowToApi(row: Row, viewerEmail: string): CodexSavedView {
  const layout = (SAVED_VIEW_LAYOUTS as readonly string[]).includes(row.layout ?? "")
    ? (row.layout as TasksFilterView)
    : null
  const lens = (SAVED_VIEW_LENSES as readonly string[]).includes(row.lens) ? (row.lens as CodexSavedView["lens"]) : "plan"
  const screen = parseSavedViewScreen(row.screen) ?? "tasks"
  return {
    id: Number(row.id),
    owner_email: row.ownerEmail,
    name: row.name,
    screen,
    lens,
    filters: isProjectSavedViewScreen(screen) ? canonicalFiltersForScreen(screen, row.filters) : sanitiseSavedViewFilters(row.filters),
    layout,
    group_by: row.groupBy ?? null,
    shared: Boolean(row.shared),
    created_at: row.createdAt,
    mine: normaliseEmail(row.ownerEmail) === normaliseEmail(viewerEmail),
  }
}

/** Own views and every shared view for a screen, own first, then by name. */
export async function listSavedViews(
  viewerEmail: string,
  screen = "tasks",
  database: Db = db
): Promise<CodexSavedView[]> {
  const rows = await database
    .select()
    .from(codexSavedViews)
    .where(and(eq(codexSavedViews.screen, screen), or(ownerIs(viewerEmail), eq(codexSavedViews.shared, true))))
    .orderBy(
      sql`case when ${ownerIs(viewerEmail)} then 0 else 1 end`,
      asc(sql`lower(${codexSavedViews.name})`),
      asc(codexSavedViews.id)
    )
  return rows.map((row) => savedViewRowToApi(row, viewerEmail))
}

/**
 * Advisory lock for one owner's views, taken first inside the create
 * transaction. Two saves by the same person then run their count and insert
 * one after the other: under READ COMMITTED the second count is a new
 * statement after the lock, so it sees the first insert once that commits.
 * A single INSERT ... SELECT with the count is not enough on its own: two of
 * them read the same snapshot and both insert.
 */
export function savedViewsOwnerLockSql(ownerEmail: string): SQL {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`codex_saved_views:${normaliseEmail(ownerEmail)}`}, 0))`
}

/**
 * Create a view. The per-person limit check and the insert run in one
 * transaction under the owner's advisory lock, so concurrent saves cannot go
 * past SAVED_VIEWS_PER_OWNER_MAX.
 */
export async function createSavedView(
  ownerEmail: string,
  input: SavedViewInput,
  database: Db = db
): Promise<CodexSavedView> {
  return database.transaction(async (tx) => {
    await tx.execute(savedViewsOwnerLockSql(ownerEmail))
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(codexSavedViews)
      .where(ownerIs(ownerEmail))
    if (Number(n) >= SAVED_VIEWS_PER_OWNER_MAX) throw new SavedViewsLimitError()
    const [row] = await tx
      .insert(codexSavedViews)
      .values({
        ownerEmail: normaliseEmail(ownerEmail),
        name: input.name,
        screen: input.screen,
        lens: input.lens,
        filters: input.filters,
        layout: input.layout,
        groupBy: input.group_by,
        shared: input.shared,
      })
      .returning()
    return savedViewRowToApi(row, ownerEmail)
  })
}

/** Not yours and shared: not_owner (403). Not yours and private, or no such id: not_found (404). */
async function ownership(
  database: Db,
  id: number,
  viewerEmail: string,
  canUseScreen?: ScreenCheck
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_owner" }> {
  const [row] = await database
    .select({ ownerEmail: codexSavedViews.ownerEmail, shared: codexSavedViews.shared, screen: codexSavedViews.screen })
    .from(codexSavedViews)
    .where(eq(codexSavedViews.id, id))
    .limit(1)
  if (!row) return { ok: false, reason: "not_found" }
  // B42 (C-211): a view of a screen the viewer may not use (a private
  // project not theirs, or any project screen with codex_projects off) is
  // answered as missing, even to its owner.
  if (canUseScreen && !(await canUseScreen(row.screen))) return { ok: false, reason: "not_found" }
  if (normaliseEmail(row.ownerEmail) === normaliseEmail(viewerEmail)) return { ok: true }
  return { ok: false, reason: row.shared ? "not_owner" : "not_found" }
}

/** B42: may this person use views of this screen (route supplied: switch and project visibility)? */
export type ScreenCheck = (screen: string) => Promise<boolean>

export async function updateSavedView(
  id: number,
  viewerEmail: string,
  patch: SavedViewPatch,
  database: Db = db,
  canUseScreen?: ScreenCheck
): Promise<SavedViewWriteResult> {
  const access = await ownership(database, id, viewerEmail, canUseScreen)
  if (!access.ok) return access
  const set: Partial<typeof codexSavedViews.$inferInsert> = {}
  if (patch.name !== undefined) set.name = patch.name
  if (patch.shared !== undefined) set.shared = patch.shared
  const [row] = await database
    .update(codexSavedViews)
    .set(set)
    .where(and(eq(codexSavedViews.id, id), ownerIs(viewerEmail)))
    .returning()
  if (!row) return { ok: false, reason: "not_found" }
  return { ok: true, view: savedViewRowToApi(row, viewerEmail) }
}

export async function deleteSavedView(
  id: number,
  viewerEmail: string,
  database: Db = db,
  canUseScreen?: ScreenCheck
): Promise<SavedViewDeleteResult> {
  const access = await ownership(database, id, viewerEmail, canUseScreen)
  if (!access.ok) return access
  const rows = await database
    .delete(codexSavedViews)
    .where(and(eq(codexSavedViews.id, id), ownerIs(viewerEmail)))
    .returning({ id: codexSavedViews.id })
  return rows.length > 0 ? { ok: true } : { ok: false, reason: "not_found" }
}
