/**
 * Read campaign_insights library queries.
 * Default views filter `superseded_by IS NULL` so Postgres can use
 * `idx_campaign_insights_live` (client_id, created_at DESC) WHERE live.
 * Full-text search uses `idx_campaign_insights_body_fts` (GIN on to_tsvector)
 * via `to_tsvector @@ plainto_tsquery` (repo pattern â not JS filter).
 * Writes / supersession: `writeCampaignInsights.ts` (M9-4).
 */
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm"

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
  /** Display name from clients.mp_client_name when resolved. */
  clientName: string | null
  /** Dashboard slug from clients.slug when resolved. */
  clientSlug: string | null
  /** Rows this insight replaced â populated for includeSuperseded / detail. */
  superseded: CampaignInsightRow[]
}

export type ListCampaignInsightsFilters = {
  q?: string
  clientId?: number
  mbaNumber?: string
  /** Exact YYYY-MM match. Ignored when periodFrom/periodTo set. */
  period?: string
  /** Inclusive YYYY-MM lower bound (lexicographic). */
  periodFrom?: string
  /** Inclusive YYYY-MM upper bound (lexicographic). */
  periodTo?: string
  insightType?: CampaignInsightType | string
  source?: CampaignInsightSource | string
  /** Default false â hide superseded (live partial index path). */
  includeSuperseded?: boolean
  /** Server-side page size. Default 50, max 100. */
  limit?: number
  /** Offset pagination (codex-style list endpoints). Default 0. */
  offset?: number
}

