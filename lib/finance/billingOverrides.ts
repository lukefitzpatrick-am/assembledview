/**
 * Load `billing_overrides` for a media_plan_version and attach them onto
 * {@link LineItemInput} as `billingOverride` (media) / `feeOverride` (fee).
 */

import axios from "axios"
import { getXanoBaseUrl, parseXanoListPayload, xanoAuthHeaderRecord } from "@/lib/api/xano"
import type {
  BillingOverride,
  BillingOverrideReason,
  FeeOverride,
  LineItemInput,
  MonthAmount,
} from "@/lib/finance/campaignFinancials.types"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"

const XANO_TIMEOUT_MS = 15_000
const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

export type BillingOverrideComponent = "media" | "fee"

/** Raw row shape from GET /billing_overrides (Xano). */
export type BillingOverrideRow = {
  id?: number | string
  media_plan_version_id?: number | string
  media_plan_versions_id?: number | string
  version_id?: number | string
  line_item_id?: string
  lineItemId?: string
  component?: BillingOverrideComponent | string | null
  mode?: string | null
  reason?: string | null
  months?: MonthAmount[] | string | null
  date_basis?: string | null
  dateBasis?: string | null
}

function parseMonths(raw: unknown): MonthAmount[] {
  let value: unknown = raw
  if (typeof value === "string") {
    const t = value.trim()
    if (!t) return []
    try {
      value = JSON.parse(t)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const out: MonthAmount[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const month = String((entry as { month?: unknown }).month ?? "").trim()
    const amount = parseMoneyInput((entry as { amount?: string | number | null | undefined }).amount) ?? 0
    if (!month) continue
    out.push({ month, amount: roundMoney2(amount) })
  }
  return out
}

function asOverrideReason(raw: unknown): BillingOverrideReason | undefined {
  const s = String(raw ?? "").trim().toLowerCase()
  if (s === "prepayment" || s === "client_terms" || s === "manual") return s
  return undefined
}

function rowLineItemId(row: BillingOverrideRow): string {
  return String(row.line_item_id ?? row.lineItemId ?? "").trim()
}

function rowComponent(row: BillingOverrideRow): BillingOverrideComponent {
  const c = String(row.component ?? "media").trim().toLowerCase()
  return c === "fee" ? "fee" : "media"
}

function rowDateBasis(row: BillingOverrideRow): string {
  return String(row.date_basis ?? row.dateBasis ?? "").trim()
}

function versionIdMatches(row: BillingOverrideRow, versionId: string | number): boolean {
  const candidates = [
    row.media_plan_version_id,
    row.media_plan_versions_id,
    row.version_id,
  ]
  const target = String(versionId)
  return candidates.some((c) => c != null && String(c) === target)
}

/**
 * GET /billing_overrides filtered to a media_plan_version id.
 * Returns [] when the table/endpoint is missing or empty (soft-fail).
 */
export async function fetchBillingOverridesForVersion(
  versionId: string | number,
  opts?: { baseUrl?: string }
): Promise<BillingOverrideRow[]> {
  if (versionId == null || String(versionId).trim() === "") return []

  let baseUrl = opts?.baseUrl
  try {
    baseUrl ??= getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
  } catch {
    return []
  }

  try {
    const response = await axios.get(`${baseUrl}/billing_overrides`, {
      params: {
        media_plan_version_id: versionId,
        page: 1,
        per_page: 200,
      },
      headers: xanoAuthHeaderRecord(),
      timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    if (response.status === 404) return []
    if (response.status >= 400) {
      console.warn("[billingOverrides] GET failed", {
        versionId,
        status: response.status,
      })
      return []
    }
    const rows = parseXanoListPayload(response.data) as BillingOverrideRow[]
    return rows.filter((r) => versionIdMatches(r, versionId) || !r.media_plan_version_id)
  } catch (error) {
    console.warn("[billingOverrides] GET threw; treating as no overrides", {
      versionId,
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export function billingOverrideFromRow(row: BillingOverrideRow): BillingOverride | null {
  const months = parseMonths(row.months)
  if (!months.length) return null
  const mode = String(row.mode ?? "manual").trim().toLowerCase()
  return {
    mode: mode === "auto" ? "auto" : "manual",
    reason: asOverrideReason(row.reason),
    months,
    dateBasis: rowDateBasis(row),
  }
}

export function feeOverrideFromRow(row: BillingOverrideRow): FeeOverride | null {
  const months = parseMonths(row.months)
  if (!months.length) return null
  return {
    mode: "manual",
    reason: asOverrideReason(row.reason),
    months,
    dateBasis: rowDateBasis(row),
    component: "fee",
  }
}

/**
 * Attach table overrides onto line inputs (table wins over any client-stamped override).
 * Rows with `component: 'fee'` → `feeOverride`; otherwise → `billingOverride`.
 */
export function attachOverridesToLineInputs(
  lineItems: LineItemInput[],
  rows: BillingOverrideRow[]
): LineItemInput[] {
  if (!rows.length) return lineItems

  const mediaByLine = new Map<string, BillingOverride>()
  const feeByLine = new Map<string, FeeOverride>()

  for (const row of rows) {
    const id = rowLineItemId(row)
    if (!id) continue
    if (rowComponent(row) === "fee") {
      const fee = feeOverrideFromRow(row)
      if (fee) feeByLine.set(id, fee)
    } else {
      const media = billingOverrideFromRow(row)
      if (media) mediaByLine.set(id, media)
    }
  }

  if (mediaByLine.size === 0 && feeByLine.size === 0) return lineItems

  return lineItems.map((line) => {
    const canon = (() => {
      const s = String(line.lineItemId ?? "").trim()
      const m = /^billing-[^:]+::(.+)$/.exec(s)
      return m?.[1] ? m[1].trim() : s
    })()
    const media =
      mediaByLine.get(line.lineItemId) ?? (canon ? mediaByLine.get(canon) : undefined)
    const fee = feeByLine.get(line.lineItemId) ?? (canon ? feeByLine.get(canon) : undefined)
    if (!media && !fee) return line
    return {
      ...line,
      ...(media ? { billingOverride: media } : {}),
      ...(fee ? { feeOverride: fee } : {}),
    }
  })
}
