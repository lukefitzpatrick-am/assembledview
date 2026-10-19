import "server-only"

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { sydneyYmdFromUtcInstant } from "@/lib/myhours/sydneyWeek"
import { roundMoney2 } from "@/lib/money/cents"
import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"
import { querySnowflake } from "@/lib/snowflake/query"
import { PACING_FACT, SEARCH_PACING_FACT, SOCIAL_PACING_FACT } from "../shared/types"
import { buildMatchSuggestions, classifyMatch, parseMatchLineId, summariseMatch, type RawMatchEntity } from "./rules"
import type { MatchCampaignOption, MatchClientOption, MatchPayload, MatchPlanLine } from "./types"

/** How far back delivery is read: about 18 months. */
export const MATCH_LOOKBACK_DAYS = 548
const CACHE_TTL_MS = 5 * 60 * 1000

/** Platform accounts that never appear in pacing facts. */
const NON_DELIVERY_PLATFORMS = new Set(["ga4", "gsc"])

type CacheEntry = { at: number; payload: MatchPayload }
const cache = new Map<number, CacheEntry>()

export class MatchNotFoundError extends Error {}

export function matchSinceYmd(now: Date = new Date()): string {
  return sydneyYmdFromUtcInstant(new Date(now.getTime() - MATCH_LOOKBACK_DAYS * 86_400_000))
}

function burstRange(bursts: unknown): { startDate: string | null; endDate: string | null } {
  let startDate: string | null = null
  let endDate: string | null = null
  if (!Array.isArray(bursts)) return { startDate, endDate }
  for (const b of bursts) {
    if (!b || typeof b !== "object") continue
    const row = b as Record<string, unknown>
    // Bursts store UTC instants of Sydney midnight (e.g. 2025-12-31T13:00:00.000Z is 1 Jan).
    const s = toSydneyYmd(row.startDate)
    const e = toSydneyYmd(row.endDate)
    if (s && (!startDate || s < startDate)) startDate = s
    if (e && (!endDate || e > endDate)) endDate = e
  }
  return { startDate, endDate }
}

function toSydneyYmd(value: unknown): string | null {
  if (value == null || value === "") return null
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  try {
    return sydneyYmdFromUtcInstant(s)
  } catch {
    return null
  }
}

