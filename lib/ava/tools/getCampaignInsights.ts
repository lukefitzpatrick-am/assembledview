import type AvaTool from "./types"
import { getAvaDb, schema } from "@/db/avaClient"
import { and, desc, eq, isNull } from "drizzle-orm"
import {
  asNumber,
  asRecord,
  asString,
  jsonContent,
  resolveScopedMba,
} from "./helpers"
import { requireAvaDbOrSoftFail } from "./postgresShared"

const INSIGHT_TYPES = new Set([
  "delivery",
  "audience",
  "creative",
  "channel",
  "commercial",
])

function clampLimit(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(50, Math.max(1, Math.floor(n)))
}

function mapInsight(row: {
  id: number
  mbaNumber: string
  clientId: number
  period: string | null
  insightType: string
  body: string
  source: string
  createdBy: string
  createdAt: string
}) {
  return {
    id: Number(row.id),
    mba_number: row.mbaNumber,
    client_id: Number(row.clientId),
    period: row.period,
    insight_type: row.insightType,
    body: row.body,
    source: row.source,
    created_by: row.createdBy,
    created_at: row.createdAt,
  }
}

/**
 * Live campaign_insights only (superseded_by IS NULL).
 * Context for commentary / rationale / reports — never a numeric source.
 */
export const getClientInsightsTool: AvaTool = {
  definition: {
    name: "get_client_insights",
    description:
      "Load live prior campaign insights for a client (superseded rows excluded). Call BEFORE writing plan rationale, delivery commentary, or a performance report. Insights are context — do not restate them as current findings without attributing what was believed before and what has changed. Never use insight bodies for delivery $ / KPI figures.",
    input_schema: {
      type: "object",
      properties: {
        client_id: {
          type: "number",
          description: "Numeric clients.id",
        },
        clientId: {
          type: "number",
          description: "Alias for client_id",
        },
        limit: {
          type: "number",
          description: "Max rows (default 10, max 50)",
        },
        insight_type: {
          type: "string",
          description:
            "Optional filter: delivery | audience | creative | channel | commercial",
        },
        insightType: {
          type: "string",
          description: "Alias for insight_type",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input) {
    const gate = requireAvaDbOrSoftFail()
    if (!gate.ok) return gate.result

    const args = asRecord(input)
    const clientId =
      asNumber(args.client_id) ?? asNumber(args.clientId) ?? null
    if (clientId == null || clientId <= 0) {
      return {
        content: "client_id is required (positive number).",
        isError: true,
      }
    }

    const insightTypeRaw =
      asString(args.insight_type) ?? asString(args.insightType) ?? ""
    const insightType = insightTypeRaw.trim()
    if (insightType && !INSIGHT_TYPES.has(insightType)) {
      return {
        content: `insight_type must be one of: ${[...INSIGHT_TYPES].join(", ")}`,
        isError: true,
      }
    }

    const limit = clampLimit(args.limit, 10)
    const db = getAvaDb()
    const where = [
      eq(schema.campaignInsights.clientId, Math.floor(clientId)),
      isNull(schema.campaignInsights.supersededBy),
    ]
    if (insightType) {
      where.push(eq(schema.campaignInsights.insightType, insightType))
    }

    const rows = await db
      .select({
        id: schema.campaignInsights.id,
        mbaNumber: schema.campaignInsights.mbaNumber,
        clientId: schema.campaignInsights.clientId,
        period: schema.campaignInsights.period,
        insightType: schema.campaignInsights.insightType,
        body: schema.campaignInsights.body,
        source: schema.campaignInsights.source,
        createdBy: schema.campaignInsights.createdBy,
        createdAt: schema.campaignInsights.createdAt,
      })
      .from(schema.campaignInsights)
      .where(and(...where))
      .orderBy(desc(schema.campaignInsights.createdAt))
      .limit(limit)

    return {
      content: jsonContent({
        client_id: Math.floor(clientId),
        live_only: true,
        count: rows.length,
        items: rows.map(mapInsight),
        note: "Prior insights are context. Attribute them when building on them; do not restate as current analysis. Delivery figures come only from get_delivery_snapshot.",
      }),
      isError: false,
    }
  },
}

export const getCampaignInsightsTool: AvaTool = {
  definition: {
    name: "get_campaign_insights",
    description:
      "Load live prior insights for an MBA (superseded rows excluded). Call BEFORE delivery commentary or generate_performance_report. Context only — attribute priors; never copy into current findings; never use bodies for deck numeric fields.",
    input_schema: {
      type: "object",
      properties: {
        mba_number: {
          type: "string",
          description: "MBA number (defaults to page context)",
        },
        mbaNumber: {
          type: "string",
          description: "Alias for mba_number",
        },
        mba: {
          type: "string",
          description: "Alias for mba_number",
        },
        limit: {
          type: "number",
          description: "Max rows (default 15, max 50)",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const gate = requireAvaDbOrSoftFail()
    if (!gate.ok) return gate.result

    const args = asRecord(input)
    const hint =
      asString(args.mba_number) ??
      asString(args.mbaNumber) ??
      asString(args.mba) ??
      ""
    const scoped = resolveScopedMba(context, hint)
    if (!scoped.ok) return { content: scoped.error, isError: true }
    if (!scoped.mba) {
      return {
        content: "mba_number is required (argument or page context).",
        isError: true,
      }
    }

    const limit = clampLimit(args.limit, 15)
    const db = getAvaDb()
    const rows = await db
      .select({
        id: schema.campaignInsights.id,
        mbaNumber: schema.campaignInsights.mbaNumber,
        clientId: schema.campaignInsights.clientId,
        period: schema.campaignInsights.period,
        insightType: schema.campaignInsights.insightType,
        body: schema.campaignInsights.body,
        source: schema.campaignInsights.source,
        createdBy: schema.campaignInsights.createdBy,
        createdAt: schema.campaignInsights.createdAt,
      })
      .from(schema.campaignInsights)
      .where(
        and(
          eq(schema.campaignInsights.mbaNumber, scoped.mba),
          isNull(schema.campaignInsights.supersededBy),
        ),
      )
      .orderBy(desc(schema.campaignInsights.createdAt))
      .limit(limit)

    return {
      content: jsonContent({
        mba_number: scoped.mba,
        live_only: true,
        count: rows.length,
        items: rows.map(mapInsight),
        note: "Prior insights are context. Attribute them when building on them; do not restate as current analysis. Delivery figures come only from get_delivery_snapshot.",
      }),
      isError: false,
    }
  },
}
