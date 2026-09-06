/**
 * Investment cut — Drizzle SQL over published-tip schedule_months.
 *
 * Billable composition = FN3a (summaryQuery):
 * - billing: sum media+fee+adserving (no client_pays re-filter on media)
 * - delivery: exclude media where client_pays_for_media; fee+adserving always
 *
 * Status scope (CP-3): approved|booked|completed only; excluded statuses in
 * coverage.excludedByStatusCents. Version authority = published tip (D1).
 *
 * Publisher = FN0 PUBLISHER_IDENTITY_SQL; null → Unmatched.
 * billingAgency = classifyBillingAgency over publishers join (SQL twin).
 */

import { sql, type SQL } from "drizzle-orm"
import { getDb } from "@/db"
import {
  australianFyStartYearForDate,
  billingMonthsInAustralianFinancialYear,
  getCurrentBillingMonth,
  referenceDateForFyStartYear,
} from "@/lib/finance/months"
import { BILLING_AGENCY_AA } from "@/lib/finance/billingAgency"
import { normaliseToFy } from "@/lib/finance/sections/defaultScope"
import {
  FINANCE_STATUS_EXCLUDED_SQL,
  FINANCE_STATUS_INCLUDED_SQL,
  type ExcludedByStatusCents,
} from "@/lib/finance/sections/financeCampaignStatus"
import {
  PUBLISHER_IDENTITY_SQL,
} from "@/lib/finance/sections/publisherIdentitySql"
import { SCHEDULE_LINE_JOIN_SQL } from "@/lib/finance/sections/scheduleLineJoinSql"
import {
  IS_SERVICE_LINE_SQL,
  LINE_DETAIL_COVERAGE_NOTE,
  lineDimOrCampaignLevelSql,
} from "@/lib/finance/sections/serviceLineBucket"
import {
  CHANNEL_GROUPS,
  channelGroupSqlCase,
  type ChannelGroup,
} from "./channelGroups"
import { attachActualsMeasures } from "./cutArQuery"
import {
  measuresIncludeActuals,
  validateActualsGrain,
} from "./cutGrain"
import {
  INCLUDE_ADSERVING_IN_AGENCY_REVENUE,
  measuresIncludeAgencyEconomics,
  validateAgencyEconomicsFy,
  validateAgencyRevenueGrain,
  type AgencyEconomicsHistoricError,
} from "./agencyEconomics"
import { attachAgencyEconomicsMeasures } from "./agencyEconomicsAttach"
import {
  FEE_COVERAGE_CAVEAT,
  INVESTMENT_CUT_DIMS,
  INVESTMENT_CUT_MEASURES,
  INVESTMENT_CUT_ROW_CAP,
  UNMATCHED_PUBLISHER,
  type InvestmentCutDim,
  type InvestmentCutGrainError,
  type InvestmentCutMeasure,
  type InvestmentCutNormalized,
  type InvestmentCutParseError,
  type InvestmentCutRequest,
  type InvestmentCutResponse,
  type InvestmentCutRow,
} from "./cutTypes"

const BOOKED_DEFAULT_MEASURES: InvestmentCutMeasure[] = [
  "media_cents",
  "fee_cents",
  "adserving_cents",
  "billable_cents",
]

function monthStartDate(yyyyMm: string): string {
  return `${yyyyMm}-01`
}

