/**
 * Line ids are never reused within a plan (Luke, 29 Oct 2026).
 *
 * Pacing (`LINE_ITEM_LABEL_MAP`, platform names), billing (`schedule_months`),
 * finance and creative all key on `line_item_id`. An id that an earlier
 * version used for a different line would attach that line's delivery or
 * billing to the new one.
 *
 * "Same line" vs "new line": a line whose id is on the version this save
 * continues from (the fork base, or for a draft overwrite the version being
 * overwritten) is the same line and keeps its id. Any other id that appears
 * on another version of the plan was retired when that line was deleted, so
 * a save that brings it back on a line is refused.
 *
 * Pure. The save path loads the history (`lib/data/lineIdHistory.ts`).
 */

import type { SavePlanMode } from "@/lib/data/savePlan"

export type LineIdHistoryVersion = {
  versionId: number
  versionNumber: number
}

export type LineIdHistoryRow = {
  versionId: number
  lineItemId: string
}

export type RetiredLineIdReuse = {
  lineItemId: string
  /** Highest version number the id appeared on before this save. */
  lastVersionNumber: number
}

function norm(id: unknown): string {
  return String(id ?? "").trim().toLowerCase()
}

/**
 * Versions whose lines this save continues.
 * - Draft overwrite: the target version (its current rows, read before the
 *   replace-set), plus the fork base.
 * - Fork base: `baseVersionId` when it is a version of this plan; otherwise
 *   the highest version number other than the target (the same rule the
 *   billing-override carry uses: base, else tip).
 */
export function resolveContinuingVersionIds(args: {
  mode: SavePlanMode
  versions: readonly LineIdHistoryVersion[]
  targetVersionId: number
  baseVersionId?: number | null
}): number[] {
  const out = new Set<number>()
  if (args.mode === "draft") out.add(args.targetVersionId)

  const base =
    args.baseVersionId != null
      ? args.versions.find((v) => v.versionId === args.baseVersionId)
      : undefined
  if (base) {
    out.add(base.versionId)
  } else {
    let tip: LineIdHistoryVersion | null = null
    for (const v of args.versions) {
      if (v.versionId === args.targetVersionId) continue
      if (!tip || v.versionNumber > tip.versionNumber) tip = v
    }
    if (tip) out.add(tip.versionId)
  }
  return [...out]
}

/**
 * Incoming ids that an earlier version used and the continuing versions do
 * not carry. Case-insensitive. Sorted by id for a stable message.
 */
export function findRetiredLineIdReuse(args: {
  versions: readonly LineIdHistoryVersion[]
  rows: readonly LineIdHistoryRow[]
  continuingVersionIds: readonly number[]
  incomingLineItemIds: readonly string[]
}): RetiredLineIdReuse[] {
  const continuing = new Set(args.continuingVersionIds)
  const versionNumberById = new Map(
    args.versions.map((v) => [v.versionId, v.versionNumber] as const),
  )

  const carried = new Set<string>()
  const lastSeen = new Map<string, number>()
  for (const row of args.rows) {
    const id = norm(row.lineItemId)
    if (!id) continue
    if (continuing.has(row.versionId)) {
      carried.add(id)
      continue
    }
    const vn = versionNumberById.get(row.versionId) ?? 0
    if (vn > (lastSeen.get(id) ?? -1)) lastSeen.set(id, vn)
  }

  const out: RetiredLineIdReuse[] = []
  const reported = new Set<string>()
  for (const raw of args.incomingLineItemIds) {
    const id = norm(raw)
    if (!id || reported.has(id) || carried.has(id)) continue
    const last = lastSeen.get(id)
    if (last === undefined) continue
    reported.add(id)
    out.push({ lineItemId: String(raw).trim(), lastVersionNumber: last })
  }
  return out.sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
}

/** User-facing refusal. Names every id and the version it last appeared on. */
export function retiredLineIdMessage(reuse: readonly RetiredLineIdReuse[]): string {
  const list = reuse
    .map((r) => `${r.lineItemId} (last used in v${r.lastVersionNumber})`)
    .join(", ")
  const plural = reuse.length === 1 ? "This line ID was" : "These line IDs were"
  return (
    `${plural} deleted in an earlier version of this plan and can't come back on a line: ${list}. ` +
    "Line IDs are never reused. Delete the line and add it again so it gets a new ID, then save."
  )
}
