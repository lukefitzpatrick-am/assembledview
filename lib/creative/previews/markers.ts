import "server-only"

import { inArray } from "drizzle-orm"

import { getDb } from "@/db"
import { migrationMarkers } from "@/db/schema"

import { previewCacheGate, PREVIEW_MARKER_0098, PREVIEW_MARKER_0102, type PreviewCacheGate } from "./gate"

/** Reads both markers. Any read error counts as not applied. */
export async function readPreviewCacheGate(): Promise<PreviewCacheGate> {
  try {
    const rows = await getDb()
      .select({ key: migrationMarkers.key })
      .from(migrationMarkers)
      .where(inArray(migrationMarkers.key, [PREVIEW_MARKER_0098, PREVIEW_MARKER_0102]))
    return previewCacheGate(rows.map((row) => row.key))
  } catch (err) {
    console.warn("[creative-previews] could not read migration_markers", err)
    return previewCacheGate([])
  }
}
