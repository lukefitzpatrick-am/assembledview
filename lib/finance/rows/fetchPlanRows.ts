/**
 * Plan C S2-P5 — soft-fail fetch of plan_billing_rows / plan_delivery_rows.
 */

import axios from "axios"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
} from "@/lib/api/xano"
import { PLANC_ROWS_MISSING_PREFIX } from "@/lib/finance/rows/dualWrite"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"

const XANO_TIMEOUT_MS = 30_000
const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

let missingLoggedKeys = new Set<string>()

function logMissingOnce(key: string, detail: Record<string, unknown>): void {
  if (missingLoggedKeys.has(key)) return
  missingLoggedKeys.add(key)
  console.warn(PLANC_ROWS_MISSING_PREFIX, detail)
}

export function resetPlanRowsReadMissingLogForTests(): void {
  missingLoggedKeys = new Set()
}

export type PlanRowsForVersion = {
  billingRows: PlanBillingRow[]
  deliveryRows: PlanDeliveryRow[]
}

export type PlanRowsFetchTransport = {
  listBilling(versionId: string | number): Promise<PlanBillingRow[]>
  listDelivery(versionId: string | number): Promise<PlanDeliveryRow[]>
}

let transportOverride: PlanRowsFetchTransport | null = null

export function setPlanRowsFetchTransportForTests(transport: PlanRowsFetchTransport | null): void {
  transportOverride = transport
}

function createXanoFetchTransport(baseUrl?: string): PlanRowsFetchTransport {
  const resolveBase = (): string | null => {
    try {
      return baseUrl ?? getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    } catch (error) {
      logMissingOnce("read-base-url", {
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  return {
    async listBilling(versionId) {
      const base = resolveBase()
      if (!base) return []
      try {
        const response = await axios.get(`${base}/plan_billing_rows`, {
          params: { media_plan_version: versionId, page: 1, per_page: 1000 },
          headers: xanoAuthHeaderRecord(),
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
        if (response.status === 404) {
          logMissingOnce("billing-read", { versionId, status: 404 })
          return []
        }
        if (response.status >= 400) {
          logMissingOnce("billing-read", { versionId, status: response.status })
          return []
        }
        return parseXanoListPayload(response.data) as PlanBillingRow[]
      } catch (error) {
        logMissingOnce("billing-read-err", {
          versionId,
          message: error instanceof Error ? error.message : String(error),
        })
        return []
      }
    },
    async listDelivery(versionId) {
      const base = resolveBase()
      if (!base) return []
      try {
        const response = await axios.get(`${base}/plan_delivery_rows`, {
          params: { media_plan_version: versionId, page: 1, per_page: 1000 },
          headers: xanoAuthHeaderRecord(),
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
        if (response.status === 404) {
          logMissingOnce("delivery-read", { versionId, status: 404 })
          return []
        }
        if (response.status >= 400) {
          logMissingOnce("delivery-read", { versionId, status: response.status })
          return []
        }
        return parseXanoListPayload(response.data) as PlanDeliveryRow[]
      } catch (error) {
        logMissingOnce("delivery-read-err", {
          versionId,
          message: error instanceof Error ? error.message : String(error),
        })
        return []
      }
    },
  }
}

function transport(baseUrl?: string): PlanRowsFetchTransport {
  return transportOverride ?? createXanoFetchTransport(baseUrl)
}

/** Fetch typed rows for one version. Soft-fails → empty arrays. */
export async function fetchPlanRowsForVersion(
  versionId: string | number,
  opts?: { baseUrl?: string }
): Promise<PlanRowsForVersion> {
  const t = transport(opts?.baseUrl)
  const [billingRows, deliveryRows] = await Promise.all([
    t.listBilling(versionId),
    t.listDelivery(versionId),
  ])
  return { billingRows, deliveryRows }
}

/**
 * Batch-fetch rows for many versions (parallel, soft-fail per id).
 * Returns a map keyed by String(versionId).
 */
export async function fetchPlanRowsForVersions(
  versionIds: Array<string | number>,
  opts?: { baseUrl?: string }
): Promise<Map<string, PlanRowsForVersion>> {
  const unique = [...new Set(versionIds.map((id) => String(id)).filter((s) => s.trim() !== ""))]
  const out = new Map<string, PlanRowsForVersion>()
  await Promise.all(
    unique.map(async (id) => {
      out.set(id, await fetchPlanRowsForVersion(id, opts))
    })
  )
  return out
}
