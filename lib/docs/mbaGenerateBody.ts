/**
 * Allowlisted POST /api/mba/generate body. Totals stay forbidden.
 * liveCampaignDates is independent of overlay keys (MBA-LIVE-2).
 */

import { parseLiveCampaignDates, type LiveCampaignDates } from "@/lib/docs/liveCampaignDates"
import type { LiveMbaSelection } from "@/lib/docs/mbaRenderFilters"

export const MBA_GENERATE_ALLOWED_KEYS = new Set([
  "mba_number",
  "version_number",
  "mbanumber",
  "campaign_status",
  "selectedMonthYears",
  "approvedLineItemIds",
  "liveCampaignDates",
])

export type ParsedMbaGenerateBody =
  | {
      ok: false
      status: 400
      payload: {
        error: string
        code: string
        extra_keys?: string[]
      }
    }
  | {
      ok: true
      mbaNumber: string
      versionNumber: number
      liveCampaignStatus: string | null
      liveSelection: LiveMbaSelection | undefined
      liveCampaignDates: LiveCampaignDates | undefined
    }

function parseOptionalStringArray(
  raw: Record<string, unknown>,
  key: string
): string[] | undefined | "invalid" {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) return undefined
  const value = raw[key]
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return "invalid"
  }
  return value as string[]
}

export function parseMbaGenerateBody(body: unknown): ParsedMbaGenerateBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      payload: { error: "Invalid JSON body", code: "BAD_REQUEST" },
    }
  }

  const raw = body as Record<string, unknown>
  const extra = Object.keys(raw).filter((k) => !MBA_GENERATE_ALLOWED_KEYS.has(k))
  if (extra.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        error:
          "Client-sent totals rejected — pass mba_number and version_number only",
        extra_keys: extra,
        code: "CLIENT_TOTALS_REJECTED",
      },
    }
  }

  const mbaNumber = String(raw.mba_number ?? raw.mbanumber ?? "").trim()
  const versionNumber = Number(raw.version_number)
  if (!mbaNumber || !Number.isFinite(versionNumber) || versionNumber <= 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "mba_number and version_number are required",
        code: "BAD_REQUEST",
      },
    }
  }

  const selectedMonthYears = parseOptionalStringArray(raw, "selectedMonthYears")
  if (selectedMonthYears === "invalid") {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "selectedMonthYears must be an array of strings",
        code: "BAD_REQUEST",
      },
    }
  }
  const approvedLineItemIds = parseOptionalStringArray(raw, "approvedLineItemIds")
  if (approvedLineItemIds === "invalid") {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "approvedLineItemIds must be an array of strings",
        code: "BAD_REQUEST",
      },
    }
  }

  const liveCampaignDates = parseLiveCampaignDates(raw)
  if (liveCampaignDates === "invalid") {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "liveCampaignDates must be { start, end } ISO yyyy-mm-dd",
        code: "BAD_REQUEST",
      },
    }
  }

  const liveSelection =
    selectedMonthYears !== undefined || approvedLineItemIds !== undefined
      ? {
          ...(selectedMonthYears !== undefined ? { selectedMonthYears } : {}),
          ...(approvedLineItemIds !== undefined ? { approvedLineItemIds } : {}),
        }
      : undefined

  return {
    ok: true,
    mbaNumber,
    versionNumber,
    liveCampaignStatus:
      raw.campaign_status == null ? null : String(raw.campaign_status),
    liveSelection,
    liveCampaignDates,
  }
}
