export type SearchAdFormat = "rsa" | "pmax"

export type SearchAssetAngle =
  | "keyword"
  | "benefit"
  | "proof"
  | "cta-offer"
  | "differentiator"
  | "brand"

export type SearchAssetPin = "H1" | "H2" | "H3" | "D1" | "D2" | null

export type SearchAsset = {
  text: string
  angle: SearchAssetAngle
  pinned?: SearchAssetPin
}

export type SearchAdCopy = {
  format: SearchAdFormat
  finalUrl: string
  path1: string
  path2: string
  headlines: SearchAsset[]
  longHeadlines?: SearchAsset[]
  descriptions: SearchAsset[]
  businessName?: string
  sitelinks?: { text: string; url: string }[]
  callouts?: string[]
}

/** Character/slot caps — values come from the MI library via the API route. */
export type SearchLimits = {
  headline: number
  description: number
  path: number
  longHeadline: number
  businessName: number
  maxHeadlines: number
  maxDescriptions: number
  maxLongHeadlines: number
}

/** How many RSA assets the SERP preview renders (Google serves a subset). */
export const RSA_SERVE_HEADLINES = 3
export const RSA_SERVE_DESCRIPTIONS = 2

export function createDefaultSearchAdCopy(
  format: SearchAdFormat,
  finalUrl: string,
): SearchAdCopy {
  return {
    format,
    finalUrl,
    path1: "",
    path2: "",
    headlines: [],
    descriptions: [],
    ...(format === "pmax" ? { longHeadlines: [], businessName: "" } : {}),
  }
}
