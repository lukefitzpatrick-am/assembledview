const PREFIX_TO_MBA: Record<string, string> = {
  bic: "BICAU",
  sinch: "SINCH",
}

/** Client prefix on a CM360 campaign name → MBA stem when the mapping is obvious. */
export function suggestedMbaFromCampaignName(
  campaignName: string | null | undefined,
): string | null {
  const raw = String(campaignName ?? "").trim()
  if (!raw) return null
  const match = raw.match(/^([a-z0-9]+)-/i)
  if (!match) return null
  return PREFIX_TO_MBA[match[1]!.toLowerCase()] ?? null
}
