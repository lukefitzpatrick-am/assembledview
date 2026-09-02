/**
 * Roy Morgan label → PLANNING_DIM_CHANNEL.channel_id.
 *
 * This table is expected to grow as new Roy Morgan runs arrive.
 * New entries need a test case, not a silent code change.
 *
 * Deliberately unmapped (must fall through to "unmatched" so a human decides):
 * "internet", "total internet", "internet - search (e.g. google)",
 * "total mentioned any media", "can't say/no answer"
 */

export function normaliseRmLabel(raw: string): string {
  let s = raw.toLowerCase()
  s = s.replace(/\s*\(people 18\+\)\s*$/i, "")
  s = s.replace(/\s*\(people 14\+\)\s*$/i, "")
  s = s.replace(/\s*\([0-9+\-±\s]+\)\s*$/g, "")
  s = s.replace(/\s+/g, " ")
  s = s.replace(/[.,;:]+$/g, "")
  return s.trim()
}

const RAW_ALIASES: Record<string, readonly string[]> = {
  tv_fta: ["fta tv", "free to air tv", "television", "commercial tv"],
  bvod: ["bvod", "catch up tv", "catch-up tv"],
  paytv: ["pay tv", "paytv"],
  svod: ["svod", "subscription video"],
  youtube: ["youtube"],
  radio: ["radio", "commercial radio"],
  streaming: ["audio streaming", "music streaming"],
  podcasts: ["podcasts", "podcast", "listening to podcasts"],
  news_print: ["newspaper"],
  news_digital: ["newspaper online", "newspapers online"],
  news_total: ["newspapers"],
  mags_print: ["magazine"],
  mags_digital: ["magazine online", "magazines online"],
  mags_total: ["magazines"],
  ooh_total: ["outdoor", "out of home", "ooh", "out&about"],
  ooh_street: ["street furniture", "bus shelter", "bus/tram shelter"],
  ooh_billboard: ["billboards", "billboard", "large format"],
  ooh_shopping: ["shopping centres", "shopping centre"],
  ooh_transit: ["transit", "airport"],
  social_total: ["social", "social media"],
  facebook: ["facebook"],
  instagram: ["instagram"],
  cinema: ["cinema"],
  digital_other: ["internet - all other websites", "internet all other websites"],
}

export const RM_LABEL_ALIASES: Record<string, string> = {}
for (const [channelId, labels] of Object.entries(RAW_ALIASES)) {
  for (const label of labels) {
    RM_LABEL_ALIASES[normaliseRmLabel(label)] = channelId
  }
}
