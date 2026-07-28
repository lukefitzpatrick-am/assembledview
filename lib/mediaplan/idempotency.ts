/**
 * Plan C S2-P3 — publish idempotency keys (per mba_number).
 *
 * Storage choice: columns on **media_plan_master**
 *   - last_idempotency_key (text)
 *   - last_idempotency_result (json)
 *
 * One key per MBA (latest wins). Soft-fails if columns/endpoints missing
 * (treat as no prior key — do not block saves). Luke adds columns via `.xs`.
 */

import axios from "axios"
import {
  getXanoBaseUrl,
  xanoAuthHeaderRecord,
  xanoPostHeaderRecord,
} from "@/lib/api/xano"

const XANO_TIMEOUT_MS = 15_000
const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

export const PLANC_IDEMPOTENCY_LOG_PREFIX = "[planc-idempotency]"

export type IdempotencyRecord = {
  key: string
  result: unknown
}

function resolveBase(baseUrl?: string): string | null {
  try {
    return baseUrl ?? getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
  } catch (error) {
    console.warn(PLANC_IDEMPOTENCY_LOG_PREFIX, {
      phase: "base-url",
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export function pickIdempotencyKey(body: Record<string, unknown> | null | undefined): string | null {
  if (!body || typeof body !== "object") return null
  const raw = body.idempotencyKey ?? body.idempotency_key
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function readIdempotencyFromMaster(
  master: Record<string, unknown> | null | undefined
): IdempotencyRecord | null {
  if (!master || typeof master !== "object") return null
  const key = String(
    master.last_idempotency_key ?? master.lastIdempotencyKey ?? ""
  ).trim()
  if (!key) return null
  const result =
    master.last_idempotency_result ?? master.lastIdempotencyResult ?? null
  if (result == null) return { key, result: null }
  if (typeof result === "string") {
    try {
      return { key, result: JSON.parse(result) }
    } catch {
      return { key, result }
    }
  }
  return { key, result }
}

/**
 * Persist last-processed key + result onto media_plan_master.
 * Soft-fail: logs and returns false when column/endpoint missing.
 */
export async function storeIdempotencyOnMaster(args: {
  masterId: number | string
  key: string
  result: unknown
  baseUrl?: string
}): Promise<boolean> {
  const base = resolveBase(args.baseUrl)
  if (!base) return false
  try {
    const response = await axios.patch(
      `${base}/media_plan_master/${encodeURIComponent(String(args.masterId))}`,
      {
        last_idempotency_key: args.key,
        last_idempotency_result: args.result,
      },
      {
        headers: xanoPostHeaderRecord(),
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 500,
      }
    )
    if (response.status >= 400) {
      console.warn(PLANC_IDEMPOTENCY_LOG_PREFIX, {
        phase: "store-failed",
        masterId: args.masterId,
        status: response.status,
      })
      return false
    }
    return true
  } catch (error) {
    console.warn(PLANC_IDEMPOTENCY_LOG_PREFIX, {
      phase: "store-error",
      masterId: args.masterId,
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/** Optional GET refresh if master payload lacked the columns. Soft-fail. */
export async function fetchMasterIdempotency(args: {
  masterId: number | string
  baseUrl?: string
}): Promise<IdempotencyRecord | null> {
  const base = resolveBase(args.baseUrl)
  if (!base) return null
  try {
    const response = await axios.get(
      `${base}/media_plan_master/${encodeURIComponent(String(args.masterId))}`,
      {
        headers: xanoAuthHeaderRecord(),
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 500,
      }
    )
    if (response.status >= 400) return null
    const data = response.data
    const row =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null
    return readIdempotencyFromMaster(row)
  } catch {
    return null
  }
}
