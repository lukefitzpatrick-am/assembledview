/**
 * Relabels v2 "Match" tab types. Client-reachable: no db or Snowflake imports.
 * One client at a time: its warehouse delivery entities, its published plan
 * lines, and suggested matches between them.
 */

export type MatchEntityStatus =
  /** Line id is a published line of this client. */
  | "matched"
  /** Line id carries one of this client's MBAs, but no published line has that id. */
  | "not_on_plan"
  /** No plan id at all (DV360 stable key, CM360 size, Taboola campaign id). */
  | "no_plan_id"
  /** Same channel family, dates and spend (to the cent) as a matched entity. Never relabel. */
  | "duplicate"
  /** Matched, but delivery runs more than 7 days outside the line's burst dates. */
  | "check_dates"

export type MatchEntity = {
  /** `${channel}|${platformEntityId}`, unique within a payload. */
  key: string
  /** Snowflake CHANNEL, e.g. "Programmatic - Video". */
  channel: string
  /** PLATFORM_LINE_ITEM_ID: what preview and apply take as platformEntityId. */
  platformEntityId: string
  name: string
  /** Current LINE_ITEM_ID, lower case. */
  lineItemId: string
  campaignName: string
  firstDate: string
  lastDate: string
  spend: number
  impressions: number
  /** MBA from the line id or the name, lower case; null when none. */
  mbaNumber: string | null
  status: MatchEntityStatus
  /** For "duplicate": the key of the matched entity it copies. */
  duplicateOf: string | null
}

export type MatchPlanLine = {
  /** Lower case. */
  lineItemId: string
  mbaNumber: string
  /** Plan line_channel enum value, e.g. "prog_video". */
  lineChannel: string
  platform: string
  buyType: string
  /** Sydney YYYY-MM-DD from the bursts, or null. */
  startDate: string | null
  endDate: string | null
  delivered: number
  entityCount: number
}

export type MatchSuggestionKind = "high" | "check" | "duplicate"

export type MatchSuggestion = {
  id: string
  kind: MatchSuggestionKind
  entityKeys: string[]
  /** One line for "high"; one or more for "check" (more than one means pick); none for "duplicate". */
  targetLineIds: string[]
  reason: string
  spend: number
}

export type MatchClientOption = {
  id: number
  name: string
  campaignCount: number
}

export type MatchCampaignOption = {
  mbaNumber: string
  campaignName: string
}

export type MatchSummary = {
  unmatchedSpend: number
  unmatchedCount: number
  linesWithoutDelivery: number
  suggestionCount: number
  checkDatesCount: number
}

export type MatchPayload = {
  client: { id: number; name: string }
  /** Sydney YYYY-MM-DD; delivery before this date is not loaded. */
  since: string
  campaigns: MatchCampaignOption[]
  entities: MatchEntity[]
  lines: MatchPlanLine[]
  suggestions: MatchSuggestion[]
  summary: MatchSummary
}
