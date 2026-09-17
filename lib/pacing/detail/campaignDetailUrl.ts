export const CAMPAIGN_DETAIL_PARAM = "campaign"

export function readCampaignMbaFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const raw = params.get(CAMPAIGN_DETAIL_PARAM)?.trim()
  return raw ? raw : null
}

export function withCampaignMba(search: string, mba: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  params.set(CAMPAIGN_DETAIL_PARAM, mba)
  const next = params.toString()
  return next ? `?${next}` : ""
}

export function withoutCampaignMba(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  params.delete(CAMPAIGN_DETAIL_PARAM)
  const next = params.toString()
  return next ? `?${next}` : ""
}

export function campaignDetailPath(pathname: string, search: string, mba: string | null): string {
  const nextSearch = mba ? withCampaignMba(search, mba) : withoutCampaignMba(search)
  return `${pathname}${nextSearch}${typeof window !== "undefined" ? window.location.hash : ""}`
}
