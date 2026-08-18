import type { ChannelKey } from "./channels/types"

/**
 * Channels where a container-level roll-up is safe. Typed as Set<ChannelKey>
 * so adding a ChannelKey later forces an explicit decision here rather than
 * silently defaulting to hide. Direct Booked Digital is included because
 * impressions and clicks stay on separate cards (C-37); programmatic stays
 * out because it still mixes deliverable units into one card.
 */
export const ROLLUP_SAFE_CHANNEL_KEYS: Set<ChannelKey> = new Set([
  "search",
  "social-meta",
  "social-tiktok",
  "digital-display",
  "digital-video",
  "digital-audio",
  "bvod",
])
// Direct Booked Digital is roll-up-safe: C-37 was about summing heterogeneous
// deliverables into a single number. buildDirectDigitalChannelSection never
// does that — it keeps impressions and clicks in two separate progress cards,
// and bookedDeliverables already routes each line's plan total to impressions
// or clicks by buy type, so the planned denominators never mix. Delivered
// impressions are a physical count and summing them across buy types is
// legitimate. Programmatic still refuses mixed roll-up (one deliverable card).

/**
 * Whether ChannelSection should render the channel aggregate block
 * (summary chips, progress cards, KPI band, daily chart).
 *
 * Presentation-only gate — adapters still compute `aggregate` on
 * ChannelSectionData; this only decides whether it renders.
 *
 * Order:
 *   a. lineItemCount === 0 → true (aggregate is the only content)
 *   b. roll-up-safe key AND lineItemCount > 1 → true
 *   c. otherwise → false
 */
export function shouldShowChannelAggregate(
  key: ChannelKey,
  lineItemCount: number,
): boolean {
  if (lineItemCount === 0) return true
  if (ROLLUP_SAFE_CHANNEL_KEYS.has(key) && lineItemCount > 1) return true
  return false
}
