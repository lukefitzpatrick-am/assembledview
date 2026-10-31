/**
 * Unmapped delivery (DATA-1, structural): the last 30 days of platform delivery,
 * across every warehouse pacing fact, that attaches to no published plan line.
 *
 * Same rule as the CM360 placements list: the resolved line id is an active
 * LINE_ITEM_LABEL_MAP override first, then the fact stamp, and it is unmapped
 * when that id is blank or not in MART.XANO_LINE_ITEMS_SNAPSHOT. The SQL
 * fragments come from ./unmappedPlacements, so there is one copy of the rule.
 *
 * Each row carries what a planner should do about it:
 *   relabel   the name carries a published line id that the warehouse id does not
 *   add_line  it carries a plan-style id (or an MBA) with no published line: add the
 *             line to the plan and republish, or relabel to the right line
 *   rename    no line id or MBA at all: put the line id in the platform name, or
 *             relabel by hand
 *
 * Pure apart from the injected query function. No server-only, no Snowflake
 * import: the route passes querySnowflake in. Types are imported by the client.
 */
import { roundMoney2 } from "@/lib/money/cents"
import { lineIdInName, parseMatchLineId } from "@/lib/pacing/relabel/match/rules"
import { suggestedMbaFromCampaignName } from "./suggestedMbaFromCampaignName"
import {
  labelMapJoinSql,
  resolvedLineIdSql,
  resolvedLineIsUnmappedSql,
  type UnmappedPlacementQueryFn,
} from "./unmappedPlacements"

export const UNMAPPED_DELIVERY_WINDOW_DAYS = 30
/** Upper bound on ids checked against the published snapshot in one query. */
const MAX_LOOKUP_IDS = 500

export type UnmappedSuggestionKind = "relabel" | "add_line" | "rename"

export type UnmappedSuggestion = {
  kind: UnmappedSuggestionKind
  /** Lower case MBA, or a client stem from the campaign prefix (upper case), or null. */
  mba: string | null
  /** For relabel: the published target. For add_line: the id that is not on the plan. */
  lineItemId: string | null
  action: string
}

export type UnmappedDeliveryRow = {
  /** Snowflake CHANNEL, e.g. "Social - Meta". */
  channel: string
  /** PLATFORM_LINE_ITEM_ID: what relabel preview and apply take as the entity. */
  platformEntityId: string
  name: string
  campaignName: string
  /** Search customer id; null for channels whose fact has no account column. */
  account: string | null
  firstDate: string
  lastDate: string
  spend: number
  impressions: number
  /** The resolved line id today (map, then fact), lower case; null when blank. */
  currentLineItemId: string | null
  suggestion: UnmappedSuggestion
}

export type UnmappedChannelSummary = {
  channel: string
  entities: number
  spend: number
  impressions: number
}

const FACT_PACING = "ASSEMBLEDVIEW.MART.PACING_FACT"
const FACT_SOCIAL = "ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT"
const FACT_SEARCH = "ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT"

function factSelect(args: {
  table: string
  nameExpr: string
  accountExpr: string
  where: string
}): string {
  return `
      SELECT
        f.CHANNEL AS CH,
        CAST(f.DATE_DAY AS DATE) AS D,
        TRIM(CAST(f.PLATFORM_LINE_ITEM_ID AS VARCHAR)) AS PID,
        ${args.nameExpr} AS NM,
        TRIM(CAST(f.CAMPAIGN_NAME AS VARCHAR)) AS CN,
        ${args.accountExpr} AS ACCT,
        f.AMOUNT_SPENT AS SP,
        f.IMPRESSIONS AS IM,
        ${resolvedLineIdSql("f", "m")} AS RID
      FROM ${args.table} f
      ${labelMapJoinSql("f", "m")}
      WHERE CAST(f.DATE_DAY AS DATE) >= DATEADD(day, -?, CURRENT_DATE())${args.where}`
}

const ENTITY_NAME =
  "COALESCE(NULLIF(TRIM(CAST(f.ENTITY_NAME AS VARCHAR)), ''), NULLIF(TRIM(CAST(f.LINE_ITEM_NAME AS VARCHAR)), ''), TRIM(CAST(f.PLATFORM_LINE_ITEM_ID AS VARCHAR)))"

/**
 * One row per (channel, platform entity) with unmapped delivery in the window.
 * Three binds, all the window in days (one per fact).
 */
