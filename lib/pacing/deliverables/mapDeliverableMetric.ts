export type DeliverableMetric =
  | "IMPRESSIONS"
  | "CLICKS"
  | "RESULTS"
  | "VIDEO_3S_VIEWS"

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase()
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((n) => haystack.includes(n))
}

/**
 * V1 deliverable metric mapping.
 *
 * Rules:
 * - If buyType indicates video views → VIDEO_3S_VIEWS
 * - If performance / conversion → RESULTS
 * - If traffic → CLICKS
 * - Else → IMPRESSIONS
 */
export function mapDeliverableMetric(params: {
  channel: string
  buyType?: string | null
  platform?: string | null
}): DeliverableMetric {
  const buyType = norm(params.buyType)
  const platform = norm(params.platform)
  const combined = `${buyType} ${platform}`.trim()

  // Video views / video delivery
  if (
    includesAny(combined, [
      "cpv",
      "video",
      "view",
      "views",
      "3s",
      "thruplay",
      "view rate",
      "video views",
      "watch",
      "youtube",
    ])
  ) {
    return "VIDEO_3S_VIEWS"
  }

  // Conversions / performance
  if (
    includesAny(combined, [
      "cpa",
      "conversion",
      "conversions",
      "result",
      "results",
      "lead",
      "leads",
      "purchase",
      "sales",
      "performance",
      "app install",
      "installs",
    ])
  ) {
    return "RESULTS"
  }

  // Traffic / clicks
  if (includesAny(combined, ["cpc", "click", "clicks", "traffic", "link"])) {
    return "CLICKS"
  }

  return "IMPRESSIONS"
}

