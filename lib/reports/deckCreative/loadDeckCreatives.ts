import "server-only"

import sharp from "sharp"

import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { isCreativePerformanceEnabled } from "@/lib/creative/performance/featureFlag"
import { getCreativePerformance } from "@/lib/creative/performance/getCreativePerformance"
import { loadDashboardPreviews } from "@/lib/creative/previews/lookup"
import { logJob } from "@/lib/log"

import { selectDeckCreatives, uniqueDeckCreatives, withImageFiles, type DeckCreatives } from "./select"

/** Longest side of a deck thumbnail, in pixels. Cards are about 1.3 x 1.6 inches. */
const THUMB_PX = 600
/**
 * The skill container takes at most 16 files per request (Anthropic: "Cannot add
 * more than 16 files to a session at once"). The deck already sends report-data.json,
 * the template and 3 cover photos, which leaves 11 for creative thumbnails.
 */
export const MAX_DECK_CREATIVE_IMAGES = 11
const MAX_IMAGES = MAX_DECK_CREATIVE_IMAGES

export type DeckCreativeFile = { filename: string; bytes: Buffer }

export type LoadedDeckCreatives = { creatives: DeckCreatives; files: DeckCreativeFile[] }

async function blobBytes(pathname: string): Promise<Buffer | null> {
  const blob = await getPrivateBlob(pathname)
  if (!blob || blob.statusCode !== 200 || !blob.stream) return null
  return Buffer.from(await new Response(blob.stream).arrayBuffer())
}

/**
 * Creative rows and thumbnails for a report deck. Reads only creatives that
 * delivered on this MBA in the window (so only this client's images). Any
 * failure returns null and the deck builds without creative slides.
 */
export async function loadDeckCreatives(input: {
  mbaNumber: string
  from: string
  to: string
}): Promise<LoadedDeckCreatives | null> {
  if (!isCreativePerformanceEnabled("")) return null
  try {
    const rows = await getCreativePerformance({ ...input, sort: "impressions" })
    const selected = selectDeckCreatives(rows)
    const unique = uniqueDeckCreatives(selected)
    if (unique.length === 0) return null

    const cache = await loadDashboardPreviews(
      unique.map((row) => ({ platform: row.platformKey, creativeKey: row.creativeKey })),
    )
    const blobByKey = new Map(
      cache
        .filter((row) => row.blobPathname)
        .map((row) => [`${row.platform}|${row.creativeKey}`, row.blobPathname as string]),
    )

    const files: DeckCreativeFile[] = []
    const fileByKey = new Map<string, string>()
    for (const row of unique) {
      if (files.length >= MAX_IMAGES) break
      const key = `${row.platformKey}|${row.creativeKey}`
      const pathname = blobByKey.get(key)
      if (!pathname) continue
      try {
        const raw = await blobBytes(pathname)
        if (!raw) continue
        const bytes = await sharp(raw, { animated: false })
          .rotate()
          .resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 80 })
          .toBuffer()
        const filename = `creative-${files.length + 1}.jpg`
        files.push({ filename, bytes })
        fileByKey.set(key, filename)
      } catch (err) {
        logJob("[deck-creative] thumbnail skipped", {
          key,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return { creatives: withImageFiles(selected, fileByKey), files }
  } catch (err) {
    logJob("[deck-creative] creatives skipped", {
      mbaNumber: input.mbaNumber,
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
