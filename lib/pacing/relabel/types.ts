import type { ChannelTabKey } from "@/lib/pacing/channel/lineCardTypes"

export const SOCIAL_PACING_FACT = "ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT"
export const SEARCH_PACING_FACT = "ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT"
export const PACING_FACT = "ASSEMBLEDVIEW.MART.PACING_FACT"
export const LINE_ITEM_LABEL_MAP = "ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP"
export const CM360_PACING_CHANNEL = "Ad Serving - CM360"

export const SEARCH_PACING_CHANNELS = [
  "Search - Google Ads",
  "Shopping - Google Ads",
  "PMax - Google Ads",
] as const

export const RELABEL_SPEND_WARNING = 25_000
export const RELABEL_DAYS_WARNING = 90
export const RELABEL_REVERT_WINDOW_DAYS = 30

export const RELABEL_WAREHOUSE_CHANNELS = [
  "Social - Meta",
  "Social - TikTok",
  "Social - Reddit",
  "Search - Google Ads",
  "Shopping - Google Ads",
  "PMax - Google Ads",
  CM360_PACING_CHANNEL,
  "Programmatic - Display",
  "Programmatic - Video",
  "Programmatic - OOH",
  "Channel Factory",
] as const

export type RelabelFactKey = "platform_line_item_id" | "line_item_name"

export type RelabelFactRoute = {
  table: typeof SOCIAL_PACING_FACT | typeof SEARCH_PACING_FACT | typeof PACING_FACT
  primaryKey: RelabelFactKey
  fallbackKey: RelabelFactKey | null
  updateLineItemName: boolean
}

export type RelabelEntityAttribution = {
  lineItemId: string | null
  dateFrom: string
  dateTo: string
  dayCount: number
  spend: number
  impressions: number
}

export type RelabelEntity = {
  channel: string
  platformEntityId: string
  entityName: string
  cardChannel: ChannelTabKey
  route: RelabelFactRoute
  attributions: RelabelEntityAttribution[]
}

export type RelabelMoveGroup = {
  previousLineItemId: string | null
  dateFrom: string
  dateTo: string
  dayCount: number
  spend: number
  impressions: number
  rows: number
}

export type RelabelIssue = {
  code: string
  message: string
}

export type RelabelPublishedLine = {
  lineItemId: string
  mbaNumber: string
  lineChannel: string
  cardChannel: ChannelTabKey
  published: boolean
  onPublishedVersion: boolean
}

export type RelabelActiveMap = {
  channel: string
  platformLineItemId: string
  lineItemId: string | null
  lineItemName: string | null
  mbaNumber: string | null
  notes: string | null
}

export type RelabelMoveRow = {
  date: string
  lineItemId: string | null
  lineItemName: string
  spend: number
  impressions: number
  platformLineItemId?: string | null
  clicks?: number
  results?: number
}

export type RelabelPreview = {
  channel: string
  platformEntityId: string
  entityName: string
  lineItemId: string
  mbaNumber: string | null
  dateFrom: string | null
  dateTo: string | null
  cardChannel: ChannelTabKey
  targetCardChannel: ChannelTabKey | null
  moves: RelabelMoveGroup[]
  rowsMoving: number
  spendMoving: number
  daysMoving: number
  warnings: RelabelIssue[]
  blocks: RelabelIssue[]
  duplicateOldNameDays: string[]
  activeMap: RelabelActiveMap | null
  publishedLine: RelabelPublishedLine | null
}

export type RelabelDeletedRow = {
  dateDay: string
  channel: string
  lineItemName: string
  lineItemId: string | null
  platformLineItemId: string | null
  amountSpent: number
  impressions: number
  clicks?: number
  results?: number
}

export type RelabelBeforeState = {
  channel: string
  platformEntityId: string
  entityName: string
  lineItemId: string
  dateFrom: string | null
  dateTo: string | null
  previousByRange: RelabelMoveGroup[]
  priorActiveMap: RelabelActiveMap | null
  deletedDuplicateRows: RelabelDeletedRow[]
}

export type RelabelApplyResult = {
  relabelId: number
  rowsUpdated: number
  rowsDeleted: number
  mapInserted: boolean
  beforeState: RelabelBeforeState
}

export type RelabelRevertPlan = {
  restoreRanges: RelabelMoveGroup[]
  reinsertDeletedRows: RelabelDeletedRow[]
  deactivateMap: { channel: string; platformEntityId: string; lineItemId: string }
  reactivateMap: RelabelActiveMap | null
}

export type DeliveryRelabelStatus = "applied" | "reverted" | "blocked"

export type DeliveryRelabelRow = {
  id: number
  channel: string
  platformEntityId: string
  entityName: string | null
  fromLineItemId: string | null
  toLineItemId: string
  mbaNumber: string
  dateFrom: string | null
  dateTo: string | null
  reason: string
  actorEmail: string
  status: DeliveryRelabelStatus
  beforeState: RelabelBeforeState
  applyResult: Record<string, unknown> | null
  createdAt: string
  revertedAt: string | null
  revertedByEmail: string | null
}

export type RelabelQueryFn = (sql: string, binds?: unknown[]) => Promise<Record<string, unknown>[]>
