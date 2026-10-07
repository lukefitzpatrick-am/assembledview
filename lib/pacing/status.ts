/**
 * UI pacing status — one vocabulary for summary tiles and Status columns.
 * Thresholds mirror `computeStatus` in maths/index.ts; do not change values here.
 */

import { KPI_ROW_STATUS, PACING_UI_STATUS, TONE_TEXT, type Tone } from "@/lib/design/status"
import type { PacingStatus } from "@/lib/pacing/maths"
import type { RowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus"

/** Six bands shown on Key metrics tiles (KPI Pending is orthogonal to spend maths). */
export type UiPacingStatus =
  | "behind"
  | "on-track"
  | "ahead"
  | "over-pacing"
  | "no-data"
  | "kpi-pending"

/** Spend/delivery Status column bands (excludes KPI Pending). */
export type SpendPacingBand = Exclude<UiPacingStatus, "kpi-pending">

/** Semantic colour role — map to existing design tokens only. */
export type PacingColourRole = "ok" | "attention" | "problem"

export type BadgeToneVariant =
  | "on-track"
  | "attention"
  | "behind"
  | "critical"
  | "secondary"

export type ResolvedPacingStatus = {
  status: SpendPacingBand
  label: string
  role: PacingColourRole
  badgeVariant: Tone
  /** Text colour utility for summary tiles / legend. */
  textClass: string
}

/**
 * Documented thresholds (same numbers as `computeStatus` / KPI helpers).
 * Legend UI reads these — never invent a second band in components.
 */
export const PACING_STATUS_THRESHOLDS = {
  /** |projectionVariancePct| ≤ this → on track (95–105% of projected). */
  onTrackAbsProjectionVariance: 0.05,
  /** Mild ahead/behind band upper bound (exclusive of over-pacing). */
  mildBandAbsProjectionVariance: 0.15,
  /** projectionVariancePct ≥ this → over-pacing. */
  overPacingMinProjectionVariance: 0.15,
  /** spendToDate === 0 and daysPassed ≥ this → no_delivery (counts as Behind). */
  noDeliveryMinDaysPassed: 2,
  /** KPI actual within this fraction of target counts on-track. */
  kpiTolerance: 0.1,
} as const

/** Role compatibility only. Band colour comes from `PACING_UI_STATUS`, never from this map. */
export const ROLE_STYLES: Record<
  PacingColourRole,
  { badgeVariant: BadgeToneVariant; textClass: string }
> = {
  ok: { badgeVariant: "on-track", textClass: TONE_TEXT.action },
  attention: { badgeVariant: "attention", textClass: TONE_TEXT.attention },
  problem: { badgeVariant: "critical", textClass: TONE_TEXT.critical },
}

const BAND_META: Record<
  SpendPacingBand,
  { label: string; role: PacingColourRole }
> = {
  "on-track": { label: "On track", role: "ok" },
  // Ahead-of-pace on a booked budget is attention, not success green.
  ahead: { label: "Ahead", role: "attention" },
  behind: { label: "Behind", role: "attention" },
  "over-pacing": { label: "Over-pacing", role: "problem" },
  "no-data": { label: "No data", role: "problem" },
}

function resolveBand(status: SpendPacingBand): ResolvedPacingStatus {
  const meta = BAND_META[status]
  const tone = PACING_UI_STATUS[status].tone
  return {
    status,
    label: meta.label,
    role: meta.role,
    badgeVariant: tone,
    textClass: TONE_TEXT[tone],
  }
}

/**
 * Map maths `PacingStatus` → UI spend band + label + colour role.
 * Single source for tiles (via overview mapping) and Status cells.
 */
export function pacingStatus(maths: PacingStatus): ResolvedPacingStatus {
  switch (maths) {
    case "on_track":
    case "completed":
      return resolveBand("on-track")
    case "slightly_over":
      return resolveBand("ahead")
    case "over_pacing":
      return resolveBand("over-pacing")
    case "slightly_under":
    case "under_pacing":
    case "no_delivery":
      return resolveBand("behind")
    case "not_started":
    case "unknown":
      return resolveBand("no-data")
    default: {
      const _exhaustive: never = maths
      return _exhaustive
    }
  }
}

/** Resolve display metadata when the row already carries a spend band. */
export function pacingStatusFromBand(band: SpendPacingBand): ResolvedPacingStatus {
  return resolveBand(band)
}

/** KPI column: No delivery is a problem; Pending is attention; on-track is ok. */
export function kpiStatusPresentation(status: RowKpiStatus): {
  label: string
  role: PacingColourRole
  badgeVariant: Tone
} {
  const visual = KPI_ROW_STATUS[status]
  switch (status) {
    case "kpi-on-track":
      return { label: visual.label, role: "ok", badgeVariant: visual.tone }
    case "kpi-pending":
      return { label: visual.label, role: "attention", badgeVariant: visual.tone }
    case "kpi-mixed":
      return { label: visual.label, role: "attention", badgeVariant: visual.tone }
    case "kpi-no-delivery":
      return { label: visual.label, role: "problem", badgeVariant: visual.tone }
    case "kpi-off-target":
      return { label: visual.label, role: "problem", badgeVariant: visual.tone }
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export type StatusLegendItem = {
  status: UiPacingStatus
  label: string
  role: PacingColourRole
  textClass: string
  definition: string
  /** Override the role-derived legend dot (portfolio uses delivery colours). */
  dotClass?: string
}

/** Legend copy — thresholds from PACING_STATUS_THRESHOLDS only. */
export function statusLegendItems(): StatusLegendItem[] {
  const t = PACING_STATUS_THRESHOLDS
  const onTrackPct = Math.round(t.onTrackAbsProjectionVariance * 100)
  const overPct = Math.round(t.overPacingMinProjectionVariance * 100)
  const mildLo = onTrackPct
  const mildHi = overPct

  return [
    {
      status: "behind",
      label: "Behind",
      role: "attention",
      textClass: TONE_TEXT[PACING_UI_STATUS.behind.tone],
      definition: `Projected finish more than ${mildLo}% under budget, or no delivery after ${t.noDeliveryMinDaysPassed}+ days in-flight.`,
    },
    {
      status: "on-track",
      label: "On track",
      role: "ok",
      textClass: TONE_TEXT[PACING_UI_STATUS["on-track"].tone],
      definition: `Projected spend within ±${onTrackPct}% of booked budget (95–105% of plan).`,
    },
    {
      status: "ahead",
      label: "Ahead",
      role: "attention",
      textClass: TONE_TEXT[PACING_UI_STATUS.ahead.tone],
      definition: `Mild over-delivery: projected ${mildLo}–${mildHi}% over booked budget (attention, not success).`,
    },
    {
      status: "over-pacing",
      label: "Over-pacing",
      role: "problem",
      textClass: TONE_TEXT[PACING_UI_STATUS["over-pacing"].tone],
      definition: `Burning too fast: projected finish ≥${overPct}% over booked budget.`,
    },
    {
      status: "no-data",
      label: "No data",
      role: "problem",
      textClass: TONE_TEXT[PACING_UI_STATUS["no-data"].tone],
      definition: "Not started, unknown window, or no current burst to pace against.",
    },
    {
      status: "kpi-pending",
      label: PACING_UI_STATUS["kpi-pending"].label,
      role: "attention",
      textClass: TONE_TEXT[PACING_UI_STATUS["kpi-pending"].tone],
      definition: "No campaign KPI targets joined yet (orthogonal to spend pace).",
    },
  ]
}
