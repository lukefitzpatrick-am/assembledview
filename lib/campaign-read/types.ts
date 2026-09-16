export const CAMPAIGN_READ_BEAT_KEYS = [
  "planned",
  "happened",
  "vsPlan",
  "best",
  "worst",
  "upcoming",
] as const

export type CampaignReadBeatKey = (typeof CAMPAIGN_READ_BEAT_KEYS)[number]

export type CampaignReadBeats = Record<CampaignReadBeatKey, string>

export const CAMPAIGN_READ_HEADINGS: Record<CampaignReadBeatKey, string> = {
  planned: "What was planned",
  happened: "What has happened",
  vsPlan: "Against the plan",
  best: "Best thing going on",
  worst: "Worst thing",
  upcoming: "Coming up",
}

export const EMPTY_CAMPAIGN_READ_BEAT = "Nothing to report yet."

export type CampaignReadStatus = "draft" | "published" | "generating" | "failed"

export const CAMPAIGN_READ_STATUSES: readonly CampaignReadStatus[] = [
  "draft",
  "published",
  "generating",
  "failed",
]

export type CampaignRead = {
  id: number
  mbaNumber: string
  versionNumber: number
  status: CampaignReadStatus
  beats: CampaignReadBeats
  bodyMarkdown: string
  sources: string[] | null
  errorMessage: string | null
  generatedAt: string
  generatedByEmail: string
  editedAt: string | null
  editedByEmail: string | null
  publishedAt: string | null
  publishedByEmail: string | null
}

export type CampaignReadListPayload = {
  published: CampaignRead | null
  draft: CampaignRead | null
  generating: CampaignRead | null
  failed: CampaignRead | null
  history: CampaignRead[]
}
