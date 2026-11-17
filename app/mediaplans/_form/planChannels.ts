import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"
import type { BillingBurst } from "@/lib/billing/types"
import { findLinesWithOverlappingBursts, type BurstOverlapLineInput } from "@/lib/mediaplan/burstOverlapLines"

/**
 * The plan form's channels by billing key, with the form flag that turns each
 * on (B52, S33 A). Both plan pages map their channel state through this, so a
 * record of channel state is complete by type.
 */
const PLAN_CHANNEL_FORM_FLAG = {
  television: "mp_television",
  radio: "mp_radio",
  newspaper: "mp_newspaper",
  magazines: "mp_magazines",
  ooh: "mp_ooh",
  cinema: "mp_cinema",
  digiDisplay: "mp_digidisplay",
  digiAudio: "mp_digiaudio",
  digiVideo: "mp_digivideo",
  bvod: "mp_bvod",
  integration: "mp_integration",
  production: "mp_production",
  search: "mp_search",
  socialMedia: "mp_socialmedia",
  progDisplay: "mp_progdisplay",
  progVideo: "mp_progvideo",
  progBvod: "mp_progbvod",
  progAudio: "mp_progaudio",
  progOoh: "mp_progooh",
  influencers: "mp_influencers",
} as const

type PlanChannelKey = keyof typeof PLAN_CHANNEL_FORM_FLAG

/** Form flag (`mp_tv`) to billing key, the inverse of the map above. */
export const mediaKeyMap: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PLAN_CHANNEL_FORM_FLAG).map(([key, flag]) => [flag, key])
)

/** One value per channel: a missing channel is a type error. */
export type PlanChannelRecord<T> = Record<PlanChannelKey, T>

/**
 * The channels the fee seed and billing read: on in the form and with lines,
 * in this order (television first, production after integration).
 */
export function planFeeSeedConfigs(
  lineItemsByKey: PlanChannelRecord<SeedLineFeesMediaConfig["lineItems"]>,
  burstsByKey: PlanChannelRecord<BillingBurst[]>,
  flagOn: (flag: string) => boolean
): SeedLineFeesMediaConfig[] {
  return (Object.keys(PLAN_CHANNEL_FORM_FLAG) as PlanChannelKey[])
    .map((billingKey) => ({ billingKey, lineItems: lineItemsByKey[billingKey], containerBursts: burstsByKey[billingKey] }))
    .filter((c) => flagOn(PLAN_CHANNEL_FORM_FLAG[c.billingKey]) && c.lineItems.length > 0)
}

/**
 * B35 (switch `burst_overlap_warning`): lines with overlapping bursts, every
 * channel, production last. Off: none. Warn only, never a save stop.
 */
export function planBurstOverlapLines(on: boolean, lineItemsByKey: PlanChannelRecord<readonly BurstOverlapLineInput[]>) {
  if (!on) return []
  const { production, ...rest } = lineItemsByKey
  return findLinesWithOverlappingBursts({ ...rest, production })
}