function monthEndExclusive(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map((x) => Number.parseInt(x, 10))
  const d = new Date(y!, m! - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function isDim(v: unknown): v is InvestmentCutDim {
  return typeof v === "string" && (INVESTMENT_CUT_DIMS as readonly string[]).includes(v)
}

function isMeasure(v: unknown): v is InvestmentCutMeasure {
  return typeof v === "string" && (INVESTMENT_CUT_MEASURES as readonly string[]).includes(v)
}

function isChannelGroup(v: unknown): v is ChannelGroup {
  return typeof v === "string" && (CHANNEL_GROUPS as readonly string[]).includes(v)
}

export type AgencyRevenueGrainError = Exclude<
  ReturnType<typeof validateAgencyRevenueGrain>,
  { ok: true }
>

export type NormalizeInvestmentCutResult =
  | InvestmentCutNormalized
  | InvestmentCutParseError
  | InvestmentCutGrainError
  | AgencyEconomicsHistoricError
  | AgencyRevenueGrainError

export function normalizeInvestmentCutRequest(
  input: InvestmentCutRequest,
  today: Date = new Date()
): NormalizeInvestmentCutResult {
  if (input.basis !== "billing" && input.basis !== "delivery") {
    return {
      error: "Invalid basis",
      message: 'basis must be "billing" or "delivery" (never mixed in one response).',
    }
  }

  const currentFy = australianFyStartYearForDate(today)
  const fy =
    input.fy && input.fy >= 2000 && input.fy <= 2100 ? input.fy : currentFy
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const currentMonth = getCurrentBillingMonth(today)
  let from = input.monthRange?.from?.trim() || fyMonths[0]!
  let to =
    input.monthRange?.to?.trim() ||
    (fy === currentFy ? currentMonth : fyMonths[fyMonths.length - 1]!)
  const clamped = normaliseToFy(fy, { from, to })

  const dimensions = Array.isArray(input.dimensions)
    ? [...new Set(input.dimensions.filter(isDim))]
    : []
  if (Array.isArray(input.dimensions) && input.dimensions.some((d) => !isDim(d))) {
    return {
      error: "Invalid dimensions",
      message: `dimensions must be subset of: ${INVESTMENT_CUT_DIMS.join(", ")}`,
    }
  }

  let measures = Array.isArray(input.measures)
    ? [...new Set(input.measures.filter(isMeasure))]
    : []
  if (Array.isArray(input.measures) && input.measures.some((m) => !isMeasure(m))) {
    return {
      error: "Invalid measures",
      message: `measures must be subset of: ${INVESTMENT_CUT_MEASURES.join(", ")}`,
    }
  }
  if (!measures.length) measures = [...BOOKED_DEFAULT_MEASURES]

  const f = input.filters ?? {}
  const clients = (f.clients ?? []).filter((n) => Number.isFinite(n) && n > 0)
  const channels = [...new Set((f.channels ?? []).map((s) => String(s).trim()).filter(Boolean))]
  const channelGroups = [...new Set((f.channelGroups ?? []).filter(isChannelGroup))]
  if ((f.channelGroups ?? []).some((g) => !isChannelGroup(g))) {
    return {
      error: "Invalid channelGroups",
      message: `channelGroups must be subset of: ${CHANNEL_GROUPS.join(", ")}`,
    }
  }
  const publishers = [...new Set((f.publishers ?? []).map((s) => String(s).trim()).filter(Boolean))]
  const buyTypes = [...new Set((f.buyTypes ?? []).map((s) => String(s).trim()).filter(Boolean))]
  const markets = [...new Set((f.markets ?? []).map((s) => String(s).trim()).filter(Boolean))]
  const billingAgency = [
    ...new Set(
      (f.billingAgency ?? []).filter((a): a is "AA" | "AM" => a === "AA" || a === "AM")
    ),
  ]
  const search = typeof f.search === "string" ? f.search.trim() : ""

  const grain = validateActualsGrain({
    dimensions,
    measures,
    filters: {
      channels,
      channelGroups,
      publishers,
      buyTypes,
      markets,
      billingAgency,
    },
  })
  if ("code" in grain) {
    return grain
  }

  const agencyFy = validateAgencyEconomicsFy({
    fy,
    measures,
    presetId: input.presetId,
    today,
  })
  if ("code" in agencyFy) {
    return agencyFy
  }

  const agencyGrain = validateAgencyRevenueGrain({ dimensions, measures })
  if ("code" in agencyGrain) {
    return agencyGrain
  }

  return {
    fy,
    from: clamped.from,
    to: clamped.to,
    basis: input.basis,
    dimensions,
    measures,
    filters: {
      clients,
      channels,
      channelGroups,
      publishers,
      buyTypes,
      markets,
      billingAgency,
      search,
    },
  }
}

function clientFilterSql(clientIds: number[]): SQL {
  if (!clientIds.length) return sql`TRUE`
  return sql`m.client_id = ANY(ARRAY[${sql.join(
    clientIds.map((id) => sql`${id}::bigint`),
    sql`, `
  )}])`
}

function stringArraySql(values: string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  )}]::text[]`
}

function dimSelectSql(dim: InvestmentCutDim): { select: string; groupAlias: string } {
  const channelGroupExpr = channelGroupSqlCase("li.channel::text")
  const publisherExpr = lineDimOrCampaignLevelSql(
    `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '${UNMATCHED_PUBLISHER}')`
  )
  const billingAgencyExpr = lineDimOrCampaignLevelSql(`
CASE
  WHEN LOWER(BTRIM(COALESCE(p.billingagency, ''))) = '${BILLING_AGENCY_AA}' THEN 'AA'
  ELSE 'AM'
