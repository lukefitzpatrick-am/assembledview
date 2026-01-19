const channelLabels: Record<string, string> = {
  tv: "TV",
  television: "TV",
  bvod: "BVOD",
  broadcastvideoondemand: "BVOD",
  youtube: "YouTube",
  video: "YouTube",
  digitalvideo: "YouTube",
  programmatic: "Programmatic",
  progdisplay: "Programmatic",
  programmaticdisplay: "Programmatic",
  progvideo: "Programmatic",
  programmaticvideo: "Programmatic",
  display: "Programmatic",
  social: "Social",
  socialmedia: "Social",
  paid_social: "Social",
  social_media: "Social",
  facebook: "Social",
  instagram: "Social",
  tiktok: "Social",
  search: "Search",
  sem: "Search",
  production: "Production",
}

export const channelOrder = ["TV", "BVOD", "YouTube", "Programmatic", "Social", "Search", "Production", "Other"]

function normaliseKey(key: string) {
  return key.replace(/[\s_-]+/g, "").toLowerCase()
}

function titleCase(value: string) {
  if (!value) return "Other"
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ")
}

export function resolveChannel(key: string) {
  const normalized = normaliseKey(key)
  return channelLabels[normalized] || titleCase(key) || "Other"
}

export function sortChannels<T extends { channel: string }>(groups: T[]): T[] {
  const orderMap = new Map(channelOrder.map((name, idx) => [name, idx]))
  return [...groups].sort((a, b) => {
    const aIdx = orderMap.has(a.channel) ? orderMap.get(a.channel)! : Number.MAX_SAFE_INTEGER
    const bIdx = orderMap.has(b.channel) ? orderMap.get(b.channel)! : Number.MAX_SAFE_INTEGER
    if (aIdx === bIdx) return a.channel.localeCompare(b.channel)
    return aIdx - bIdx
  })
}