export function buildUnmappedDeliverySql(): string {
  return `
    WITH raw AS (${factSelect({
      table: FACT_PACING,
      nameExpr: ENTITY_NAME,
      accountExpr: "CAST(NULL AS VARCHAR)",
      where: "\n        AND f.CHANNEL NOT ILIKE 'Social%'",
    })}
      UNION ALL${factSelect({
        table: FACT_SOCIAL,
        nameExpr: ENTITY_NAME,
        accountExpr: "CAST(NULL AS VARCHAR)",
        where: "",
      })}
      UNION ALL${factSelect({
        table: FACT_SEARCH,
        nameExpr: "COALESCE(NULLIF(TRIM(CAST(f.LINE_ITEM_NAME AS VARCHAR)), ''), TRIM(CAST(f.CAMPAIGN_NAME AS VARCHAR)))",
        accountExpr: "NULLIF(TRIM(CAST(f.CUSTOMER_ID AS VARCHAR)), '')",
        where: "",
      })}
    ),
    unmapped AS (
      SELECT * FROM raw r
      WHERE r.PID IS NOT NULL AND r.PID <> ''
        AND ${resolvedLineIsUnmappedSql("r.RID")}
    )
    SELECT
      CH AS CHANNEL,
      PID AS PLATFORM_LINE_ITEM_ID,
      MAX_BY(NM, D) AS NAME,
      MAX_BY(CN, D) AS CAMPAIGN_NAME,
      MAX_BY(ACCT, D) AS ACCOUNT,
      MAX_BY(RID, D) AS RESOLVED_LINE_ITEM_ID,
      MIN(D) AS FIRST_DATE,
      MAX(D) AS LAST_DATE,
      SUM(COALESCE(SP, 0)) AS SPEND,
      SUM(COALESCE(IM, 0)) AS IMPRESSIONS
    FROM unmapped
    GROUP BY CH, PID
    HAVING SUM(COALESCE(SP, 0)) <> 0 OR SUM(COALESCE(IM, 0)) <> 0
    ORDER BY SPEND DESC, IMPRESSIONS DESC, CH, PID
  `
}

function asIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value && typeof value === "object" && "toISOString" in value) {
    return String((value as { toISOString: () => string }).toISOString()).slice(0, 10)
  }
  return String(value ?? "").slice(0, 10)
}

function blankToNull(value: unknown): string | null {
  const s = String(value ?? "").trim()
  return s ? s : null
}

type RawRow = Omit<UnmappedDeliveryRow, "suggestion">

export function mapUnmappedDeliveryRow(row: Record<string, unknown>): RawRow {
  const current = blankToNull(row.RESOLVED_LINE_ITEM_ID)
  return {
    channel: String(row.CHANNEL ?? ""),
    platformEntityId: String(row.PLATFORM_LINE_ITEM_ID ?? ""),
    name: String(row.NAME ?? row.PLATFORM_LINE_ITEM_ID ?? ""),
    campaignName: String(row.CAMPAIGN_NAME ?? ""),
    account: blankToNull(row.ACCOUNT),
    firstDate: asIsoDate(row.FIRST_DATE),
    lastDate: asIsoDate(row.LAST_DATE),
    spend: roundMoney2(Number(row.SPEND) || 0),
    impressions: Number(row.IMPRESSIONS) || 0,
    currentLineItemId: current ? current.toLowerCase() : null,
  }
}

/** What the platform calls the thing a planner renames. */
export function platformNameLabel(channel: string): string {
  const c = channel.toLowerCase()
  if (c.startsWith("social")) return "ad set"
  if (c.includes("pmax")) return "asset group"
  if (c.startsWith("search") || c.startsWith("shopping")) return "ad group"
  if (c.includes("cm360")) return "placement"
  return "line item"
}

/** MBA-shaped tokens in free text (e.g. PGAAUS015), lower case, in order. */
export function mbaTokensInText(text: string | null | undefined): string[] {
  const out: string[] = []
  const re = /(?:^|[^a-z0-9])([a-z]{3,6}\d{3})(?=$|[^0-9])/gi
  const s = String(text ?? "")
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const tok = m[1]!.toLowerCase()
    if (!out.includes(tok)) out.push(tok)
  }
  return out
}

export type PublishedLookup = {
  /** Published line ids, lower case. */
  lineIds: ReadonlySet<string>
  /** MBAs with at least one published line, lower case. */
  mbas: ReadonlySet<string>
}

/** Pure: what to do about one unmapped entity. */
export function suggestUnmappedFix(row: RawRow, published: PublishedLookup): UnmappedSuggestion {
  const label = platformNameLabel(row.channel)
  const current = row.currentLineItemId
  const nameId = lineIdInName(row.name) ?? lineIdInName(row.campaignName)

  if (nameId && nameId !== current && published.lineIds.has(nameId)) {
    return {
      kind: "relabel",
      mba: parseMatchLineId(nameId)?.mba ?? null,
      lineItemId: nameId,
      action: `The ${label} name carries ${nameId}, a published line. Relabel it to that line.`,
    }
  }

  const planStyle = (current && parseMatchLineId(current) ? current : null) ?? nameId
  if (planStyle) {
    const mba = parseMatchLineId(planStyle)?.mba ?? null
    return {
      kind: "add_line",
      mba,
      lineItemId: planStyle,
      action: `${planStyle} is not a published line${mba ? ` on ${mba}` : ""}. Add the line to the plan and republish, or relabel it to the right line.`,
    }
  }

  const tokenMba = [...mbaTokensInText(row.name), ...mbaTokensInText(row.campaignName)].find((t) => published.mbas.has(t))
  if (tokenMba) {
    return {
      kind: "add_line",
      mba: tokenMba,
      lineItemId: null,
      action: `Names ${tokenMba} but no line id. Add the line id to the ${label} name in the platform, or relabel it to a ${tokenMba} line.`,
    }
  }

  const stem = suggestedMbaFromCampaignName(row.campaignName)
  return {
    kind: "rename",
    mba: stem,
    lineItemId: null,
    action: `No line id or MBA in the name. Add the plan line id to the ${label} name in the platform, or relabel it by hand.`,
  }
}