END`.trim())

  switch (dim) {
    case "client":
      return {
        select: `COALESCE(NULLIF(BTRIM(c.mp_client_name), ''), NULLIF(BTRIM(m.mp_client_name), ''), 'Unknown') AS dim_client`,
        groupAlias: "dim_client",
      }
    case "channelGroup":
      return {
        select: `${lineDimOrCampaignLevelSql(channelGroupExpr)} AS dim_channel_group`,
        groupAlias: "dim_channel_group",
      }
    case "channel":
      return {
        select: `${lineDimOrCampaignLevelSql("COALESCE(li.channel::text, 'Unknown')")} AS dim_channel`,
        groupAlias: "dim_channel",
      }
    case "publisher":
      return {
        select: `${publisherExpr} AS dim_publisher`,
        groupAlias: "dim_publisher",
      }
    case "buyType":
      return {
        select: `${lineDimOrCampaignLevelSql("COALESCE(NULLIF(BTRIM(li.buy_type), ''), 'Unspecified')")} AS dim_buy_type`,
        groupAlias: "dim_buy_type",
      }
    case "market":
      return {
        select: `${lineDimOrCampaignLevelSql("COALESCE(NULLIF(BTRIM(li.market), ''), 'Unspecified')")} AS dim_market`,
        groupAlias: "dim_market",
      }
    case "month":
      return {
        select: `to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS dim_month`,
        groupAlias: "dim_month",
      }
    case "fy":
      return {
        select: `NULL::int AS dim_fy`,
        groupAlias: "dim_fy",
      }
    case "billingAgency":
      return {
        select: `${billingAgencyExpr} AS dim_billing_agency`,
        groupAlias: "dim_billing_agency",
      }
  }
}

/** Booked schedule measures only — Actuals / agency attach post-query. */
function measureSelectFragments(measures: InvestmentCutMeasure[]): string[] {
  const agency = measuresIncludeAgencyEconomics(measures)
  const needBillable =
    measures.includes("billable_cents") ||
    measures.includes("invoiced_delta_cents") ||
    measures.includes("margin_pct") ||
    measuresIncludeActuals(measures) ||
    agency
  const needFee =
    measures.includes("fee_cents") ||
    measures.includes("revenue_cents") ||
    measures.includes("margin_pct") ||
    agency
  const needAdserving =
    measures.includes("adserving_cents") ||
    (agency && INCLUDE_ADSERVING_IN_AGENCY_REVENUE)
  const frags: string[] = []
  if (measures.includes("media_cents")) {
    frags.push(
      `COALESCE(SUM(CASE WHEN sm.component = 'media' THEN sm.amount_cents ELSE 0 END), 0) AS media_cents`
    )
  }
  if (needFee) {
    frags.push(
      `COALESCE(SUM(CASE WHEN sm.component = 'fee' THEN sm.amount_cents ELSE 0 END), 0) AS fee_cents`
    )
  }
  if (needAdserving) {
    frags.push(
      `COALESCE(SUM(CASE WHEN sm.component = 'adserving' THEN sm.amount_cents ELSE 0 END), 0) AS adserving_cents`
    )
  }
  if (needBillable) {
    frags.push(`COALESCE(SUM(sm.amount_cents), 0) AS billable_cents`)
  }
  if (!frags.length) {
    // Actuals/agency-only request still needs a booked aggregate spine
    frags.push(`COALESCE(SUM(sm.amount_cents), 0) AS billable_cents`)
  }
  return frags
}

function bookedMeasuresForMap(measures: InvestmentCutMeasure[]): InvestmentCutMeasure[] {
  const agency = measuresIncludeAgencyEconomics(measures)
  const out = measures.filter(
    (m) =>
      m === "media_cents" ||
      m === "fee_cents" ||
      m === "adserving_cents" ||
      m === "billable_cents"
  )
  if (
    (measuresIncludeActuals(measures) ||
      measures.includes("margin_pct") ||
      agency) &&
    !out.includes("billable_cents")
  ) {
    out.push("billable_cents")
  }
  if (
    (agency ||
      measures.includes("revenue_cents") ||
      measures.includes("margin_pct")) &&
    !out.includes("fee_cents")
  ) {
    out.push("fee_cents")
  }
  if (agency && INCLUDE_ADSERVING_IN_AGENCY_REVENUE && !out.includes("adserving_cents")) {
    out.push("adserving_cents")
  }
  if (!out.length) out.push("billable_cents")
  return out
}

type BuiltCutSql = {
  cutSql: SQL
  cutSqlText: string
  feeCoverageSql: SQL
  feeCoverageSqlText: string
  publisherMatchSql: SQL
  publisherMatchSqlText: string
  lineDetailCoverageSql: SQL
  lineDetailCoverageSqlText: string
  dimAliases: Array<{ dim: InvestmentCutDim; alias: string }>
}

function buildFilterClauses(q: InvestmentCutNormalized): {
  sqlParts: SQL[]
  textParts: string[]
} {
  const sqlParts: SQL[] = []
  const textParts: string[] = []
  const f = q.filters

  sqlParts.push(clientFilterSql(f.clients))
  if (f.clients.length) {
    textParts.push(`m.client_id = ANY(ARRAY[${f.clients.join(",")}]::bigint[])`)
  } else {
    textParts.push("TRUE /* all clients */")
  }

  if (f.channels.length) {
    sqlParts.push(sql`li.channel::text = ANY(${stringArraySql(f.channels)})`)
    textParts.push(
      `li.channel::text = ANY(ARRAY[${f.channels.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")}]::text[])`
    )
  }

  if (f.channelGroups.length) {
    const expr = channelGroupSqlCase("li.channel::text")
    sqlParts.push(sql.raw(`${expr} = ANY(ARRAY[${f.channelGroups.map((g) => `'${g.replace(/'/g, "''")}'`).join(",")}]::text[])`))
    textParts.push(
      `(${expr}) = ANY(ARRAY[${f.channelGroups.map((g) => `'${g}'`).join(",")}]::text[])`
    )
  }

  if (f.publishers.length) {
    const pubExpr = `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '${UNMATCHED_PUBLISHER}')`
    const likes = f.publishers.map(
      (p) => sql`LOWER(${sql.raw(pubExpr)}) LIKE ${"%" + p.toLowerCase() + "%"}`
    )
    sqlParts.push(sql`(${sql.join(likes, sql` OR `)})`)
    textParts.push(
      `(${f.publishers
        .map(
          (p) =>
            `LOWER(${pubExpr}) LIKE '%${p.toLowerCase().replace(/'/g, "''")}%'`
        )
        .join(" OR ")})`
    )
  }

  if (f.buyTypes.length) {
    sqlParts.push(
      sql`LOWER(COALESCE(li.buy_type, '')) = ANY(${stringArraySql(
        f.buyTypes.map((b) => b.toLowerCase())
      )})`
    )
    textParts.push(
      `LOWER(COALESCE(li.buy_type,'')) = ANY(ARRAY[${f.buyTypes
        .map((b) => `'${b.toLowerCase().replace(/'/g, "''")}'`)
        .join(",")}]::text[])`
    )
  }

  if (f.markets.length) {
    sqlParts.push(
      sql`LOWER(COALESCE(li.market, '')) = ANY(${stringArraySql(
        f.markets.map((m) => m.toLowerCase())
      )})`
    )
    textParts.push(
      `LOWER(COALESCE(li.market,'')) = ANY(ARRAY[${f.markets
        .map((m) => `'${m.toLowerCase().replace(/'/g, "''")}'`)
        .join(",")}]::text[])`
    )
  }

  if (f.billingAgency.length) {
    const agencyExpr = `
