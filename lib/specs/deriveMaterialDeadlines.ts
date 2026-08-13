/**
 * Material-deadline derivation. Reads ONLY structured min/max/business columns.
 * Prose-only publishers contribute nothing. Never invents a date.
 */

import { addSydneyDays, sydneyCivilParts } from "@/lib/codex/quickAddParse"
import { weekdayOfSydneyYmd } from "@/lib/codex/recurringRule"
import type { StructuredDeadline } from "./parseSupplyDeadline.js"
import {
  subtractSydneyBusinessDays,
  sydneyBusinessDaysUntil,
} from "./sydneyBusinessDays.js"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const

export type MaterialDeadlineLine = {
  publisherKey: string
  publisherLabel: string
  mediaType?: string
  formatLabel?: string
  liveYmd: string
  structured: StructuredDeadline | null
}

/** Explicit manual override — never inferred from display ≠ derivation (billing rule). */
export type DeadlineOverride = {
  publisherKey: string
  derivedYmd: string
  overrideYmd: string
  overriddenBy: string
  overriddenAt: string
}

export type PerLineMaterialDate = {
  publisherKey: string
  publisherLabel: string
  derivedYmd: string | null
  maxDays: number | null
}

export type MaterialDeadlineStripItem = {
  publisherKey: string
  publisherLabel: string
  displayYmd: string
  derivedYmd: string
  urgent: boolean
  maxDays: number
  override: DeadlineOverride | null
}

export type MaterialDeadlineResult = {
  earliestMaterialYmd: string | null
  coverText: string
  provenance: string
  publishersWithoutStated: number
  perLine: PerLineMaterialDate[]
  stripItems: MaterialDeadlineStripItem[]
}

export function formatSydneyDeadlineLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  const wd = weekdayOfSydneyYmd(ymd)
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`
}

export function formatSupplyDeadlineCell(prose: string, derivedYmd: string | null): string {
  const stated = prose.trim()
  if (!stated) return derivedYmd ? `due ${formatSydneyDeadlineLabel(derivedYmd)}` : ""
  if (!derivedYmd) return stated
  return `${stated} — due ${formatSydneyDeadlineLabel(derivedYmd)}`
}

export function liveInstantToSydneyYmd(live: string | null | undefined): string {
  const raw = (live ?? "").trim()
  if (!raw) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ""
  return sydneyCivilParts(parsed).ymd
}

export function materialDateForLine(
  liveYmd: string,
  structured: StructuredDeadline | null,
): string | null {
  if (!structured) return null
  const live = liveYmd.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(live)) return null
  const n = structured.max_days
  if (!Number.isFinite(n) || n < 1) return null
  if (structured.business_days) return subtractSydneyBusinessDays(live, n)
  return addSydneyDays(live, -n)
}

function withoutStatedPhrase(n: number): string {
  return `${n} publisher${n === 1 ? "" : "s"} without stated deadlines`
}

export function recordDeadlineOverride(
  existing: DeadlineOverride[],
  next: DeadlineOverride,
): DeadlineOverride[] {
  if (
    !next.publisherKey.trim()
    || !next.derivedYmd.trim()
    || !next.overrideYmd.trim()
    || !next.overriddenBy.trim()
    || !next.overriddenAt.trim()
  ) {
    throw new Error("override must record who/when/value")
  }
  return [
    ...existing.filter((row) => row.publisherKey !== next.publisherKey),
    next,
  ]
}

export function deriveMaterialDeadlines(args: {
  lines: MaterialDeadlineLine[]
  overrides?: DeadlineOverride[]
  asOfYmd: string
}): MaterialDeadlineResult {
  const overrideByKey = new Map(
    (args.overrides ?? []).map((row) => [row.publisherKey, row]),
  )

  const perLine: PerLineMaterialDate[] = args.lines.map((row) => ({
    publisherKey: row.publisherKey,
    publisherLabel: row.publisherLabel,
    derivedYmd: materialDateForLine(row.liveYmd, row.structured),
    maxDays: row.structured?.max_days ?? null,
  }))

  const publisherKeys = [...new Set(args.lines.map((row) => row.publisherKey).filter(Boolean))]
  const statedKeys = new Set(
    args.lines
      .filter((row) => row.structured != null)
      .map((row) => row.publisherKey),
  )
  const publishersWithoutStated = publisherKeys.filter((key) => !statedKeys.has(key)).length

  type Acc = {
    publisherKey: string
    publisherLabel: string
    derivedYmd: string
    maxDays: number
  }
  const nearestByPublisher = new Map<string, Acc>()
  for (let i = 0; i < args.lines.length; i += 1) {
    const line = args.lines[i]!
    const derived = perLine[i]!.derivedYmd
    if (!derived || !line.publisherKey) continue
    const prev = nearestByPublisher.get(line.publisherKey)
    if (!prev || derived < prev.derivedYmd) {
      nearestByPublisher.set(line.publisherKey, {
        publisherKey: line.publisherKey,
        publisherLabel: line.publisherLabel,
        derivedYmd: derived,
        maxDays: line.structured?.max_days ?? 0,
      })
    }
  }

  const stripItems: MaterialDeadlineStripItem[] = [...nearestByPublisher.values()]
    .map((acc) => {
      const override = overrideByKey.get(acc.publisherKey) ?? null
      const displayYmd = override?.overrideYmd ?? acc.derivedYmd
      return {
        publisherKey: acc.publisherKey,
        publisherLabel: acc.publisherLabel,
        displayYmd,
        derivedYmd: acc.derivedYmd,
        urgent: sydneyBusinessDaysUntil(args.asOfYmd, displayYmd) <= 5,
        maxDays: acc.maxDays,
        override,
      }
    })
    .toSorted((a, b) => a.displayYmd.localeCompare(b.displayYmd)
      || a.publisherLabel.localeCompare(b.publisherLabel))

  let winner: MaterialDeadlineStripItem | null = null
  for (const item of stripItems) {
    if (!winner || item.displayYmd < winner.displayYmd) winner = item
  }

  // Codex earliest is the derivation, never the override. Cover display uses override when recorded.
  const coverDateYmd = winner?.displayYmd ?? null
  const derivedEarliest = stripItems.length === 0
    ? null
    : stripItems.reduce(
        (min, item) => (item.derivedYmd < min ? item.derivedYmd : min),
        stripItems[0]!.derivedYmd,
      )

  const provenance = winner
    ? `(${winner.publisherLabel}: ${winner.maxDays} wd before live)`
    : ""

  const parts: string[] = []
  if (coverDateYmd && winner) {
    const dateLabel = formatSydneyDeadlineLabel(coverDateYmd)
    if (winner.override && winner.derivedYmd !== winner.displayYmd) {
      parts.push(
        `${dateLabel} ${provenance.replace(/\)$/, `; derived ${formatSydneyDeadlineLabel(winner.derivedYmd)})`)}`,
      )
    } else {
      parts.push(`${dateLabel} ${provenance}`)
    }
  }
  if (publishersWithoutStated > 0) {
    parts.push(withoutStatedPhrase(publishersWithoutStated))
  }

  return {
    earliestMaterialYmd: derivedEarliest,
    coverText: parts.join("; "),
    provenance,
    publishersWithoutStated,
    perLine,
    stripItems,
  }
}
