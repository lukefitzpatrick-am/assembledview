/**
 * The one migration marker reader (B48). A migration that code depends on
 * writes a `migration_markers` row; code asks `isMarkerApplied(key)`.
 *
 * - A marker once seen stays applied for the process (markers are never
 *   removed), so an applied migration costs one read per instance.
 * - A missing marker is read again after MARKER_RECHECK_MS, so a migration
 *   that has not run costs one read a minute, not one per request.
 * - A failed read is not cached and counts as not applied.
 *
 * shortcut: cached per instance, not per request; a marker deleted by hand
 * stays applied until the instance restarts. Upgrade if markers ever move
 * backwards.
 *
 * A switch whose code needs a migration names the marker in the registry
 * (`requiresMarker`): it reads off and can't be turned on until the marker
 * exists, so code behind it never checks the marker again.
 */
import "server-only"

import { eq } from "drizzle-orm"

import { getDb, type Db } from "@/db"
import { migrationMarkers } from "@/db/schema"

export const MARKER_RECHECK_MS = 60_000

type MarkerReader = (key: string) => Promise<boolean>

const seen = new Set<string>()
const missingUntil = new Map<string, number>()
let testReader: MarkerReader | null = null

/** `database`: a transaction or test database to read through (default the app database). */
export async function isMarkerApplied(key: string, database?: Pick<Db, "select">): Promise<boolean> {
  if (seen.has(key)) return true
  const now = Date.now()
  if (now < (missingUntil.get(key) ?? 0)) return false
  try {
    const applied = testReader
      ? await testReader(key)
      : (
          await (database ?? getDb())
            .select({ key: migrationMarkers.key })
            .from(migrationMarkers)
            .where(eq(migrationMarkers.key, key))
            .limit(1)
        ).length > 0
    if (applied) seen.add(key)
    else missingUntil.set(key, now + MARKER_RECHECK_MS)
    return applied
  } catch (err) {
    console.warn(`[markers] ${key} read failed; not applied`, err)
    return false
  }
}

/** Tests only: answer from `reader` (null: the database) and forget every cached answer. */
export function setMarkerReaderForTests(reader: MarkerReader | null): void {
  testReader = reader
  seen.clear()
  missingUntil.clear()
}
