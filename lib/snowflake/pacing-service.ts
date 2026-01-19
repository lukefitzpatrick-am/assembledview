import "server-only"

import { cache } from "react"

import { querySnowflake } from "@/lib/snowflake/query"

type Channel = "meta" | "tiktok" | "programmatic-display" | "programmatic-video"

export type PacingRow = {
  channel: Channel
  dateDay: string
  adsetName: string | null
  entityName: string | null
  campaignId: string | null
  campaignName: string | null
  adsetId: string | null
  entityId: string | null
  lineItemId: string | null
  amountSpent: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
  maxFivetranSyncedAt: string | null
  updatedAt: string | null
}

type RawRow = {
  CHANNEL: string
  DATE_DAY: string
  LINE_ITEM_ID: string | null
  ADSET_NAME: string | null
  ADSET_ID: string | null
  CAMPAIGN_ID: string | null
  CAMPAIGN_NAME: string | null
  AMOUNT_SPENT: number | null
  IMPRESSIONS: number | null
  CLICKS: number | null
  RESULTS: number | null
  VIDEO_3S_VIEWS: number | null
  MAX_FIVETRAN_SYNCED_AT: string | null
  UPDATED_AT: string | null
}

const MAX_RANGE_DAYS = 180
const MAX_IDS = 500
const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"
const ALLOWED_CHANNELS: Channel[] = ["meta", "tiktok", "programmatic-display", "programmatic-video"]

function normalizeDateString(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed.toISOString().slice(0, 10)
}

function clampDateRange(startDate?: string, endDate?: string) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const end = normalizeDateString(endDate) ?? todayISO
  const endDateObj = new Date(end)
  const earliestAllowed = new Date(endDateObj.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000)
  const startProvided = normalizeDateString(startDate)
  const start =
    startProvided && startProvided >= earliestAllowed.toISOString().slice(0, 10)
      ? startProvided
      : earliestAllowed.toISOString().slice(0, 10)

  return { start, end }
}

function prepareIds(lineItemIds?: string[] | null) {
  if (!Array.isArray(lineItemIds)) return []
  const unique = new Set<string>()
  lineItemIds.forEach((id) => {
    const normalized = String(id).trim()
    if (normalized) unique.add(normalized.toLowerCase())
  })
  return Array.from(unique).sort()
}

export const getCampaignPacingData = cache(
  async (
    mbaNumber: string | null | undefined,
    lineItemIds: string[] | null | undefined,
    startDate?: string,
    endDate?: string
  ): Promise<PacingRow[]> => {
  if (!mbaNumber) {
    throw new Error("mbaNumber is required")
  }

  let normalizedIds = prepareIds(lineItemIds)
  if (!normalizedIds.length) {
    return []
  }

  if (normalizedIds.length > MAX_IDS) {
    if (DEBUG_PACING) {
      console.warn("[Pacing] truncating id list to limit", {
        mbaNumber,
        idCount: normalizedIds.length,
        max: MAX_IDS,
      })
    }
    normalizedIds = normalizedIds.slice(0, MAX_IDS)
  }

  const { start, end } = clampDateRange(startDate, endDate)

  if (DEBUG_PACING) {
    console.log("[Pacing] query input", {
      mbaNumber,
      idsCount: normalizedIds.length,
      dateRange: { start, end },
    })
  }

  const placeholders = normalizedIds.map(() => "?").join(", ")

  const sql = `
  SELECT
    CHANNEL,
    DATE_DAY,
    /* alias to existing field names so containers don’t change */
    ENTITY_NAME AS ADSET_NAME,
    NULL AS CAMPAIGN_ID,
    CAMPAIGN_NAME,
    ENTITY_ID AS ADSET_ID,
    LINE_ITEM_ID,
    AMOUNT_SPENT,
    IMPRESSIONS,
    CLICKS,
    RESULTS,
    VIDEO_3S_VIEWS,
    MAX_FIVETRAN_SYNCED_AT,
    UPDATED_AT
  FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE LINE_ITEM_ID IN (${placeholders})
    AND DATE_DAY BETWEEN TO_DATE(?) AND TO_DATE(?)
  ORDER BY DATE_DAY ASC, CHANNEL ASC
  LIMIT 50000
`

  const binds = [...normalizedIds, start, end]

  const rows = await querySnowflake<RawRow>(sql, binds)

  const unknownChannels = new Set<string>()
  const filteredRows = rows.filter((row) => {
    const channel = String(row.CHANNEL ?? "").toLowerCase()
    const allowed = (ALLOWED_CHANNELS as string[]).includes(channel)
    if (!allowed) {
      unknownChannels.add(channel)
    }
    return allowed
  })

  if (DEBUG_PACING) {
    const distinctChannels = new Set(
      filteredRows.map((row) => String(row.CHANNEL ?? "").toLowerCase())
    )
    console.log("[Pacing] query result", {
      mbaNumber,
      idsCount: normalizedIds.length,
      dateRange: { start, end },
      rowsReturned: filteredRows.length,
      distinctChannels: Array.from(distinctChannels),
      unknownChannels: unknownChannels.size ? Array.from(unknownChannels) : undefined,
    })

    if (filteredRows.length === 0) {
      try {
        const probePlaceholders = normalizedIds.map(() => "?").join(", ")
        const probeSql = `
          SELECT DISTINCT CHANNEL, LINE_ITEM_ID
          FROM ASSEMBLEDVIEW.MART.PACING_FACT
          WHERE LINE_ITEM_ID IN (${probePlaceholders})
          LIMIT 10
        `
        const probeMatches = await querySnowflake<{ CHANNEL: string; LINE_ITEM_ID: string }>(
          probeSql,
          normalizedIds
        )

        console.log("[Pacing] zero-row probe", {
          mbaNumber,
          idsCount: normalizedIds.length,
          probeMatchesLength: probeMatches.length,
          probeMatchesSample: probeMatches,
        })
      } catch (error) {
        console.error("[Pacing] zero-row probe failed", { error })
      }
    }
  }

  return filteredRows.map((row) => {
    const channel = String(row.CHANNEL ?? "").toLowerCase() as Channel
    const dateDay = normalizeDateString(row.DATE_DAY) ?? String(row.DATE_DAY ?? "")
    const lineItemId =
      row.LINE_ITEM_ID && String(row.LINE_ITEM_ID).trim()
        ? String(row.LINE_ITEM_ID).trim().toLowerCase()
        : null

    return {
      channel,
      dateDay,
      adsetName: row.ADSET_NAME ?? null,
      entityName: row.ADSET_NAME ?? null,
      campaignId: row.CAMPAIGN_ID ?? null,
      campaignName: row.CAMPAIGN_NAME ?? null,
      adsetId: row.ADSET_ID ?? null,
      entityId: row.ADSET_ID ?? null,
      lineItemId,
      amountSpent: Number(row.AMOUNT_SPENT ?? 0),
      impressions: Number(row.IMPRESSIONS ?? 0),
      clicks: Number(row.CLICKS ?? 0),
      results: Number(row.RESULTS ?? 0),
      video3sViews: Number(row.VIDEO_3S_VIEWS ?? 0),
      maxFivetranSyncedAt: row.MAX_FIVETRAN_SYNCED_AT ?? null,
      updatedAt: row.UPDATED_AT ?? null,
    }
  })
  }
)
