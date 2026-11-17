import { MediaContainerLoadState } from "@/components/media-containers/MediaContainerLoadState"
import { MEDIA_TYPE_COLORS } from "@/lib/media/mediaTypes"

import { mediaKeyMap } from "./planChannels"

/** The plan form's four steps (both pages; B52). */
export const PLAN_CAMPAIGN_STEPS = [
  { id: "campaign-setup", label: "Campaign setup", eyebrow: "01" },
  { id: "channel-allocation", label: "Channel allocation", eyebrow: "02" },
  { id: "mba-billing", label: "MBA & billing", eyebrow: "03" },
  { id: "review-export", label: "Review & files", eyebrow: "04" },
] as const

export type PlanCampaignStepId = (typeof PLAN_CAMPAIGN_STEPS)[number]["id"]

/** A channel's accent colour from its form flag (`#RRGGBB`), or undefined. */
export function getMediaTypeAccentColor(mediaName: string): string | undefined {
  const argb = MEDIA_TYPE_COLORS[mediaKeyMap[mediaName] ?? ""]?.trim()
  if (!argb || argb.length !== 8) return undefined
  return `#${argb.slice(2)}`
}

export function MediaContainerSuspenseFallback({ label }: { label: string }) {
  return <MediaContainerLoadState loading label={label} />
}

/** One field AVA reads from the page context. */
export type PageField = {
  id: string
  label: string
  type: "string" | "number" | "date" | "enum" | "boolean"
  value: unknown
  editable: boolean
  options?: { label: string; value: string }[]
  validation?: { required?: boolean; min?: number; max?: number; pattern?: string }
  semanticType?: string
  group?: string
  source?: "xano" | "computed" | "ui"
}
