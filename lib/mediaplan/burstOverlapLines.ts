/**
 * B35 (DQ-5, switch `burst_overlap_warning`): every line on the plan with two
 * bursts whose dates overlap, for a page-level warning on the create and edit
 * pages. The card already shows its own banner (`ExpertCard`); this lists them
 * in one place so a collapsed card is not missed. Warn only, never blocks.
 *
 * Same rule as the card (`findOverlappingBursts`: Sydney civil days, both
 * ends inclusive; missing or end-before-start bursts are left out). Pure.
 */

import type { BuilderIssue } from "@/lib/mediaplan/builderIssues"
import {
  describeBurstOverlap,
  findOverlappingBursts,
  type BurstDates,
  type BurstOverlap,
} from "@/lib/mediaplan/burstOverlap"

export type BurstOverlapLineInput = {
  line_item_id?: unknown
  lineItemId?: unknown
  bursts?: unknown
  bursts_json?: unknown
}

export type BurstOverlapLine = {
  /** Line item id, or `<channel> line <n>` when the line has none yet. */
  lineLabel: string
  channel: string
  overlaps: BurstOverlap[]
}

function burstsOf(line: BurstOverlapLineInput): BurstDates[] {
  if (Array.isArray(line.bursts)) return line.bursts as BurstDates[]
  const raw = line.bursts_json
  if (Array.isArray(raw)) return raw as BurstDates[]
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as BurstDates[]) : []
    } catch {
      return []
    }
  }
  return []
}

/** Lines with at least one overlapping pair, in channel order then line order. */
export function findLinesWithOverlappingBursts(
  linesByChannel: Readonly<Record<string, readonly BurstOverlapLineInput[] | null | undefined>>
): BurstOverlapLine[] {
  const out: BurstOverlapLine[] = []
  for (const [channel, lines] of Object.entries(linesByChannel)) {
    ;(lines ?? []).forEach((line, index) => {
      if (!line) return
      const overlaps = findOverlappingBursts(burstsOf(line))
      if (overlaps.length === 0) return
      const id = String(line.line_item_id ?? line.lineItemId ?? "").trim()
      out.push({ lineLabel: id || `${channel} line ${index + 1}`, channel, overlaps })
    })
  }
  return out
}

/** One warning per line, naming its first overlap (and how many more). Never an error. */
export function burstOverlapBuilderIssues(lines: readonly BurstOverlapLine[]): BuilderIssue[] {
  return lines.map((line) => {
    const [first, ...rest] = line.overlaps
    const more = rest.length > 0 ? ` And ${rest.length} more overlapping pair${rest.length === 1 ? "" : "s"}.` : ""
    return {
      id: `burst-overlap:${line.channel}:${line.lineLabel}`,
      severity: "warning",
      title: `Bursts overlap (${line.lineLabel})`,
      detail: `${describeBurstOverlap(first!)}${more} Check the dates. Does not block save.`,
      stepLabel: "Media",
      fieldLabel: "Burst dates",
    }
  })
}

/** Save rail line, or null when no line overlaps. */
export function burstOverlapRailText(lines: readonly BurstOverlapLine[]): string | null {
  if (lines.length === 0) return null
  const named = lines.slice(0, 3).map((l) => l.lineLabel).join(", ")
  const more = lines.length > 3 ? ` and ${lines.length - 3} more` : ""
  return `${lines.length === 1 ? "1 line has" : `${lines.length} lines have`} overlapping bursts (${named}${more}). Check the dates; saving is not blocked.`
}