/** Clients with at least one published campaign, for the client dropdown. */
export async function listMatchClients(now: Date = new Date()): Promise<MatchClientOption[]> {
  const since = matchSinceYmd(now)
  const db = getDb()
  const rows = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.mpClientName,
      campaignCount: sql<number>`count(*) filter (where ${schema.mediaPlanMasters.campaignEndDate} is null or ${schema.mediaPlanMasters.campaignEndDate} >= ${since})`,
    })
    .from(schema.mediaPlanMasters)
    .innerJoin(schema.clients, eq(schema.mediaPlanMasters.clientId, schema.clients.id))
    .where(isNotNull(schema.mediaPlanMasters.publishedVersionId))
    .groupBy(schema.clients.id, schema.clients.mpClientName)

  return rows
    .map((row) => ({ id: Number(row.id), name: String(row.name ?? `Client ${row.id}`), campaignCount: Number(row.campaignCount) || 0 }))
    .filter((row) => row.campaignCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Resolve a client id from an MBA number (for links that only carry ?mba=). */
export async function clientIdForMba(mba: string): Promise<number | null> {
  const db = getDb()
  const [row] = await db
    .select({ clientId: schema.mediaPlanMasters.clientId })
    .from(schema.mediaPlanMasters)
    .where(sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${mba.trim().toLowerCase()}`)
    .limit(1)
  return row?.clientId != null ? Number(row.clientId) : null
}

type ClientPlan = {
  client: { id: number; name: string }
  terms: string[]
  allMbas: string[]
  campaigns: MatchCampaignOption[]
  lines: Omit<MatchPlanLine, "delivered" | "entityCount">[]
}

async function loadClientPlan(clientId: number, since: string): Promise<ClientPlan> {
  const db = getDb()
  const [client] = await db
    .select({ id: schema.clients.id, name: schema.clients.mpClientName, aliases: schema.clients.clientNameAliases })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1)
  if (!client) throw new MatchNotFoundError("client not found")

  const accounts = await db
    .select({ platform: schema.clientPlatformAccounts.platform, ref: schema.clientPlatformAccounts.accountRef, label: schema.clientPlatformAccounts.label })
    .from(schema.clientPlatformAccounts)
    .where(and(eq(schema.clientPlatformAccounts.clientId, clientId), eq(schema.clientPlatformAccounts.active, true)))

  const masters = await db
    .select({
      mbaNumber: schema.mediaPlanMasters.mbaNumber,
      campaignName: schema.mediaPlanMasters.campaignName,
      campaignEndDate: schema.mediaPlanMasters.campaignEndDate,
      publishedVersionId: schema.mediaPlanMasters.publishedVersionId,
      publishedAt: schema.mediaPlanVersions.publishedAt,
    })
    .from(schema.mediaPlanMasters)
    .leftJoin(schema.mediaPlanVersions, eq(schema.mediaPlanMasters.publishedVersionId, schema.mediaPlanVersions.id))
    .where(eq(schema.mediaPlanMasters.clientId, clientId))

  const live = masters.filter(
    (m) =>
      m.publishedVersionId != null &&
      m.publishedAt != null &&
      (m.campaignEndDate == null || String(m.campaignEndDate).slice(0, 10) >= since),
  )
  const versionIds = live.map((m) => Number(m.publishedVersionId))
  const lineRows = versionIds.length
    ? await db
        .select({
          lineItemId: schema.lineItems.lineItemId,
          lineChannel: schema.lineItems.channel,
          platform: schema.lineItems.platform,
          buyType: schema.lineItems.buyType,
          bursts: schema.lineItems.bursts,
          versionId: schema.lineItems.versionId,
        })
        .from(schema.lineItems)
        .where(inArray(schema.lineItems.versionId, versionIds))
    : []
  const mbaByVersion = new Map(live.map((m) => [Number(m.publishedVersionId), m.mbaNumber.toLowerCase()]))

  const terms = new Set<string>()
  const addTerm = (value: unknown) => {
    const t = String(value ?? "").trim().toLowerCase()
    if (t.length >= 4) terms.add(t)
  }
  addTerm(client.name)
  for (const alias of Array.isArray(client.aliases) ? client.aliases : []) addTerm(alias)
  for (const account of accounts) {
    if (NON_DELIVERY_PLATFORMS.has(account.platform)) continue
    addTerm(account.ref)
    addTerm(account.label)
  }

  return {
    client: { id: Number(client.id), name: String(client.name ?? `Client ${client.id}`) },
    terms: [...terms],
    allMbas: [...new Set(masters.map((m) => m.mbaNumber.toLowerCase()))],
    campaigns: live
      .map((m) => ({ mbaNumber: m.mbaNumber.toLowerCase(), campaignName: String(m.campaignName ?? m.mbaNumber) }))
      .sort((a, b) => a.mbaNumber.localeCompare(b.mbaNumber)),
    lines: lineRows.map((row) => ({
      lineItemId: row.lineItemId.toLowerCase(),
      mbaNumber: mbaByVersion.get(Number(row.versionId)) ?? "",
      lineChannel: String(row.lineChannel ?? ""),
      platform: String(row.platform ?? ""),
      buyType: String(row.buyType ?? ""),
      ...burstRange(row.bursts),
    })),
  }
}

/**
 * One query over the three facts, grouped per (CHANNEL, PLATFORM_LINE_ITEM_ID).
 * PLATFORM_LINE_ITEM_ID is the key LINE_ITEM_LABEL_MAP and preview/apply use.
 * Legacy "Social%" rows in PACING_FACT are excluded: they duplicate SOCIAL_PACING_FACT.
 *
 * Membership (any of):
 *  - the line id starts with, or the name contains, one of the client's MBAs;
 *  - the campaign name equals the client name, an alias or a platform account ref/label;
 *  - a PACING_FACT row whose campaign name (4+ chars) is shared with a token-matched
 *    PACING_FACT row (catches DV360 lines with no token under the same advertiser).
 */
export function buildMatchWarehouseSql(mbaCount: number, termCount: number): string {
  const tokenCond = Array.from({ length: mbaCount }, () => "(lid LIKE ? OR LOWER(nm) LIKE ?)").join(" OR ") || "FALSE"
  const termCond = termCount > 0 ? `LOWER(TRIM(cn)) IN (${Array.from({ length: termCount }, () => "?").join(", ")})` : "FALSE"
  return `
    WITH raw AS (
      SELECT CHANNEL AS ch, CAST(DATE_DAY AS DATE) AS d,
        TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR)) AS pid,
        LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) AS lid,
        COALESCE(NULLIF(TRIM(CAST(ENTITY_NAME AS VARCHAR)), ''), NULLIF(TRIM(CAST(LINE_ITEM_NAME AS VARCHAR)), ''), TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) AS nm,
        TRIM(CAST(CAMPAIGN_NAME AS VARCHAR)) AS cn, AMOUNT_SPENT AS sp, IMPRESSIONS AS im, 'pacing' AS src
      FROM ${PACING_FACT}
      WHERE CAST(DATE_DAY AS DATE) >= CAST(? AS DATE) AND CHANNEL NOT ILIKE 'Social%'
      UNION ALL
      SELECT CHANNEL, CAST(DATE_DAY AS DATE),
        TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR)),
        LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))),
        COALESCE(NULLIF(TRIM(CAST(ENTITY_NAME AS VARCHAR)), ''), NULLIF(TRIM(CAST(LINE_ITEM_NAME AS VARCHAR)), ''), TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))),
        TRIM(CAST(CAMPAIGN_NAME AS VARCHAR)), AMOUNT_SPENT, IMPRESSIONS, 'social'
      FROM ${SOCIAL_PACING_FACT}
      WHERE CAST(DATE_DAY AS DATE) >= CAST(? AS DATE)
      UNION ALL
      SELECT CHANNEL, CAST(DATE_DAY AS DATE),
        TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR)),
        LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))),
        COALESCE(NULLIF(TRIM(CAST(LINE_ITEM_NAME AS VARCHAR)), ''), TRIM(CAST(CAMPAIGN_NAME AS VARCHAR))),
        TRIM(CAST(CAMPAIGN_NAME AS VARCHAR)), AMOUNT_SPENT, IMPRESSIONS, 'search'
      FROM ${SEARCH_PACING_FACT}
      WHERE CAST(DATE_DAY AS DATE) >= CAST(? AS DATE)
    ),
    grouped AS (
      SELECT ch, pid,
        MAX_BY(lid, d) AS lid, MAX_BY(nm, d) AS nm, MAX_BY(cn, d) AS cn, ANY_VALUE(src) AS src,
        MIN(d) AS first_date, MAX(d) AS last_date,
        SUM(COALESCE(sp, 0)) AS spend, SUM(COALESCE(im, 0)) AS impressions
      FROM raw
      WHERE pid IS NOT NULL AND pid <> ''
      GROUP BY ch, pid
    ),
    flagged AS (
      SELECT g.*, (${tokenCond}) AS tok, (${termCond}) AS term FROM grouped g
    )
    SELECT ch AS CHANNEL, pid AS PLATFORM_LINE_ITEM_ID, lid AS LINE_ITEM_ID, nm AS NAME, cn AS CAMPAIGN_NAME,
      first_date AS FIRST_DATE, last_date AS LAST_DATE, spend AS SPEND, impressions AS IMPRESSIONS
    FROM flagged f
    WHERE (f.tok OR f.term OR (
        f.src = 'pacing' AND LENGTH(f.cn) >= 4
        AND LOWER(f.cn) IN (SELECT LOWER(t.cn) FROM flagged t WHERE t.tok AND t.src = 'pacing' AND LENGTH(t.cn) >= 4)
      ))
      AND (f.spend <> 0 OR f.impressions <> 0)
    ORDER BY spend DESC
  `
}

export function buildMatchWarehouseBinds(since: string, mbas: string[], terms: string[]): string[] {
  const binds = [since, since, since]
  for (const mba of mbas) binds.push(`${mba}%`, `%${mba}%`)
  binds.push(...terms)
  return binds
}

type WarehouseRow = {
  CHANNEL: string
  PLATFORM_LINE_ITEM_ID: string
  LINE_ITEM_ID: string | null
  NAME: string | null
  CAMPAIGN_NAME: string | null
  FIRST_DATE: unknown
  LAST_DATE: unknown
  SPEND: number | string | null
  IMPRESSIONS: number | string | null
}

export function warehouseRowsToEntities(rows: WarehouseRow[], clientMbas: string[]): RawMatchEntity[] {
  const own = new Set(clientMbas)
  const out: RawMatchEntity[] = []
  for (const row of rows) {
    const lineItemId = String(row.LINE_ITEM_ID ?? "").trim().toLowerCase()
    const tokenMba = parseMatchLineId(lineItemId)?.mba ?? null
    // Pulled in by campaign name, but the id says it belongs to another client's plan.
    if (tokenMba && !own.has(tokenMba)) continue
    out.push({
      channel: String(row.CHANNEL ?? ""),
      platformEntityId: String(row.PLATFORM_LINE_ITEM_ID ?? ""),
      lineItemId,
      name: String(row.NAME ?? row.PLATFORM_LINE_ITEM_ID ?? ""),
      campaignName: String(row.CAMPAIGN_NAME ?? ""),
      firstDate: normalizeDailyFactDate(row.FIRST_DATE) ?? "",
      lastDate: normalizeDailyFactDate(row.LAST_DATE) ?? "",
      spend: roundMoney2(Number(row.SPEND) || 0),
      impressions: Number(row.IMPRESSIONS) || 0,
    })
  }
  return out
}

export async function loadMatchPayload(
  clientId: number,
  opts: { fresh?: boolean; now?: Date } = {},
): Promise<MatchPayload> {
  const hit = cache.get(clientId)
  const nowMs = (opts.now ?? new Date()).getTime()
  if (!opts.fresh && hit && nowMs - hit.at < CACHE_TTL_MS) return hit.payload

  const since = matchSinceYmd(opts.now)
  const plan = await loadClientPlan(clientId, since)
  const rows = await querySnowflake<WarehouseRow>(
    buildMatchWarehouseSql(plan.allMbas.length, plan.terms.length),
    buildMatchWarehouseBinds(since, plan.allMbas, plan.terms),
    { label: "relabel_match_entities" },
  )
  const raw = warehouseRowsToEntities(rows, plan.allMbas)
  const { entities, lines } = classifyMatch(raw, plan.lines, plan.allMbas)
  const suggestions = buildMatchSuggestions(entities, lines)
  const payload: MatchPayload = {
    client: plan.client,
    since,
    campaigns: plan.campaigns,
    entities,
    lines,
    suggestions,
    summary: summariseMatch(entities, lines, suggestions),
  }
  cache.set(clientId, { at: nowMs, payload })
  return payload
}

export function clearMatchCache(clientId?: number): void {
  if (clientId == null) cache.clear()
  else cache.delete(clientId)
}
