/**
 * Read campaign_insights library queries.
 * Default views filter `superseded_by IS NULL` so Postgres can use
 * `idx_campaign_insights_live` (client_id, created_at DESC) WHERE live.
 * Full-text search uses `idx_campaign_insights_body_fts` (GIN on to_tsvector).
 * Writes / supersession: `writeCampaignInsights.ts` (M9-4).
 */
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type {
  CampaignInsightSource,
  CampaignInsightType,
} from "@/db/schema/insights"

export type CampaignInsightRow = {
  id: number
  mbaNumber: string
  clientId: number
  period: string | null
  insightType: string
  body: string
  source: string
  confidence: string | null
  createdBy: string
  createdAt: string
  supersededBy: number | null
  supersededAt: string | null
}

export type CampaignInsightListItem = CampaignInsightRow & {
  /** Rows this insight replaced — only populated when includeSuperseded. */
  superseded: CampaignInsightRow[]
}

export type ListCampaignInsightsFilters = {
  q?: string
  clientId?: number
  mbaNumber?: string
  period?: string
  insightType?: CampaignInsightType | string
  source?: CampaignInsightSource | string
  /** Default false — hide superseded (live partial index path). */
  includeSuperseded?: boolean
  /** Server-side cap. Default 50, max 100. Never load the whole table client-side. */
  limit?: number
}

const INSIGHT_SELECT = {
  id: schema.campaignInsights.id,
  mbaNumber: schema.campaignInsights.mbaNumber,
  clientId: schema.campaignInsights.clientId,
  period: schema.campaignInsights.period,
  insightType: schema.campaignInsights.insightType,
  body: schema.campaignInsights.body,
  source: schema.campaignInsights.source,
  confidence: schema.campaignInsights.confidence,
  createdBy: schema.campaignInsights.createdBy,
  createdAt: schema.campaignInsights.createdAt,
  supersededBy: schema.campaignInsights.supersededBy,
  supersededAt: schema.campaignInsights.supersededAt,
} as const

function clampLimit(limit: number | undefined): number {
  const n = typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : 50
  return Math.min(100, Math.max(1, n))
}

function mapRow(row: {
  id: number
  mbaNumber: string
  clientId: number
  period: string | null
  insightType: string
  body: string
  source: string
  confidence: string | null
  createdBy: string
  createdAt: string
  supersededBy: number | null
  supersededAt: string | null
}): CampaignInsightRow {
  return {
    id: Number(row.id),
    mbaNumber: row.mbaNumber,
    clientId: Number(row.clientId),
    period: row.period,
    insightType: row.insightType,
    body: row.body,
    source: row.source,
    confidence: row.confidence,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    supersededBy: row.supersededBy == null ? null : Number(row.supersededBy),
    supersededAt: row.supersededAt,
  }
}

function buildWhere(filters: ListCampaignInsightsFilters): SQL | undefined {
  const parts: SQL[] = []

  if (!filters.includeSuperseded) {
    parts.push(isNull(schema.campaignInsights.supersededBy))
  }

  if (typeof filters.clientId === "number" && Number.isFinite(filters.clientId)) {
    parts.push(eq(schema.campaignInsights.clientId, filters.clientId))
  }

  const mba = filters.mbaNumber?.trim().toLowerCase()
  if (mba) {
    parts.push(eq(schema.campaignInsights.mbaNumber, mba))
  }

  const period = filters.period?.trim()
  if (period) {
    parts.push(eq(schema.campaignInsights.period, period))
  }

  const insightType = filters.insightType?.trim()
  if (insightType) {
    parts.push(eq(schema.campaignInsights.insightType, insightType))
  }

  const source = filters.source?.trim()
  if (source) {
    parts.push(eq(schema.campaignInsights.source, source))
  }

  const q = filters.q?.trim()
  if (q) {
    parts.push(
      sql`to_tsvector('english'::regconfig, ${schema.campaignInsights.body}) @@ plainto_tsquery('english'::regconfig, ${q})`,
    )
  }

  if (parts.length === 0) return undefined
  if (parts.length === 1) return parts[0]
  return and(...parts)
}

/**
 * List insights newest-first with server-side limit.
 * Live-only (default) + clientId is the path that uses idx_campaign_insights_live.
 */
export async function listCampaignInsights(
  filters: ListCampaignInsightsFilters = {},
): Promise<CampaignInsightListItem[]> {
  const limit = clampLimit(filters.limit)
  const where = buildWhere(filters)

  const db = getDb()
  const base = db
    .select(INSIGHT_SELECT)
    .from(schema.campaignInsights)
    .orderBy(desc(schema.campaignInsights.createdAt))
    .limit(limit)

  const rows = where ? await base.where(where) : await base
  const liveOrAll = rows.map(mapRow)

  if (!filters.includeSuperseded) {
    return liveOrAll.map((row) => ({ ...row, superseded: [] }))
  }

  // Collapse superseded under their replacement when both are in-scope.
  const live = liveOrAll.filter((r) => r.supersededBy == null)
  const liveIds = live.map((r) => r.id)
  let children: CampaignInsightRow[] = []
  if (liveIds.length > 0) {
    const childRows = await db
      .select(INSIGHT_SELECT)
      .from(schema.campaignInsights)
      .where(inArray(schema.campaignInsights.supersededBy, liveIds))
      .orderBy(desc(schema.campaignInsights.createdAt))
    children = childRows.map(mapRow)
  }

  const byParent = new Map<number, CampaignInsightRow[]>()
  for (const child of children) {
    const parentId = child.supersededBy
    if (parentId == null) continue
    const list = byParent.get(parentId) ?? []
    list.push(child)
    byParent.set(parentId, list)
  }

  const nested = live.map((row) => ({
    ...row,
    superseded: byParent.get(row.id) ?? [],
  }))

  // Superseded rows whose replacement is not in this page — show flat with empty children.
  const liveIdSet = new Set(liveIds)
  const orphans = liveOrAll
    .filter((r) => r.supersededBy != null && !liveIdSet.has(r.supersededBy))
    .map((row) => ({ ...row, superseded: [] as CampaignInsightRow[] }))

  return [...nested, ...orphans]
}

/** Recent live insights for a client — designed to hit idx_campaign_insights_live. */
export async function listRecentLiveInsightsForClient(
  clientId: number,
  limit = 5,
): Promise<CampaignInsightListItem[]> {
  return listCampaignInsights({
    clientId,
    includeSuperseded: false,
    limit,
  })
}

/** Recent live insights for an MBA. */
export async function listRecentLiveInsightsForMba(
  mbaNumber: string,
  limit = 5,
): Promise<CampaignInsightListItem[]> {
  return listCampaignInsights({
    mbaNumber: mbaNumber.trim().toLowerCase(),
    includeSuperseded: false,
    limit,
  })
}

/**
 * EXPLAIN the default client live query. Used to verify
 * idx_campaign_insights_live appears in the plan.
 */
export async function explainClientLiveInsightsPlan(
  clientId: number,
): Promise<string> {
  const result = await getDb().execute(sql`
    EXPLAIN (FORMAT TEXT)
    SELECT id, mba_number, client_id, created_at
    FROM campaign_insights
    WHERE client_id = ${clientId}
      AND superseded_by IS NULL
    ORDER BY created_at DESC
    LIMIT 5
  `)
  const rows = result as unknown as Array<{ "QUERY PLAN"?: string } | string>
  if (Array.isArray(rows)) {
    return rows
      .map((r) => (typeof r === "string" ? r : r["QUERY PLAN"] ?? JSON.stringify(r)))
      .join("\n")
  }
  return String(result)
}
