/** Profile / marketing-brain fields on the Xano `clients` row. */

export const CLIENT_LINK_FIELDS = [
  "website",
  "facebook_url",
  "instagram_url",
  "linkedin_url",
  "tiktok_url",
] as const

export type ClientLinkField = (typeof CLIENT_LINK_FIELDS)[number]

export type ClientProfileLinks = {
  website: string
  facebook_url: string
  instagram_url: string
  linkedin_url: string
  tiktok_url: string
}

export type ClientBrainFields = {
  client_brain: string
  /** Xano stores epoch milliseconds as a number. */
  client_brain_updated_at: number | null
}

/** List-safe projection flag — never ship the brain blob on list paths. */
export type ClientBrainPresence = {
  has_client_brain?: boolean
}

export type ClientProfileFields = ClientProfileLinks &
  ClientBrainFields &
  ClientBrainPresence
