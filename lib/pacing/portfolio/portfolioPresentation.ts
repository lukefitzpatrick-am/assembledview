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

export function displayBandBadgeVariant(
  band: PortfolioDisplayBand,
): "on-track" | "ahead" | "behind" | "critical" {
  switch (band) {
    case "on-track":
      return "on-track"
    case "ahead":
      return "ahead"
    case "behind":
      return "behind"
    case "over-pacing":
    case "no-data":
      return "critical"
    default: {
      const _exhaustive: never = band
      return _exhaustive
    }
  }
}

export function displayBandFillClass(band: PortfolioDisplayBand): string {
  switch (band) {
    case "behind":
      return "bg-pacing-behind"
    case "on-track":
      return "bg-pacing-on-track"
    case "ahead":
      return "bg-pacing-ahead"
    case "over-pacing":
      return "bg-pacing-critical"
    case "no-data":
      return "bg-muted-foreground"
    default: {
      const _exhaustive: never = band
      return _exhaustive
    }
  }
}

export function displayBandTextClass(band: PortfolioDisplayBand): string {
  switch (band) {
    case "behind":
      return "text-status-behind-fg"
    case "on-track":
      return "text-status-on-track-fg"
    case "ahead":
      return "text-status-ahead-fg"
    case "over-pacing":
      return "text-status-critical-fg"
    case "no-data":
      return "text-muted-foreground"
    default: {
      const _exhaustive: never = band
      return _exhaustive
    }
  }
}

export function displayBandBorderClass(band: PortfolioDisplayBand): string {
  switch (band) {
    case "behind":
      return "border-pacing-behind"
    case "on-track":
      return "border-pacing-on-track"
    case "ahead":
      return "border-pacing-ahead"
    case "over-pacing":
      return "border-pacing-critical"
    case "no-data":
      return "border-muted-foreground"
    default: {
      const _exhaustive: never = band
      return _exhaustive
    }
  }
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
      textClass: "text-status-behind-fg",
      definition: `Spend delivered under ${BEHIND_BELOW_PCT}% of expected.`,
    },
    {
      status: "on-track",
      label: "On track",
      role: "ok",
      textClass: "text-status-on-track-fg",
      definition: `Spend delivered ${BEHIND_BELOW_PCT}–${AHEAD_ABOVE_PCT}% of expected.`,
    },
    {
      status: "ahead",
      label: "Ahead",
      role: "ok",
      textClass: "text-status-ahead-fg",
      dotClass: "bg-pacing-ahead",
      definition: `Spend delivered over ${AHEAD_ABOVE_PCT}% of expected.`,
    },
    {
      status: "over-pacing",
      label: "Over-pacing",
      role: "problem",
      textClass: "text-status-critical-fg",
      definition: "Projected finish is 15% over booked budget.",
    },
    {
      status: "no-data",
      label: "No data",
      role: "problem",
      textClass: "text-muted-foreground",
      definition: "Not started, or no source connected.",
    },
  ]
}
