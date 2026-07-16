import type { SearchLimits } from "@/components/creative/searchads/types"

/** Keep in sync with the MI library (lib/specs/mi-library/google-ads.json) and the search-copy route. */
export const SEARCH_LIMITS_RSA: SearchLimits = {
  headline: 30,
  description: 90,
  path: 15,
  longHeadline: 90,
  businessName: 25,
  maxHeadlines: 15,
  maxDescriptions: 4,
  maxLongHeadlines: 5,
}

/** Keep in sync with the MI library (lib/specs/mi-library/google-ads.json) and the search-copy route. */
export const SEARCH_LIMITS_PMAX: SearchLimits = {
  headline: 30,
  description: 90,
  path: 15,
  longHeadline: 90,
  businessName: 25,
  maxHeadlines: 15,
  maxDescriptions: 5,
  maxLongHeadlines: 5,
}
