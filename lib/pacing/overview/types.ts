/**
 * Portfolio Overview attention model.
 *
 * Spend channels (Search / Social / Programmatic) use computePacing statuses,
 * with `slightly_over` kept as "ahead" (on delivery) and `over_pacing` as
 * "over-pacing" (burning budget too fast) — they must not collapse into one pill.
 *
 * Direct and Ad Serving use their own vocabularies, mapped into the same bands.
 */

export type OverviewChannel =
  | "search"
  | "social"
  | "programmatic"
  | "ad-serving"
  | "direct";

/**
 * Portfolio attention band shown on Overview.
 * - behind: under-pacing / completed under / delivery risk
 * - on-track: healthy spend or serving
 * - ahead: slightly over projected spend (mild — still actionable, not critical)
 * - over-pacing: ≥15% over projection — burn too fast (warning list)
 * - no-data: missing mapping / not started / pending / no delivery window
 */
export type OverviewAttentionStatus =
  | "behind"
  | "on-track"
  | "ahead"
  | "over-pacing"
  | "no-data";

export type OverviewAttentionItem = {
  id: string;
  channel: OverviewChannel;
  clientName: string;
  campaignName: string;
  mbaNumber: string;
  lineItemLabel: string;
  status: OverviewAttentionStatus;
  /** Burst / period budget when spend maths apply; null for Ad Serving. */
  budget: number | null;
  /** Spend to date in current window when spend maths apply; null for Ad Serving. */
  spendToDate: number | null;
  /** Absolute path to the channel tab (filterable later). */
  href: string;
};

export type OverviewStatusCounts = {
  behind: number;
  onTrack: number;
  ahead: number;
  overPacing: number;
  noData: number;
  kpiPending: number;
};

export type OverviewPayload = {
  asOfDate: string;
  counts: OverviewStatusCounts;
  /** Under-pacing / delivery-risk items (sorted worst-first by spend gap when known). */
  underperforming: OverviewAttentionItem[];
  /** Over-pacing burn warnings (projection ≥15% over). */
  overPacing: OverviewAttentionItem[];
  /** Mild ahead-on-delivery (slightly_over) — not in the warning list. */
  aheadOnDelivery: OverviewAttentionItem[];
};