CASE
  WHEN LOWER(BTRIM(COALESCE(p.billingagency, ''))) = '${BILLING_AGENCY_AA}' THEN 'AA'
  ELSE 'AM'
END`.trim()
    sqlParts.push(
      sql.raw(
        `(${agencyExpr}) = ANY(ARRAY[${f.billingAgency.map((a) => `'${a}'`).join(",")}]::text[])`
      )
    )
    textParts.push(
      `(${agencyExpr}) = ANY(ARRAY[${f.billingAgency.map((a) => `'${a}'`).join(",")}]::text[])`
    )
  }

  if (f.search) {
    const pattern = `%${f.search.toLowerCase()}%`
    const pubExpr = `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '${UNMATCHED_PUBLISHER}')`
    sqlParts.push(sql`(
      LOWER(COALESCE(c.mp_client_name, m.mp_client_name, '')) LIKE ${pattern}
      OR LOWER(COALESCE(m.campaign_name, v.campaign_name, '')) LIKE ${pattern}
      OR LOWER(COALESCE(m.mba_number, '')) LIKE ${pattern}
      OR LOWER(COALESCE(sm.line_item_id, '')) LIKE ${pattern}
      OR LOWER(COALESCE(li.line_item_id, '')) LIKE ${pattern}
      OR LOWER(${sql.raw(pubExpr)}) LIKE ${pattern}
    )`)
    const esc = f.search.toLowerCase().replace(/'/g, "''")
    textParts.push(`(
      LOWER(COALESCE(c.mp_client_name, m.mp_client_name, '')) LIKE '%${esc}%'
      OR LOWER(COALESCE(m.campaign_name, v.campaign_name, '')) LIKE '%${esc}%'
      OR LOWER(COALESCE(m.mba_number, '')) LIKE '%${esc}%'
      OR LOWER(COALESCE(sm.line_item_id, '')) LIKE '%${esc}%'
      OR LOWER(COALESCE(li.line_item_id, '')) LIKE '%${esc}%'
      OR LOWER(${pubExpr}) LIKE '%${esc}%'
    )`)
  }

  return { sqlParts, textParts }
}

export function buildInvestmentCutSql(q: InvestmentCutNormalized): BuiltCutSql {
  const fromDate = monthStartDate(q.from)
  const toExclusive = monthEndExclusive(q.to)
  const lineJoin = SCHEDULE_LINE_JOIN_SQL
  const filters = buildFilterClauses(q)

  const deliveryGate =
    q.basis === "delivery"
      ? `AND (
    sm.component <> 'media'
    OR COALESCE(li.client_pays_for_media, FALSE) = FALSE
  )`
      : ""

  const dimAliases: Array<{ dim: InvestmentCutDim; alias: string }> = []
  const selectDims: string[] = []
  const groupDims: string[] = []
  for (const dim of q.dimensions) {
    const { select, groupAlias } = dimSelectSql(dim)
    let sel = select
    if (dim === "fy") {
      sel = `${q.fy} AS dim_fy`
    }
    selectDims.push(sel)
    groupDims.push(groupAlias)
    dimAliases.push({ dim, alias: groupAlias })
  }

  const measureFrags = measureSelectFragments(q.measures)
  const selectList = [...selectDims, ...measureFrags].join(",\n    ")
  const groupBy =
    groupDims.length > 0 ? `GROUP BY ${groupDims.join(", ")}` : ""
  const orderBy =
    groupDims.length > 0
      ? `ORDER BY ${groupDims.map((a) => `${a} ASC NULLS LAST`).join(", ")}, billable_order DESC NULLS LAST`
      : `ORDER BY billable_order DESC NULLS LAST`

  // Repeat SUM — PG cannot reference SELECT aliases in the same select list.
  const billableOrderFrag = `COALESCE(SUM(sm.amount_cents), 0) AS billable_order`

  const selectListWithOrder = selectDims.length || measureFrags.length
    ? `${selectList},\n    ${billableOrderFrag}`
    : billableOrderFrag

  const filterSqlCombined = filters.sqlParts.length
    ? sql.join(filters.sqlParts, sql` AND `)
    : sql`TRUE`
  const filterText = filters.textParts.join("\n  AND ")

  // LATERAL LIMIT 1 keeps sm rows 1:1 (FN3a billing has no li join — must not multiply).
  const publisherLateral = `
