/**
 * Tip-scope helpers for X7 line-item snapshot parity.
 *
 * PG tip = `media_plan_masters.published_version_id`.
 * Xano channel rows join via `media_plan_version` FK (= that version id),
 * falling back to `(mba_number, version_number)` when the FK is absent.
 */

import type { XanoLineItem } from "@/lib/xano/fetchAllLineItems"

export type PublishedTipPointer = {
  mba_number: string
  master_id: number
  published_version_id: number
  version_number: number
  published_campaign_status: string | null
}

export type TipScopeStats = {
  input: number
  kept: number
  dropped_no_tip_master: number
  dropped_version_mismatch: number
  dropped_missing_version_fields: number
}

function normaliseMba(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
}

/** Index tip pointers by normalised MBA. */
export function indexTipPointersByMba(
  tips: PublishedTipPointer[]
): Map<string, PublishedTipPointer> {
  const map = new Map<string, PublishedTipPointer>()
  for (const tip of tips) {
    map.set(normaliseMba(tip.mba_number), tip)
  }
  return map
}

/**
 * Keep only crawled Xano rows that belong to a PG published tip version.
 * Rows for MBAs with no published pointer, or wrong version, are dropped.
 */
export function filterXanoItemsToPublishedTips(
  items: XanoLineItem[],
  tips: PublishedTipPointer[]
): { items: XanoLineItem[]; stats: TipScopeStats } {
  const byMba = indexTipPointersByMba(tips)
  const kept: XanoLineItem[] = []
  let dropped_no_tip_master = 0
  let dropped_version_mismatch = 0
  let dropped_missing_version_fields = 0

  for (const item of items) {
    const tip = byMba.get(normaliseMba(item.mba_number))
    if (!tip) {
      dropped_no_tip_master += 1
      continue
    }

    const fk = item.media_plan_version_id
    const vn = item.version_number
    const fkMatch = fk != null && Number.isFinite(fk) && fk === tip.published_version_id
    const vnMatch = vn != null && Number.isFinite(vn) && vn === tip.version_number

    // Prefer FK (== PG published_version_id); also accept version_number match
    // so Root-Cause-C rows (version number stuffed into media_plan_version) still tip-scope.
    if (fkMatch || vnMatch) {
      kept.push(item)
      continue
    }

    if (
      (fk == null || !Number.isFinite(fk)) &&
      (vn == null || !Number.isFinite(vn))
    ) {
      dropped_missing_version_fields += 1
      continue
    }

    dropped_version_mismatch += 1
  }

  return {
    items: kept,
    stats: {
      input: items.length,
      kept: kept.length,
      dropped_no_tip_master,
      dropped_version_mismatch,
      dropped_missing_version_fields,
    },
  }
}