/** Per channel totals, largest spend first. */
export function summariseUnmappedDelivery(rows: readonly Pick<UnmappedDeliveryRow, "channel" | "spend" | "impressions">[]): UnmappedChannelSummary[] {
  const by = new Map<string, UnmappedChannelSummary>()
  for (const row of rows) {
    const s = by.get(row.channel) ?? { channel: row.channel, entities: 0, spend: 0, impressions: 0 }
    s.entities += 1
    s.spend = roundMoney2(s.spend + row.spend)
    s.impressions += row.impressions
    by.set(row.channel, s)
  }
  return [...by.values()].sort((a, b) => b.spend - a.spend || b.impressions - a.impressions || a.channel.localeCompare(b.channel))
}

/** Ids and MBAs worth checking against the published snapshot. */
export function lookupCandidates(rows: readonly RawRow[]): { lineIds: string[]; mbas: string[] } {
  const lineIds = new Set<string>()
  const mbas = new Set<string>()
  for (const row of rows) {
    const nameId = lineIdInName(row.name) ?? lineIdInName(row.campaignName)
    if (nameId) lineIds.add(nameId)
    for (const t of [...mbaTokensInText(row.name), ...mbaTokensInText(row.campaignName)]) mbas.add(t)
  }
  return { lineIds: [...lineIds].slice(0, MAX_LOOKUP_IDS), mbas: [...mbas].slice(0, MAX_LOOKUP_IDS) }
}

export function buildPublishedLookupSql(lineIdCount: number, mbaCount: number): string | null {
  const parts: string[] = []
  if (lineIdCount > 0) {
    parts.push(`SELECT 'line' AS KIND, LOWER(TRIM(CAST(s.LINE_ITEM_ID AS VARCHAR))) AS VAL
      FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
      WHERE LOWER(TRIM(CAST(s.LINE_ITEM_ID AS VARCHAR))) IN (${Array(lineIdCount).fill("?").join(", ")})`)
  }
  if (mbaCount > 0) {
    parts.push(`SELECT DISTINCT 'mba' AS KIND, LOWER(TRIM(CAST(s.MBA_NUMBER AS VARCHAR))) AS VAL
      FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
      WHERE LOWER(TRIM(CAST(s.MBA_NUMBER AS VARCHAR))) IN (${Array(mbaCount).fill("?").join(", ")})`)
  }
  return parts.length ? parts.join("\n      UNION ALL\n      ") : null
}

/** Read-only: the unmapped list with a suggestion per row, and per channel totals. */
export async function getUnmappedDelivery(
  query: UnmappedPlacementQueryFn,
  windowDays: number = UNMAPPED_DELIVERY_WINDOW_DAYS,
): Promise<{ windowDays: number; rows: UnmappedDeliveryRow[]; summary: UnmappedChannelSummary[] }> {
  const raw = (
    await query(buildUnmappedDeliverySql(), [windowDays, windowDays, windowDays], { label: "unmapped_delivery" })
  ).map(mapUnmappedDeliveryRow)

  const cand = lookupCandidates(raw)
  const lookupSql = buildPublishedLookupSql(cand.lineIds.length, cand.mbas.length)
  const lineIds = new Set<string>()
  const mbas = new Set<string>()
  if (lookupSql) {
    const found = await query(lookupSql, [...cand.lineIds, ...cand.mbas], { label: "unmapped_delivery_lookup" })
    for (const r of found) {
      const val = String(r.VAL ?? "").trim().toLowerCase()
      if (!val) continue
      if (r.KIND === "line") lineIds.add(val)
      else if (r.KIND === "mba") mbas.add(val)
    }
  }
  const rows = raw.map((r) => ({ ...r, suggestion: suggestUnmappedFix(r, { lineIds, mbas }) }))
  return { windowDays, rows, summary: summariseUnmappedDelivery(rows) }
}

/** Rows for one client stem (BICAU, PGAAUS...): suggested MBA, name or campaign. Empty stem keeps all. */
export function filterUnmappedDeliveryByStem<T extends Pick<UnmappedDeliveryRow, "name" | "campaignName" | "suggestion">>(
  rows: readonly T[],
  stem: string,
): T[] {
  const s = stem.trim().toUpperCase()
  if (!s) return [...rows]
  return rows.filter(
    (row) =>
      (row.suggestion.mba ?? "").toUpperCase().startsWith(s) ||
      row.name.toUpperCase().includes(s) ||
      row.campaignName.toUpperCase().includes(s),
  )
}
