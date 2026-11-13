/**
 * The 0118 marker (Codex S1, B38): is migration 0118_codex_s1_projects
 * applied? Its own module (B40) so lib/codex/repo.ts can ask without
 * importing the projects store (which imports repo.ts).
 *
 * Once seen, the marker is cached for the process. A "not there" answer is
 * cached for PROJECTS_MARKER_RECHECK_MS so a missing migration costs one
 * query a minute, not one per request. A failed read is not cached.
 */
import "server-only"

import { eq } from "drizzle-orm"

import { db, schema, type Db } from "@/db"

const { migrationMarkers } = schema

export const PROJECTS_MARKER = "0118_codex_s1_projects"

/** How long a "not applied" answer is kept before the marker is read again. */
export const PROJECTS_MARKER_RECHECK_MS = 60_000

/** A database or an open transaction: anything with Drizzle's select. */
type MarkerReader = Pick<Db, "select">

let markerSeen = false
let missingUntil = 0

/** Test hook. */
export function resetProjectsMarkerCacheForTests(): void {
  markerSeen = false
  missingUntil = 0
}

/** A query found a 0118 table or column missing: read the marker again next time. */
export function forgetProjectsMarker(): void {
  markerSeen = false
}

export async function isProjectsMigrationApplied(database: MarkerReader = db, now = Date.now()): Promise<boolean> {
  if (markerSeen) return true
  if (now < missingUntil) return false
  try {
    const rows = await database
      .select({ key: migrationMarkers.key })
      .from(migrationMarkers)
      .where(eq(migrationMarkers.key, PROJECTS_MARKER))
      .limit(1)
    markerSeen = rows.length > 0
    if (!markerSeen) missingUntil = now + PROJECTS_MARKER_RECHECK_MS
    return markerSeen
  } catch (err) {
    console.warn("[codex-projects] marker read failed", err)
    return false
  }
}
