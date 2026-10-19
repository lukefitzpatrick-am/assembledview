import "server-only"

import { and, eq, inArray } from "drizzle-orm"

import { getDb } from "@/db"
import { creativePreviewCache } from "@/db/schema"

import { isPreviewPlatform } from "./core"
import type { DashboardPreviewCacheRow } from "./dashboard"
import { readPreviewCacheGate } from "./markers"

/**
 * Cache rows for the given creatives. Empty until 0098 and 0102 are applied
 * (the 0102 columns are not read before then). A read error is empty, so the
 * dashboard falls back to icon tiles.
 */
export async function loadDashboardPreviews(
  creatives: ReadonlyArray<{ platform: string; creativeKey: string }>,
): Promise<DashboardPreviewCacheRow[]> {
  const keysByPlatform = new Map<string, Set<string>>()
  for (const row of creatives) {
    const platform = row.platform.trim().toLowerCase()
    if (!isPreviewPlatform(platform) || !row.creativeKey) continue
    const keys = keysByPlatform.get(platform) ?? new Set<string>()
    keys.add(row.creativeKey)
    keysByPlatform.set(platform, keys)
  }
  if (keysByPlatform.size === 0) return []

  const gate = await readPreviewCacheGate()
  if (!gate.ready) return []

  try {
    const db = getDb()
    const batches = await Promise.all(
      [...keysByPlatform].map(([platform, keys]) =>
        db
          .select({
            platform: creativePreviewCache.platform,
            creativeKey: creativePreviewCache.creativeKey,
            blobPathname: creativePreviewCache.blobPathname,
            previewKind: creativePreviewCache.previewKind,
            viewUrl: creativePreviewCache.viewUrl,
            sourceHash: creativePreviewCache.sourceHash,
          })
          .from(creativePreviewCache)
          .where(
            and(
              eq(creativePreviewCache.platform, platform),
              inArray(creativePreviewCache.creativeKey, [...keys]),
            ),
          ),
      ),
    )
    return batches.flat()
  } catch (err) {
    console.warn("[creative-previews] dashboard preview read failed", err)
    return []
  }
}
