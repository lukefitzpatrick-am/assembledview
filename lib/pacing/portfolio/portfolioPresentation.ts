import { PACING_UI_STATUS, TONE_DOT, TONE_TEXT, type Tone } from "@/lib/design/status"
import {
  AHEAD_ABOVE_PCT,
  BEHIND_BELOW_PCT,
} from "@/lib/pacing/deliveryStatusFromPct"
import { isOverPacing } from "@/lib/pacing/portfolio/portfolioRowFlags"
import type {
  CampaignPacingRow,
  ChannelSourceState,
  PortfolioPace,
} from "@/lib/pacing/portfolio/types"
import type { StatusLegendItem } from "@/lib/pacing/status"

export type PortfolioDisplayBand =
  | "behind"
  | "on-track"
  | "ahead"
  | "over-pacing"
  | "no-data"

export function campaignDisplayBand(row: CampaignPacingRow): PortfolioDisplayBand {
  if (isOverPacing(row)) return "over-pacing"
  return paceToDisplayBand(row.pace)
}

export function paceToDisplayBand(pace: PortfolioPace): PortfolioDisplayBand {
  switch (pace) {
    case "behind":
    case "no_delivery":
      return "behind"
    case "on_track":
      return "on-track"
    case "ahead":
      return "ahead"
    case "no_source":
    case "not_started":
      return "no-data"
    default: {
      const _exhaustive: never = pace
      return _exhaustive
    }
  }
}

export function campaignPaceLabel(row: CampaignPacingRow): string {
  if (isOverPacing(row)) return "Over-pacing"
  switch (row.pace) {
    case "behind":
      return "Behind"
    case "on_track":
      return "On track"
    case "ahead":
      return "Ahead"
    case "no_delivery":
      return "No delivery"
    case "no_source":
      return "No source"
    case "not_started":
      return "Not started"
    default: {
      const _exhaustive: never = row.pace
      return _exhaustive
    }
  }
}

function bandTone(band: PortfolioDisplayBand): Tone {
  return PACING_UI_STATUS[band].tone
}

function borderForTone(tone: Tone): string {
  switch (tone) {
    case "outcome":
      return "border-tone-outcome"
    case "insight":
      return "border-tone-insight"
    case "action":
      return "border-tone-action"
    case "attention":
      return "border-tone-attention"
    case "critical":
      return "border-tone-critical"
    case "neutral":
      return "border-tone-neutral"
    case "ink":
      return "border-tone-ink"
    case "cancelled":
      return "border-tone-cancelled"
  }
}

export function displayBandBadgeVariant(band: PortfolioDisplayBand): Tone {
  return bandTone(band)
}

export function displayBandFillClass(band: PortfolioDisplayBand): string {
  return TONE_DOT[bandTone(band)]
}

export function displayBandTextClass(band: PortfolioDisplayBand): string {
  return TONE_TEXT[bandTone(band)]
}

export function displayBandBorderClass(band: PortfolioDisplayBand): string {
  return borderForTone(bandTone(band))
}

export const CHANNEL_SOURCE_STATE_LABEL: Record<Exclude<ChannelSourceState, "reporting">, string> = {
  connecting: "Connecting",
  not_started: "Not started",
  no_source: "No source",
}

export function portfolioLegendItems(): StatusLegendItem[] {
  return [
    {
      status: "behind",
      label: "Behind",
      role: "attention",
      textClass: TONE_TEXT[PACING_UI_STATUS.behind.tone],
      definition: `Spend delivered under ${BEHIND_BELOW_PCT}% of expected.`,
    },
    {
      status: "on-track",
      label: "On track",
      role: "ok",
      textClass: TONE_TEXT[PACING_UI_STATUS["on-track"].tone],
      definition: `Spend delivered ${BEHIND_BELOW_PCT}–${AHEAD_ABOVE_PCT}% of expected.`,
    },
    {
      status: "ahead",
      label: "Ahead",
      role: "ok",
      textClass: TONE_TEXT[PACING_UI_STATUS.ahead.tone],
      definition: `Spend delivered over ${AHEAD_ABOVE_PCT}% of expected.`,
    },
    {
      status: "over-pacing",
      label: "Over-pacing",
      role: "problem",
      textClass: TONE_TEXT[PACING_UI_STATUS["over-pacing"].tone],
      definition: "Projected finish is 15% over booked budget.",
    },
    {
      status: "no-data",
      label: "No data",
      role: "problem",
      textClass: TONE_TEXT[PACING_UI_STATUS["no-data"].tone],
      definition: "Not started, or no source connected.",
    },
  ]
}
