export const SOCIAL_CTA_OPTIONS = [
  "Learn More",
  "Shop Now",
  "Sign Up",
  "Download",
  "Get Quote",
  "Contact Us",
  "Book Now",
  "Watch More",
] as const

export type SocialCtaLabel = (typeof SOCIAL_CTA_OPTIONS)[number]

/** Shared ad copy driving every social mock frame. */
export type SocialAdCopy = {
  brandName: string
  primaryText: string
  headline: string
  description: string
  displayLink: string
  destinationUrl: string
  ctaLabel: SocialCtaLabel
}

export const DEFAULT_DISPLAY_LINK = "assembledmedia.com.au"
export const DEFAULT_DESTINATION_URL = "https://assembledmedia.com.au"
export const DEFAULT_CTA_LABEL: SocialCtaLabel = "Learn More"

export function createDefaultSocialAdCopy(brandName: string): SocialAdCopy {
  return {
    brandName,
    primaryText: "",
    headline: "",
    description: "",
    displayLink: DEFAULT_DISPLAY_LINK,
    destinationUrl: DEFAULT_DESTINATION_URL,
    ctaLabel: DEFAULT_CTA_LABEL,
  }
}
