/**
 * CP-8 — Client-pays detail under Costs.
 *
 * Inverted CP-3 footprint: published tip · delivery media · client_pays_for_media
 * · statuses approved|booked|completed · SCHEDULE_LINE_JOIN_SQL.
 * Fee omitted (C-27). Complements payables headline media.
 */

import { sql, type SQL } from "drizzle-orm"
import { getDb } from "@/db"
import { getCurrentBillingMonth } from "@/lib/finance/months"
import {
  CLIENT_PAYS_FEE_OMIT_NOTE,
  CLIENT_PAYS_LINE_DETAIL_NOTE,
  CLIENT_PAYS_PAGE_CAPTION,
  nestClientPaysRows,
  type ClientPaysClientNode,
  type FlatClientPaysRow,
} from "@/lib/finance/sections/clientPaysCompose"
import {
  FINANCE_STATUS_EXCLUDED_SQL,
  FINANCE_STATUS_INCLUDED_SQL,
  formatExcludedByStatusCaption,
  type ExcludedByStatusCents,
} from "@/lib/finance/sections/financeCampaignStatus"
import { monthsInRange } from "@/lib/finance/sections/investment/agencyEconomics"
import {
  normalizeCostsQuery,
  type FinanceCostsQuery,
} from "@/lib/finance/sections/costsQuery"
import {
  PUBLISHER_IDENTITY_SQL,
  UNSPECIFIED_PUBLISHER,
} from "@/lib/finance/sections/publisherIdentitySql"
import { SCHEDULE_LINE_JOIN_SQL } from "@/lib/finance/sections/scheduleLineJoinSql"
import { IS_SERVICE_LINE_SQL } from "@/lib/finance/sections/serviceLineBucket"

export type FinanceClientPaysQuery = Pick<
  FinanceCostsQuery,
  "fy" | "from" | "to" | "clientIds" | "channels"
>

export type FinanceClientPaysPayload = {
  scope: {
    fy: number
    from: string
    to: string
    clients: number[]
    channels: string[]
    currentMonth: string
  }
  caption: string
  kpis: {
    clientPaidMediaCents: number
    lineCount: number
    mbaCount: number
    clientCount: number
    byClient: Array<{ clientId: number; clientName: string; mediaCents: number }>
    basis: string
  }
  months: string[]
  clients: ClientPaysClientNode[]
  coverage: {
    clientPaysExcludedByStatusCents: number
    excludedByStatusCents: ExcludedByStatusCents
    excludedByStatusCaption: string
    lineDetailNote: string
    feeNote: string
    note: string
  }
}

function monthStartDate(yyyyMm: string): string {
  return `${yyyyMm}-01`
}

