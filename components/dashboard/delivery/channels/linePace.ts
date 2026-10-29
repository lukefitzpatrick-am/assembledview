import type { FeePctsByVersionId } from "@/lib/delivery/directDigitalFeeLookup"
import {
  expectedForWindow,
  impressionsNotTracked,
  NO_IMPRESSION_TRACKING,
  plannedTotal,
  sumInWindow,
  type NetSpendBasis,
  type PacingWindow,
} from "@/lib/pacing/expectedForWindow"

/** Optional pacing inputs every spend channel adapter accepts. */
export type ChannelPacingInputs = {
  /** Fee percents by version id, for netting fee-inclusive spend goals. */
  feePctsByVersionId?: FeePctsByVersionId
  /** Version id used when a line carries none. */
  estimateVersionId?: number | null
  /** Override "to date" (defaults to Melbourne yesterday, capped at campaign end). Tests pass a fixed day. */
  pacingAsAtISO?: string
}

export type PaceFigures = {
  delivered: number
  /** Expected for the selected window. */
  expected: number
  /** Expected campaign start to as at, no filter. */
  expectedToDate: number
  planned: number
}

export type LinePace = {
  spend: PaceFigures
  deliverables: PaceFigures & {
    /** False when the line has clicks but no impressions in the window ("No impression tracking"). */
    tracked: boolean
  }
}

export type LinePaceDay = {
  date: string
  spend: number
  deliverable: number
  impressions?: number
  clicks?: number
}

/**
 * One line's delivered and expected figures for the window.
 * A line whose deliverable is impressions and that has clicks but no
 * impressions in the window has no impression tracking: it is left out of
 * expected impressions, and the card and line read "No impression tracking",
 * the same label as Direct Booked Digital (REP-5; Luke, 29 Oct 2026).
 * Decided on the window: programmatic and social daily rows arrive already
 * cut to the date filter, so the whole delivery is not available here.
 */
export function computeLinePace(input: {
  rawBursts: unknown
  daily: readonly LinePaceDay[]
  window: PacingWindow
  toDate: PacingWindow
  basis?: NetSpendBasis | null
  deliverableIsImpressions: boolean
}): LinePace {
  const { rawBursts, daily, window, toDate, basis, deliverableIsImpressions } = input
  const deliveredSpend = sumInWindow(daily, window, (d) => d.spend)
  const deliveredDeliverables = sumInWindow(daily, window, (d) => d.deliverable)
  const tracked = deliverableIsImpressions
    ? !impressionsNotTracked({
        impressions: sumInWindow(daily, window, (d) => d.impressions ?? d.deliverable),
        clicks: sumInWindow(daily, window, (d) => d.clicks ?? 0),
      })
    : true
  return {
    spend: {
      delivered: deliveredSpend,
      expected: expectedForWindow(rawBursts, "spend", window, basis),
      expectedToDate: expectedForWindow(rawBursts, "spend", toDate, basis),
      planned: plannedTotal(rawBursts, "spend", basis),
    },
    deliverables: {
      delivered: deliveredDeliverables,
      expected: tracked ? expectedForWindow(rawBursts, "deliverables", window) : 0,
      expectedToDate: tracked ? expectedForWindow(rawBursts, "deliverables", toDate) : 0,
      planned: plannedTotal(rawBursts, "deliverables"),
      tracked,
    },
  }
}

function addFigures(a: PaceFigures, b: PaceFigures): PaceFigures {
  return {
    delivered: a.delivered + b.delivered,
    expected: a.expected + b.expected,
    expectedToDate: a.expectedToDate + b.expectedToDate,
    planned: a.planned + b.planned,
  }
}

const ZERO: PaceFigures = { delivered: 0, expected: 0, expectedToDate: 0, planned: 0 }

/** Channel totals: the sum of its lines. */
export function sumLinePaces(paces: readonly LinePace[]): LinePace {
  return paces.reduce<LinePace>(
    (acc, p) => ({
      spend: addFigures(acc.spend, p.spend),
      deliverables: {
        ...addFigures(acc.deliverables, p.deliverables),
        tracked: acc.deliverables.tracked && p.deliverables.tracked,
      },
    }),
    { spend: { ...ZERO }, deliverables: { ...ZERO, tracked: true } },
  )
}

/** Card note when some lines have no impression tracking. */
export function untrackedNote(paces: readonly LinePace[]): string | null {
  const n = paces.filter((p) => !p.deliverables.tracked).length
  if (n === 0) return null
  return `${NO_IMPRESSION_TRACKING} on ${n} ${n === 1 ? "line" : "lines"}`
}

/** Line note for a line with no impression tracking. */
export function untrackedLineNote(pace: LinePace): string | null {
  return pace.deliverables.tracked ? null : NO_IMPRESSION_TRACKING
}
