/** Tools the campaign-read generate path may offer. Portfolio pacing is excluded. */
export const CAMPAIGN_READ_GENERATE_TOOLS = [
  "get_campaign_context",
  "get_delivery_snapshot",
  "get_campaign_insights",
] as const

export type CampaignReadGenerateTool = (typeof CAMPAIGN_READ_GENERATE_TOOLS)[number]

export const CAMPAIGN_READ_GENERATE_SURFACE = "campaign-read-generate"

export function isCampaignReadGenerateTool(name: string): name is CampaignReadGenerateTool {
  return (CAMPAIGN_READ_GENERATE_TOOLS as readonly string[]).includes(name)
}