export type ListCampaignInsightsResult = {
  items: CampaignInsightListItem[]
  count: number
  limit: number
  offset: number
  hasMore: boolean
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

const YYYY_MM = /^\d{4}-\d{2}$/

function clampLimit(limit: number | undefined): number {
  const n = typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : 50
  return Math.min(100, Math.max(1, n))
}

function clampOffset(offset: number | undefined): number {
  const n = typeof offset === "number" && Number.isFinite(offset) ? Math.floor(offset) : 0
  return Math.max(0, n)
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

/**
 * GIN-compatible body FTS predicate. Shape must stay
 * `to_tsvector(...) @@ plainto_tsquery(...)` so idx_campaign_insights_body_fts can match.
 */
export function bodyFullTextMatchSql(q: string): SQL {
  return sql`to_tsvector('english'::regconfig, ${schema.campaignInsights.body}) @@ plainto_tsquery('english'::regconfig, ${q})`
}

/** Stable string form for tests — assert query shape, not just result rows. */
export function bodyFullTextMatchShape(): string {
  return "to_tsvector('english'::regconfig, body) @@ plainto_tsquery('english'::regconfig, $q)"
}

function parseYyyyMm(raw: string | undefined): string | undefined {
  const v = raw?.trim()
  if (!v || !YYYY_MM.test(v)) return undefined
  return v
}

/** Exported for unit tests of filter combinations. */
export function buildCampaignInsightsWhere(
  filters: ListCampaignInsightsFilters,
): SQL | undefined {
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

  const periodFrom = parseYyyyMm(filters.periodFrom)
  const periodTo = parseYyyyMm(filters.periodTo)
  if (periodFrom || periodTo) {
    parts.push(sql`${schema.campaignInsights.period} IS NOT NULL`)
    if (periodFrom) {
      parts.push(gte(schema.campaignInsights.period, periodFrom))
    }
    if (periodTo) {
      parts.push(lte(schema.campaignInsights.period, periodTo))
    }
  } else {
    const period = filters.period?.trim()
    if (period) {
      parts.push(eq(schema.campaignInsights.period, period))
    }
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
    parts.push(bodyFullTextMatchSql(q))
  }

  if (parts.length === 0) return undefined
  if (parts.length === 1) return parts[0]
  return and(...parts)
}

async function resolveClientMeta(
  clientIds: number[],
): Promise<Map<number, { name: string | null; slug: string | null }>> {
  const map = new Map<number, { name: string | null; slug: string | null }>()
  if (clientIds.length === 0) return map
  const unique = [...new Set(clientIds)]
  const rows = await getDb()
    .select({
      id: schema.clients.id,
      name: schema.clients.mpClientName,
      slug: schema.clients.slug,
    })
    .from(schema.clients)
    .where(inArray(schema.clients.id, unique))
  for (const r of rows) {
    map.set(Number(r.id), {
      name: r.name?.trim() || null,
      slug: r.slug?.trim() || null,
    })
  }
  return map
}

function attachClientMeta(
  rows: CampaignInsightRow[],
  meta: Map<number, { name: string | null; slug: string | null }>,
  superseded: CampaignInsightRow[] = [],
): CampaignInsightListItem[] {
  return rows.map((row) => {
    const c = meta.get(row.clientId)
    return {
      ...row,
      clientName: c?.name ?? null,
      clientSlug: c?.slug ?? null,
      superseded,
    }
  })
}

/**
 * List insights newest-first with server-side limit + offset.
 * Live-only (default) + clientId is the path that uses idx_campaign_insights_live.
 */
export async function listCampaignInsights(
  filters: ListCampaignInsightsFilters = {},
): Promise<CampaignInsightListItem[]> {
  const page = await listCampaignInsightsPage(filters)
  return page.items
}

export async function listCampaignInsightsPage(
  filters: ListCampaignInsightsFilters = {},
): Promise<ListCampaignInsightsResult> {
  const limit = clampLimit(filters.limit)
  const offset = clampOffset(filters.offset)
  const where = buildCampaignInsightsWhere(filters)

  const db = getDb()
  // Fetch one extra row to detect hasMore without a separate COUNT.
  const fetchLimit = limit + 1
  const base = db
    .select(INSIGHT_SELECT)
    .from(schema.campaignInsights)
    .orderBy(desc(schema.campaignInsights.createdAt))
    .limit(fetchLimit)
    .offset(offset)

  const rows = where ? await base.where(where) : await base
  const hasMore = rows.length > limit
  const pageRows = (hasMore ? rows.slice(0, limit) : rows).map(mapRow)

  const meta = await resolveClientMeta(pageRows.map((r) => r.clientId))

  if (!filters.includeSuperseded) {
    const items = attachClientMeta(pageRows, meta, [])
    return { items, count: items.length, limit, offset, hasMore }
  }

  const live = pageRows.filter((r) => r.supersededBy == null)
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

  const nested = live.map((row) => {
    const c = meta.get(row.clientId)
    return {
      ...row,
      clientName: c?.name ?? null,
      clientSlug: c?.slug ?? null,
      superseded: byParent.get(row.id) ?? [],
    }
  })

  const liveIdSet = new Set(liveIds)
  const orphans = pageRows
    .filter((r) => r.supersededBy != null && !liveIdSet.has(r.supersededBy))
    .map((row) => {
      const c = meta.get(row.clientId)
      return {
        ...row,
        clientName: c?.name ?? null,
        clientSlug: c?.slug ?? null,
        superseded: [] as CampaignInsightRow[],
      }
    })

  const items = [...nested, ...orphans]
  return { items, count: items.length, limit, offset, hasMore }
}

export type CampaignInsightDetail = {
  item: CampaignInsightListItem
  /** Insights this row replaced (superseded_by = this.id). */
  replaced: CampaignInsightRow[]
  /** The insight that replaced this one, if any. */
  replacedBy: CampaignInsightRow | null
}

/** Full detail for expand / GET /api/insights/[id]. */
export async function getCampaignInsightById(
  id: number,
): Promise<CampaignInsightDetail | null> {
  if (!Number.isFinite(id) || id <= 0) return null
  const db = getDb()
  const rows = await db
    .select(INSIGHT_SELECT)
    .from(schema.campaignInsights)
    .where(eq(schema.campaignInsights.id, id))
    .limit(1)
  const raw = rows[0]
  if (!raw) return null
  const itemRow = mapRow(raw)

  const replacedRows = await db
    .select(INSIGHT_SELECT)
    .from(schema.campaignInsights)
    .where(eq(schema.campaignInsights.supersededBy, id))
    .orderBy(desc(schema.campaignInsights.createdAt))
  const replaced = replacedRows.map(mapRow)

  let replacedBy: CampaignInsightRow | null = null
  if (itemRow.supersededBy != null) {
    const succ = await db
      .select(INSIGHT_SELECT)
      .from(schema.campaignInsights)
      .where(eq(schema.campaignInsights.id, itemRow.supersededBy))
      .limit(1)
    if (succ[0]) replacedBy = mapRow(succ[0])
  }

  const meta = await resolveClientMeta([itemRow.clientId])
  const c = meta.get(itemRow.clientId)
  const item: CampaignInsightListItem = {
    ...itemRow,
    clientName: c?.name ?? null,
    clientSlug: c?.slug ?? null,
    superseded: replaced,
  }

  return { item, replaced, replacedBy }
}

/** Recent live insights for a client â designed to hit idx_campaign_insights_live. */
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