function monthEndExclusive(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map((x) => Number.parseInt(x, 10))
  const d = new Date(y!, m! - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function clientFilterSql(clientIds: number[]): SQL {
  if (!clientIds.length) return sql`TRUE`
  return sql`m.client_id = ANY(ARRAY[${sql.join(
    clientIds.map((id) => sql`${id}::bigint`),
    sql`, `
  )}])`
}

function channelFilterSql(channels: string[]): SQL {
  if (!channels.length) return sql`TRUE`
  return sql`li.channel::text = ANY(ARRAY[${sql.join(
    channels.map((c) => sql`${c}`),
    sql`, `
  )}])`
}

function executeRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const r = result as { rows?: Record<string, unknown>[] }
  return Array.isArray(r.rows) ? r.rows : []
}

function asBigInt(v: unknown): number {
  if (typeof v === "bigint") return Number(v)
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function normalizeClientPaysQuery(input: {
  fy?: number
  from?: string
  to?: string
  clients?: number[]
  channels?: string[]
  today?: Date
}): FinanceClientPaysQuery {
  const base = normalizeCostsQuery({
    fy: input.fy,
    from: input.from,
    to: input.to,
    clients: input.clients,
    channels: input.channels,
    today: input.today,
  })
  return {
    fy: base.fy,
    from: base.from,
    to: base.to,
    clientIds: base.clientIds,
    channels: base.channels,
  }
}

export async function fetchFinanceClientPays(
  input: FinanceClientPaysQuery
): Promise<FinanceClientPaysPayload> {
  const db = getDb()
  const q = input
  const fromDate = monthStartDate(q.from)
  const toExclusive = monthEndExclusive(q.to)
  const currentMonth = getCurrentBillingMonth()
  const clientSql = clientFilterSql(q.clientIds)
  const channelSql = channelFilterSql(q.channels)
  const lineJoin = sql.raw(SCHEDULE_LINE_JOIN_SQL)
  const statusIncluded = sql.raw(FINANCE_STATUS_INCLUDED_SQL)
  const statusExcluded = sql.raw(FINANCE_STATUS_EXCLUDED_SQL)
  const isService = sql.raw(IS_SERVICE_LINE_SQL)
  const publisherExpr = `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '${UNSPECIFIED_PUBLISHER}')`

  const detailAgg = await db.execute(sql`
    SELECT
      m.client_id AS client_id,
      COALESCE(
        NULLIF(BTRIM(c.mp_client_name), ''),
        NULLIF(BTRIM(m.mp_client_name), ''),
        'Unknown'
      ) AS client_name,
      m.mba_number AS mba_number,
      COALESCE(
        NULLIF(BTRIM(m.campaign_name), ''),
        NULLIF(BTRIM(v.campaign_name), ''),
        ''
      ) AS campaign_name,
      LOWER(COALESCE(v.campaign_status, '')) AS campaign_status,
      li.line_item_id AS line_item_id,
      ${sql.raw(publisherExpr)} AS publisher,
      li.channel::text AS channel,
      to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS month,
      SUM(sm.amount_cents)::bigint AS media_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component = 'media'
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    INNER JOIN line_items li
      ON ${lineJoin}
    LEFT JOIN clients c ON c.id = m.client_id
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
      AND COALESCE(li.client_pays_for_media, FALSE) = TRUE
      AND NOT (${isService})
      AND ${clientSql}
      AND ${channelSql}
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
  `)

  const excludedByStatusAgg = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE
        WHEN sm.component = 'media'
          AND COALESCE(li.client_pays_for_media, FALSE) = TRUE
        THEN sm.amount_cents ELSE 0 END), 0) AS client_pays_media_cents,
      COALESCE(SUM(CASE WHEN sm.component = 'media' THEN sm.amount_cents ELSE 0 END), 0)
        AS media_cents,
      COALESCE(SUM(CASE WHEN sm.component = 'fee' THEN sm.amount_cents ELSE 0 END), 0)
        AS fee_cents,
      COALESCE(SUM(CASE WHEN sm.component = 'adserving' THEN sm.amount_cents ELSE 0 END), 0)
        AS adserving_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    LEFT JOIN line_items li
      ON ${lineJoin}
    WHERE m.published_version_id IS NOT NULL
      AND ${statusExcluded}
      AND ${clientSql}
  `)

  const flat: FlatClientPaysRow[] = executeRows(detailAgg).map((row) => ({
    clientId: asBigInt(row.client_id),
    clientName: String(row.client_name ?? "Unknown"),
    mbaNumber: String(row.mba_number ?? ""),
    campaignName: String(row.campaign_name ?? ""),
    campaignStatus: String(row.campaign_status ?? ""),
    lineItemId: String(row.line_item_id ?? ""),
    publisher: String(row.publisher ?? UNSPECIFIED_PUBLISHER),
    channel: row.channel == null ? null : String(row.channel),
    month: String(row.month ?? ""),
    mediaCents: asBigInt(row.media_cents),
  }))

  const nested = nestClientPaysRows(flat)
  const months = monthsInRange(q.from, q.to)

  let clientPaidMediaCents = 0
  const lineIds = new Set<string>()
  const mbaIds = new Set<string>()
  for (const client of nested) {
    clientPaidMediaCents += client.totalCents
    for (const mba of client.mbas) {
      mbaIds.add(mba.mbaNumber)
      for (const line of mba.lines) lineIds.add(`${mba.mbaNumber}\0${line.lineItemId}`)
    }
  }

  const excludedRow = executeRows(excludedByStatusAgg)[0] ?? {}
  const excludedByStatusCents: ExcludedByStatusCents = {
    media: asBigInt(excludedRow.media_cents),
    fee: asBigInt(excludedRow.fee_cents),
    adserving: asBigInt(excludedRow.adserving_cents),
  }
  const clientPaysExcludedByStatusCents = asBigInt(excludedRow.client_pays_media_cents)

  return {
    scope: {
      fy: q.fy,
      from: q.from,
      to: q.to,
      clients: q.clientIds,
      channels: q.channels,
      currentMonth,
    },
    caption: CLIENT_PAYS_PAGE_CAPTION,
    kpis: {
      clientPaidMediaCents,
      lineCount: lineIds.size,
      mbaCount: mbaIds.size,
      clientCount: nested.length,
      byClient: nested.map((c) => ({
        clientId: c.clientId,
        clientName: c.clientName,
        mediaCents: c.totalCents,
      })),
      basis:
        "delivery · client-pays media only · statuses approved/booked/completed · line detail required",
    },
    months,
    clients: nested,
    coverage: {
      clientPaysExcludedByStatusCents,
      excludedByStatusCents,
      excludedByStatusCaption: formatExcludedByStatusCaption(excludedByStatusCents.media),
      lineDetailNote: CLIENT_PAYS_LINE_DETAIL_NOTE,
      feeNote: CLIENT_PAYS_FEE_OMIT_NOTE,
      note: `${CLIENT_PAYS_LINE_DETAIL_NOTE} ${CLIENT_PAYS_FEE_OMIT_NOTE}`,
    },
  }
}
