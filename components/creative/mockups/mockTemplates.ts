export type MockTemplateKind = "social" | "webpage" | "live" | "scene"

export type AdSlot = {
  id: string
  label: string
  width: number
  height: number
}

export type MockTemplateId =
  | "facebook-feed"
  | "instagram-feed"
  | "instagram-story"
  | "tiktok"
  | "news-article"
  | "homepage"
  | "live-page"
  | "tv-lounge"

export type MockTemplate = {
  id: MockTemplateId
  label: string
  kind: MockTemplateKind
  /** Webpage templates only — social frames fill the post media area. */
  slots?: AdSlot[]
}

export const MOCK_TEMPLATES: MockTemplate[] = [
  { id: "facebook-feed", label: "Facebook feed", kind: "social" },
  { id: "instagram-feed", label: "Instagram feed", kind: "social" },
  { id: "instagram-story", label: "Instagram story", kind: "social" },
  { id: "tiktok", label: "TikTok", kind: "social" },
  {
    id: "news-article",
    label: "News article",
    kind: "webpage",
    slots: [
      { id: "leaderboard-top", label: "Leaderboard", width: 728, height: 90 },
      { id: "mrec-rail", label: "MREC", width: 300, height: 250 },
      { id: "halfpage-rail", label: "Half-page", width: 300, height: 600 },
      { id: "mrec-incontent", label: "MREC", width: 300, height: 250 },
    ],
  },
  {
    id: "homepage",
    label: "Homepage",
    kind: "webpage",
    slots: [
      { id: "billboard-top", label: "Billboard", width: 970, height: 250 },
      { id: "leaderboard-mid", label: "Leaderboard", width: 728, height: 90 },
      { id: "mrec-sidebar", label: "MREC", width: 300, height: 250 },
    ],
  },
  { id: "tv-lounge", label: "Lounge room TV", kind: "scene" },
  { id: "live-page", label: "Live page", kind: "live" },
]

export function getMockTemplate(id: MockTemplateId): MockTemplate {
  const found = MOCK_TEMPLATES.find((template) => template.id === id)
  if (!found) throw new Error(`Unknown mock template: ${id}`)
  return found
}
