import type { ProgressCardProps } from "../shared/ProgressCard"
import type { KpiBandProps } from "../shared/KpiBand"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import type { TargetCurvePoint } from "@/lib/kpi/deliveryTargetCurve"

/**
 * Identity for a channel section. The icon is rendered by ChannelSection.
 */
export type ChannelKey =
  | "social-meta"
  | "social-tiktok"
  | "search"
  | "programmatic-display"
  | "programmatic-video"

/**
 * Connection pill rendered in the channel header. Indicates which platform
 * data source is wired up.
 */
export interface ConnectionPill {
  label: string
  /** Tone hint, e.g. "meta", "tiktok", "google-ads", "dv360". */
  tone: string
}

/**
 * Aggregate-scope KPI surface for the channel header.
 */
export interface ChannelAggregate {
  /** "Total spend $35,763" style summary chips above the progress cards. */
  summaryChips: Array<{ label: string; value: string }>
  /** Two progress cards, [spend, deliverable]. */
  progressCards: [ProgressCardProps, ProgressCardProps]
  /** Unified KPI band rolled up across all line items in this channel. */
  kpiBand: KpiBandProps
  /** Aggregate cumulative-vs-target chart inputs. */
  chart: {
    kind: "cumulative-vs-target"
    targetCurve: TargetCurvePoint[]
    cumulativeActual: Array<{ date: string; actual: number }>
    asAtDate: string | null
    deliverableLabel: string
    brandColour?: string
  }
}

/**
 * What a channel adapter returns for one campaign + channel combination.
 */
export interface ChannelSectionData {
  key: ChannelKey
  title: string
  /** ISO date strings used for the date range pill. */
  dateRange: { startISO: string; endISO: string }
  /** Last-synced timestamp, used in the header. */
  lastSyncedAt: Date | null
  connections: ConnectionPill[]
  /** Media-type colour from getMediaColor. Used as accent throughout. */
  mediaTypeColour: string
  aggregate: ChannelAggregate
  /**
   * Per-line-item blocks, in the order they should render inside the
   * accordion. Empty array hides the line items section entirely.
   */
  lineItems: Array<{
    /** Stable id for accordion expansion state. */
    id: string
    block: LineItemBlockProps
  }>
}