LEFT JOIN LATERAL (
  SELECT p.billingagency
  FROM publishers p
  WHERE LOWER(BTRIM(p.publisher_name)) = LOWER(BTRIM(COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '')))
  LIMIT 1
) p ON TRUE`.trim()

  const fromJoinsText = `
FROM media_plan_masters m
INNER JOIN media_plan_versions v ON v.id = m.published_version_id
INNER JOIN schedule_months sm ON sm.version_id = v.id
  AND sm.basis = '${q.basis}'
  AND sm.component IN ('media', 'fee', 'adserving')
  AND sm.month >= DATE '${fromDate}'
  AND sm.month < DATE '${toExclusive}'
LEFT JOIN LATERAL (
  SELECT li.*
  FROM line_items li
  WHERE ${lineJoin}
  LIMIT 1
) li ON TRUE
LEFT JOIN clients c ON c.id = m.client_id
${publisherLateral}
WHERE m.published_version_id IS NOT NULL
  AND ${FINANCE_STATUS_INCLUDED_SQL}
  ${deliveryGate}
  AND ${filterText}
`.trim()

  const cutSqlText = `
SELECT
    ${selectListWithOrder}
${fromJoinsText}
${groupBy}
${orderBy}
LIMIT ${INVESTMENT_CUT_ROW_CAP + 1}
`.trim()

  const cutSql = sql`
SELECT
    ${sql.raw(selectDims.length || measureFrags.length ? `${selectList},\n    ${billableOrderFrag}` : billableOrderFrag)}
FROM media_plan_masters m
INNER JOIN media_plan_versions v ON v.id = m.published_version_id
INNER JOIN schedule_months sm ON sm.version_id = v.id
  AND sm.basis = ${q.basis}
  AND sm.component IN ('media', 'fee', 'adserving')
  AND sm.month >= ${fromDate}::date
  AND sm.month < ${toExclusive}::date
LEFT JOIN LATERAL (
  SELECT li.*
  FROM line_items li
  WHERE ${sql.raw(lineJoin)}
  LIMIT 1
) li ON TRUE
LEFT JOIN clients c ON c.id = m.client_id
LEFT JOIN LATERAL (
  SELECT p.billingagency
  FROM publishers p
  WHERE LOWER(BTRIM(p.publisher_name)) = LOWER(BTRIM(COALESCE(${sql.raw(PUBLISHER_IDENTITY_SQL.trim())}, '')))
  LIMIT 1
) p ON TRUE
WHERE m.published_version_id IS NOT NULL
  AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
  ${sql.raw(deliveryGate)}
  AND ${filterSqlCombined}
${sql.raw(groupBy)}
${sql.raw(
  groupDims.length > 0
    ? `ORDER BY ${groupDims.map((a) => `${a} ASC NULLS LAST`).join(", ")}, billable_order DESC NULLS LAST`
    : `ORDER BY billable_order DESC NULLS LAST`
)}
LIMIT ${INVESTMENT_CUT_ROW_CAP + 1}
`

  const feeCoverageSqlText = `
SELECT
  COUNT(*) FILTER (WHERE has_media) AS media_line_months,
  COUNT(*) FILTER (WHERE has_media AND has_fee) AS fee_line_months
FROM (
  SELECT
    sm.version_id,
    sm.line_item_id,
    date_trunc('month', sm.month)::date AS month,
    BOOL_OR(sm.component = 'media') AS has_media,
    BOOL_OR(sm.component = 'fee') AS has_fee
  ${fromJoinsText}
  GROUP BY 1, 2, 3
) t
`.trim()

  const feeCoverageSql = sql`
SELECT
  COUNT(*) FILTER (WHERE has_media) AS media_line_months,
  COUNT(*) FILTER (WHERE has_media AND has_fee) AS fee_line_months
FROM (
  SELECT
    sm.version_id,
    sm.line_item_id,
    date_trunc('month', sm.month)::date AS month,
    BOOL_OR(sm.component = 'media') AS has_media,
    BOOL_OR(sm.component = 'fee') AS has_fee
  FROM media_plan_masters m
  INNER JOIN media_plan_versions v ON v.id = m.published_version_id
  INNER JOIN schedule_months sm ON sm.version_id = v.id
    AND sm.basis = ${q.basis}
    AND sm.component IN ('media', 'fee', 'adserving')
    AND sm.month >= ${fromDate}::date
    AND sm.month < ${toExclusive}::date
  LEFT JOIN LATERAL (
    SELECT li.*
    FROM line_items li
    WHERE ${sql.raw(lineJoin)}
    LIMIT 1
  ) li ON TRUE
  LEFT JOIN clients c ON c.id = m.client_id
  LEFT JOIN LATERAL (
    SELECT p.billingagency
    FROM publishers p
    WHERE LOWER(BTRIM(p.publisher_name)) = LOWER(BTRIM(COALESCE(${sql.raw(PUBLISHER_IDENTITY_SQL.trim())}, '')))
    LIMIT 1
  ) p ON TRUE
  WHERE m.published_version_id IS NOT NULL
    AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
    ${sql.raw(deliveryGate)}
    AND ${filterSqlCombined}
  GROUP BY 1, 2, 3
) t
`

  const pubIdentity = PUBLISHER_IDENTITY_SQL.trim()
  const publisherMatchSqlText = `
