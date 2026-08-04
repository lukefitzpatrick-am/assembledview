/**
 * Client ad-serving rates → rate-for-mediaType resolver.
 *
 * Media-type strings are not normalised on the billing/save path — the spaced
 * and capitalised case labels are intentional. Dropping any of them silently
 * reintroduces $0 ad-serving for that channel. `default` is impressions rate,
 * never 0.
 */

export type AdServingRates = {
  video: number
  audio: number
  display: number
  imp: number
}

/** Ad-serving-eligible schedule media keys (digi* / bvod / prog*). */
export const AD_SERVING_ELIGIBLE_MEDIA_TYPES = new Set([
  "digiAudio",
  "digiDisplay",
  "digiVideo",
  "bvod",
  "progAudio",
  "progVideo",
  "progBvod",
  "progOoh",
  "progDisplay",
])

export function isAdServingEligibleMediaType(mediaType: string): boolean {
  return AD_SERVING_ELIGIBLE_MEDIA_TYPES.has(mediaType)
}

/**
 * Switch copied from create/page.tsx — every case label preserved verbatim.
 */
export function resolveAdServingRateForMediaType(
  mediaType: string,
  rates: AdServingRates
): number {
  switch (mediaType) {
    case "progVideo":
    case "progBvod":
    case "digiVideo":
    case "digi video":
    case "bvod":
    case "BVOD":
    case "Prog BVOD":
    case "Digi Video":
    case "Prog Video":
      return rates.video
    case "progAudio":
    case "digiAudio":
    case "digi audio":
      return rates.audio
    case "progDisplay":
    case "digiDisplay":
    case "digi display":
      return rates.display
    default:
      return rates.imp
  }
}

export function createAdServingRateResolver(
  rates: AdServingRates
): (mediaType: string) => number {
  return (mediaType: string) => resolveAdServingRateForMediaType(mediaType, rates)
}
