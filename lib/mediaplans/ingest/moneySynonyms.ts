/**
 * Deterministic money-header synonyms so common stated-total columns
 * resolve without AVA. Grand totals stay the reconciliation scrape target.
 */

import { parseMoneyCell, RECONCILIATION_BLOCK_PCT } from "@/lib/mediaplans/ingest/moneyTargets"
import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"

export const MONEY_STATED_SYNONYMS = [
  "client total",
  "media value",
  "total investment",
] as const

const MEDIA_MONEY_TARGETS = new Set([
  "media_rate:weekly",
  "media_rate:lunar",
  "media_rate:per_spot",
  "media_amount:stated",
])

export type MoneyColumnClass = "per_line" | "grand_total" | "not_synonym"

function headerKey(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase()
}

export function isStatedMoneySynonym(header: string): boolean {
  const key = headerKey(header)
  return MONEY_STATED_SYNONYMS.some(
    (s) => key === s || key.startsWith(`${s} `) || key.startsWith(`${s}(`),
  )
}

export function classifyMoneyColumn(args: {
  header: string
  values: string[]
  fileStatedTotal: number | null
}): MoneyColumnClass {
  if (!isStatedMoneySynonym(args.header)) return "not_synonym"
  const nums = args.values
    .map((v) => parseMoneyCell(v))
    .filter((n): n is number => n != null && n > 0)
  if (nums.length === 0) return "not_synonym"
  const sum = nums.reduce((s, n) => s + n, 0)
  const stated = args.fileStatedTotal
  if (stated != null && stated > 0) {
    const deltaPct = Math.abs(sum - stated) / stated
    if (deltaPct <= RECONCILIATION_BLOCK_PCT) return "per_line"
    return "grand_total"
  }
  const distinct = new Set(nums)
  if (distinct.size <= 3 && nums.length > distinct.size * 2) return "grand_total"
  return "per_line"
}

function profileHasMediaMoney(profile: PublisherProfileConfig): boolean {
  return Object.values(profile.column_map).some((v) => MEDIA_MONEY_TARGETS.has(v))
}

/**
 * Overlay a per-line stated-money synonym onto column_map when the profile
 * has no media money yet. Never maps a repeating campaign/grand total.
 */
export function overlayMoneySynonyms(
  profile: PublisherProfileConfig,
  shape: DetectedSheetShape,
): PublisherProfileConfig {
  if (profileHasMediaMoney(profile)) return profile

  const mappedKeys = new Set(
    Object.keys(profile.column_map).map((k) => headerKey(k)),
  )

  for (const d of shape.descriptor_columns) {
    if (mappedKeys.has(headerKey(d.header))) continue
    if (!isStatedMoneySynonym(d.header)) continue
    const values = shape.data_rows.map((r) => shape.matrix[r]?.[d.col] ?? "")
    const klass = classifyMoneyColumn({
      header: d.header,
      values,
      fileStatedTotal: shape.file_stated_total,
    })
    if (klass !== "per_line") continue
    return {
      ...profile,
      column_map: {
        ...profile.column_map,
        [d.header]: "media_amount:stated",
      },
    }
  }
  return profile
}