SELECT
  COALESCE(SUM(sm.amount_cents), 0) AS billable_total_cents,
  COALESCE(SUM(CASE
    WHEN ${pubIdentity} IS NOT NULL THEN sm.amount_cents
    ELSE 0
  END), 0) AS billable_matched_cents
${fromJoinsText}
`.trim()

  const publisherMatchSql = sql`
SELECT
  COALESCE(SUM(sm.amount_cents), 0) AS billable_total_cents,
  COALESCE(SUM(CASE
    WHEN ${sql.raw(pubIdentity)} IS NOT NULL THEN sm.amount_cents
    ELSE 0
  END), 0) AS billable_matched_cents
FROM media_plan_masters m
INNER JOIN media_plan_versions v ON v.id = m.published_version_id
INNER JOIN schedule_months sm ON sm.version_id = v.id
  AND sm.basis = ${q.basis}
  AND sm.component IN ('media', 'fee', 'adserving')
  AND sm.month >= ${fromDate}::date
  AND sm.month < ${toExclusive}::date
LEFT JOIN LATERAL (
  SELECT li.*
  FROM line_items li
  WHERE ${sql.raw(lineJoin)}
  LIMIT 1
) li ON TRUE
LEFT JOIN clients c ON c.id = m.client_id
LEFT JOIN LATERAL (
  SELECT p.billingagency
  FROM publishers p
  WHERE LOWER(BTRIM(p.publisher_name)) = LOWER(BTRIM(COALESCE(${sql.raw(pubIdentity)}, '')))
  LIMIT 1
) p ON TRUE
WHERE m.published_version_id IS NOT NULL
  AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
  ${sql.raw(deliveryGate)}
  AND ${filterSqlCombined}
`

  const lineDetailCoverageSqlText = `
SELECT
  COALESCE(SUM(sm.amount_cents), 0) AS billable_total_cents,
  COALESCE(SUM(CASE WHEN NOT ${IS_SERVICE_LINE_SQL} THEN sm.amount_cents ELSE 0 END), 0) AS line_detail_cents,
  COALESCE(SUM(CASE WHEN ${IS_SERVICE_LINE_SQL} THEN sm.amount_cents ELSE 0 END), 0) AS campaign_level_cents
${fromJoinsText}
`.trim()

  const lineDetailCoverageSql = sql`
SELECT
  COALESCE(SUM(sm.amount_cents), 0) AS billable_total_cents,
  COALESCE(SUM(CASE WHEN NOT ${sql.raw(IS_SERVICE_LINE_SQL)} THEN sm.amount_cents ELSE 0 END), 0) AS line_detail_cents,
  COALESCE(SUM(CASE WHEN ${sql.raw(IS_SERVICE_LINE_SQL)} THEN sm.amount_cents ELSE 0 END), 0) AS campaign_level_cents
FROM media_plan_masters m
INNER JOIN media_plan_versions v ON v.id = m.published_version_id
INNER JOIN schedule_months sm ON sm.version_id = v.id
  AND sm.basis = ${q.basis}
  AND sm.component IN ('media', 'fee', 'adserving')
  AND sm.month >= ${fromDate}::date
  AND sm.month < ${toExclusive}::date
LEFT JOIN LATERAL (
  SELECT li.*
  FROM line_items li
  WHERE ${sql.raw(lineJoin)}
  LIMIT 1
) li ON TRUE
LEFT JOIN clients c ON c.id = m.client_id
LEFT JOIN LATERAL (
  SELECT p.billingagency
  FROM publishers p
  WHERE LOWER(BTRIM(p.publisher_name)) = LOWER(BTRIM(COALESCE(${sql.raw(pubIdentity)}, '')))
  LIMIT 1
) p ON TRUE
WHERE m.published_version_id IS NOT NULL
  AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
  ${sql.raw(deliveryGate)}
  AND ${filterSqlCombined}
