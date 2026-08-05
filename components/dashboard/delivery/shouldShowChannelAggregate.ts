import type { ChannelKey } from "./channels/types"

/**
 * Channels where a container-level roll-up is safe (homogeneous buy type /
 * deliverable). Typed as Set<ChannelKey> so adding a ChannelKey later forces
 * an explicit decision here rather than silently defaulting to hide.
 */
export const ROLLUP_SAFE_CHANNEL_KEYS: Set<ChannelKey> = new Set([
  "search",
  "social-meta",
  "social-tiktok",
])

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