`

  return {
    cutSql,
    cutSqlText,
    feeCoverageSql,
    feeCoverageSqlText,
    publisherMatchSql,
    publisherMatchSqlText,
    lineDetailCoverageSql,
    lineDetailCoverageSqlText,
    dimAliases,
  }
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "bigint") return Number(v)
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function mapCutRows(
  rawRows: Record<string, unknown>[],
  dimAliases: Array<{ dim: InvestmentCutDim; alias: string }>,
  measures: InvestmentCutMeasure[]
): InvestmentCutRow[] {
  return rawRows.map((r) => {
    const dims: InvestmentCutRow["dims"] = {}
    for (const { dim, alias } of dimAliases) {
      const v = r[alias]
      if (dim === "fy") dims[dim] = asNumber(v)
      else if (v == null) dims[dim] = null
      else dims[dim] = typeof v === "number" ? v : String(v)
    }
    const m: InvestmentCutRow["measures"] = {}
    for (const measure of measures) {
      m[measure] = asNumber(r[measure])
    }
    return { dims, measures: m }
  })
}

export async function fetchInvestmentCut(
  q: InvestmentCutNormalized
): Promise<InvestmentCutResponse> {
  const db = getDb()
  const built = buildInvestmentCutSql(q)
  const bookedMeasureKeys = bookedMeasuresForMap(q.measures)

  const wantsFeeMeta =
    q.measures.includes("fee_cents") ||
    q.measures.includes("billable_cents") ||
    measuresIncludeActuals(q.measures) ||
    measuresIncludeAgencyEconomics(q.measures)

  const fromDate = monthStartDate(q.from)
  const toExclusive = monthEndExclusive(q.to)

  const [cutResult, feeResult, matchResult, lineDetailResult, excludedResult] =
    await Promise.all([
      db.execute(built.cutSql),
      wantsFeeMeta ? db.execute(built.feeCoverageSql) : Promise.resolve(null),
      db.execute(built.publisherMatchSql),
      db.execute(built.lineDetailCoverageSql),
      db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN sm.component = 'media' THEN sm.amount_cents ELSE 0 END), 0) AS media_cents,
          COALESCE(SUM(CASE WHEN sm.component = 'fee' THEN sm.amount_cents ELSE 0 END), 0) AS fee_cents,
          COALESCE(SUM(CASE WHEN sm.component = 'adserving' THEN sm.amount_cents ELSE 0 END), 0) AS adserving_cents
        FROM media_plan_masters m
        INNER JOIN media_plan_versions v ON v.id = m.published_version_id
        INNER JOIN schedule_months sm ON sm.version_id = v.id
          AND sm.basis = ${q.basis}
          AND sm.component IN ('media', 'fee', 'adserving')
          AND sm.month >= ${fromDate}::date
          AND sm.month < ${toExclusive}::date
        WHERE m.published_version_id IS NOT NULL
          AND ${sql.raw(FINANCE_STATUS_EXCLUDED_SQL)}
      `),
    ])

  const rawRows = (cutResult as unknown as { rows?: Record<string, unknown>[] }).rows
    ?? (Array.isArray(cutResult) ? (cutResult as Record<string, unknown>[]) : [])

  const truncated = rawRows.length > INVESTMENT_CUT_ROW_CAP
  const sliced = truncated ? rawRows.slice(0, INVESTMENT_CUT_ROW_CAP) : rawRows
  let rows = mapCutRows(sliced, built.dimAliases, bookedMeasureKeys)

  // Always full-scope booked totals (independent of row cap / group slice).
  let finalTotals: Partial<Record<InvestmentCutMeasure, number>> =
    await fetchInvestmentCutTotals(q)

  const matchRows =
    (matchResult as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (Array.isArray(matchResult) ? (matchResult as Record<string, unknown>[]) : [])
  const match = matchRows[0] ?? {}
  const billableTotal = asNumber(match.billable_total_cents)
  const billableMatched = asNumber(match.billable_matched_cents)

  const lineDetailRows =
    (lineDetailResult as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (Array.isArray(lineDetailResult) ? (lineDetailResult as Record<string, unknown>[]) : [])
  const lineDetail = lineDetailRows[0] ?? {}
  const lineDetailCents = asNumber(lineDetail.line_detail_cents)
  const campaignLevelCents = asNumber(lineDetail.campaign_level_cents)
  const lineDetailBillableTotal = asNumber(lineDetail.billable_total_cents)
  const lineDetailPct =
    lineDetailBillableTotal === 0
      ? 100
      : Math.round((lineDetailCents / lineDetailBillableTotal) * 1000) / 10

  let feeMeta: InvestmentCutResponse["coverage"]["fee"] | undefined
  if (feeResult) {
    const feeRows =
      (feeResult as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (Array.isArray(feeResult) ? (feeResult as Record<string, unknown>[]) : [])
    const fr = feeRows[0] ?? {}
    const mediaLineMonths = asNumber(fr.media_line_months)
    const feeLineMonths = asNumber(fr.fee_line_months)
    feeMeta = {
      mediaLineMonths,
      feeLineMonths,
      coveragePct:
        mediaLineMonths === 0
          ? 100
          : Math.round((feeLineMonths / mediaLineMonths) * 1000) / 10,
      caveat: FEE_COVERAGE_CAVEAT,
    }
  }

  let arMeta: InvestmentCutResponse["coverage"]["ar"] | undefined
  let arSqlText: string | undefined
  if (measuresIncludeActuals(q.measures)) {
    const attached = await attachActualsMeasures(q, rows, finalTotals)
    rows = attached.rows
    finalTotals = attached.totals
    arMeta = attached.arCoverage
    arSqlText = attached.arSqlText
    // Drop internally-fetched billable if not requested
    if (!q.measures.includes("billable_cents")) {
      for (const row of rows) delete row.measures.billable_cents
      delete finalTotals.billable_cents
    }
  }

  let agencyMeta: InvestmentCutResponse["coverage"]["agency"] | undefined
  if (measuresIncludeAgencyEconomics(q.measures)) {
    const attached = await attachAgencyEconomicsMeasures(q, rows, finalTotals)
    rows = attached.rows
    finalTotals = attached.totals
    agencyMeta = attached.agency
    // Drop internally-fetched booked helpers if not requested
    for (const helper of ["fee_cents", "billable_cents", "adserving_cents"] as const) {
      if (!q.measures.includes(helper)) {
        for (const row of rows) delete row.measures[helper]
        delete finalTotals[helper]
      }
    }
  }

  const scope = `FY${q.fy} · ${q.from}→${q.to} · basis=${q.basis}${
    q.filters.clients.length ? ` · ${q.filters.clients.length} clients` : " · all clients"
  }`

  const excludedRows =
    (excludedResult as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (Array.isArray(excludedResult) ? (excludedResult as Record<string, unknown>[]) : [])
  const ex = excludedRows[0] ?? {}
  const excludedByStatusCents: ExcludedByStatusCents = {
    media: asNumber(ex.media_cents),
    fee: asNumber(ex.fee_cents),
    adserving: asNumber(ex.adserving_cents),
  }

  return {
    scope: {
      fy: q.fy,
      from: q.from,
      to: q.to,
      basis: q.basis,
      dimensions: q.dimensions,
      measures: q.measures,
      filters: q.filters,
    },
    rows,
    totals: finalTotals,
    coverage: {
      publisherMatchedPct:
        billableTotal === 0
          ? 100
          : Math.round((billableMatched / billableTotal) * 1000) / 10,
      lineDetailPct,
      lineDetailCents,
      campaignLevelCents,
      lineDetailNote: LINE_DETAIL_COVERAGE_NOTE,
      excludedByStatusCents,
      rowCount: rows.length,
      scope,
      basis: q.basis,
      ...(feeMeta ? { fee: feeMeta } : {}),
      ...(arMeta ? { ar: arMeta } : {}),
      ...(agencyMeta ? { agency: agencyMeta } : {}),
    },
    truncated,
    rowCap: INVESTMENT_CUT_ROW_CAP,
    _debugSql: {
      cut: built.cutSqlText,
      feeCoverage: built.feeCoverageSqlText,
      publisherMatch: built.publisherMatchSqlText,
      ...(arSqlText ? { arMbaMonth: arSqlText } : {}),
    },
  }
}

/** Full-scope measure totals (no GROUP BY) — used when truncated. */
async function fetchInvestmentCutTotals(
  q: InvestmentCutNormalized
): Promise<Partial<Record<InvestmentCutMeasure, number>>> {
  const db = getDb()
  const fromDate = monthStartDate(q.from)
  const toExclusive = monthEndExclusive(q.to)
  const filters = buildFilterClauses(q)
  const filterSqlCombined = filters.sqlParts.length
    ? sql.join(filters.sqlParts, sql` AND `)
    : sql`TRUE`
  const deliveryGate =
    q.basis === "delivery"
      ? `AND (
    sm.component <> 'media'
    OR COALESCE(li.client_pays_for_media, FALSE) = FALSE
  )`
      : ""
  const measureFrags = measureSelectFragments(q.measures)
  const result = await db.execute(sql`
SELECT
  ${sql.raw(measureFrags.join(",\n  "))}
FROM media_plan_masters m
INNER JOIN media_plan_versions v ON v.id = m.published_version_id
INNER JOIN schedule_months sm ON sm.version_id = v.id
  AND sm.basis = ${q.basis}
  AND sm.component IN ('media', 'fee', 'adserving')
  AND sm.month >= ${fromDate}::date
  AND sm.month < ${toExclusive}::date
LEFT JOIN LATERAL (
  SELECT li.*
  FROM line_items li
  WHERE ${sql.raw(SCHEDULE_LINE_JOIN_SQL)}
  LIMIT 1
) li ON TRUE
LEFT JOIN clients c ON c.id = m.client_id
LEFT JOIN LATERAL (
  SELECT p.billingagency
  FROM publishers p
  WHERE LOWER(BTRIM(p.publisher_name)) = LOWER(BTRIM(COALESCE(${sql.raw(PUBLISHER_IDENTITY_SQL.trim())}, '')))
  LIMIT 1
) p ON TRUE
WHERE m.published_version_id IS NOT NULL
  AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
  ${sql.raw(deliveryGate)}
  AND ${filterSqlCombined}
`)
  const rows =
    (result as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (Array.isArray(result) ? (result as Record<string, unknown>[]) : [])
  const r = rows[0] ?? {}
  const out: Partial<Record<InvestmentCutMeasure, number>> = {}
  for (const m of bookedMeasuresForMap(q.measures)) {
    out[m] = asNumber(r[m])
  }
  return out
}

/** Export SQL text for recon / MCP without executing. */
export function investmentCutSqlText(q: InvestmentCutNormalized): {
  cut: string
  feeCoverage: string
  publisherMatch: string
} {
  const built = buildInvestmentCutSql(q)
  return {
    cut: built.cutSqlText,
    feeCoverage: built.feeCoverageSqlText,
    publisherMatch: built.publisherMatchSqlText,
  }
}
