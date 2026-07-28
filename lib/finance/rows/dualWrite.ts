/**
 * Plan C S2-P2 — dual-write typed rows + version snapshot_checksum.
 *
 * Behind PLANC_ROWS_DUAL_WRITE=on. Independent of PLANC_SERVER_AUTHORITY.
 * Soft-fail when tables/endpoints missing (blobs unaffected) — same spirit as fee snapshots.
 *
 * Replace strategy: **delete-then-bulk-insert** per version id.
 * (plan_*_rows have no `superseded` column; channel bulk_supersede does not apply.)
 */

import axios from "axios"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
  xanoPostHeaderRecord,
} from "@/lib/api/xano"
import type { AuthoritativeFinancials } from "@/lib/finance/authority/computeAndPersist"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { buildRows, type BuildRowsAdservingOpts } from "@/lib/finance/rows/buildRows"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"
import { snapshotChecksum } from "@/lib/finance/snapshotChecksum"

const XANO_TIMEOUT_MS = 30_000
const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

export const PLANC_ROWS_MISSING_PREFIX = "[planc-rows-missing]"

export type PlanCRowsDualWriteMode = "off" | "on"

export function resolvePlanCRowsDualWriteMode(
  raw: string | undefined = process.env.PLANC_ROWS_DUAL_WRITE
): PlanCRowsDualWriteMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  return v === "on" || v === "1" || v === "true" ? "on" : "off"
}

/** Canonical payload hashed onto media_plan_versions.snapshot_checksum. */
export function rowsSnapshotPayload(args: {
  billingRows: PlanBillingRow[]
  deliveryRows: PlanDeliveryRow[]
}): { billingRows: PlanBillingRow[]; deliveryRows: PlanDeliveryRow[] } {
  return {
    billingRows: args.billingRows,
    deliveryRows: args.deliveryRows,
  }
}

export function checksumForPlanRows(args: {
  billingRows: PlanBillingRow[]
  deliveryRows: PlanDeliveryRow[]
}): string {
  return snapshotChecksum(rowsSnapshotPayload(args))
}

type RowListTransport = {
  listBilling(versionId: string | number): Promise<Array<{ id?: number | string }>>
  listDelivery(versionId: string | number): Promise<Array<{ id?: number | string }>>
  deleteBilling(id: string | number): Promise<void>
  deleteDelivery(id: string | number): Promise<void>
  bulkBilling(rows: PlanBillingRow[]): Promise<void>
  bulkDelivery(rows: PlanDeliveryRow[]): Promise<void>
  patchVersionChecksum(
    versionId: string | number,
    checksum: string
  ): Promise<void>
}

let transportOverride: RowListTransport | null = null
let missingLoggedKeys = new Set<string>()

export function setPlanRowsTransportForTests(transport: RowListTransport | null): void {
  transportOverride = transport
}

export function resetPlanRowsMissingLogForTests(): void {
  missingLoggedKeys = new Set()
}

function logMissingOnce(key: string, detail: Record<string, unknown>): void {
  if (missingLoggedKeys.has(key)) return
  missingLoggedKeys.add(key)
  console.warn(PLANC_ROWS_MISSING_PREFIX, detail)
}

function createXanoTransport(baseUrl?: string): RowListTransport {
  const resolveBase = (): string | null => {
    try {
      return baseUrl ?? getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    } catch (error) {
      logMissingOnce("base-url", {
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
          params: { media_plan_version: versionId, page: 1, per_page: 500 },
          headers: xanoAuthHeaderRecord(),
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
        if (response.status === 404) {
          logMissingOnce("billing-get", { versionId, status: 404 })
          return []
        }
        if (response.status >= 400) {
          logMissingOnce("billing-get", { versionId, status: response.status })
          return []
        }
        return parseXanoListPayload(response.data) as Array<{ id?: number | string }>
      } catch (error) {
        logMissingOnce("billing-get", {
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
          params: { media_plan_version: versionId, page: 1, per_page: 500 },
          headers: xanoAuthHeaderRecord(),
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
        if (response.status === 404) {
          logMissingOnce("delivery-get", { versionId, status: 404 })
          return []
        }
        if (response.status >= 400) {
          logMissingOnce("delivery-get", { versionId, status: response.status })
          return []
        }
        return parseXanoListPayload(response.data) as Array<{ id?: number | string }>
      } catch (error) {
        logMissingOnce("delivery-get", {
          versionId,
          message: error instanceof Error ? error.message : String(error),
        })
        return []
      }
    },

    async deleteBilling(id) {
      const base = resolveBase()
      if (!base) return
      try {
        const response = await axios.delete(`${base}/plan_billing_rows/${encodeURIComponent(String(id))}`, {
          headers: xanoAuthHeaderRecord(),
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
        if (response.status === 404) {
          logMissingOnce("billing-delete", { id, status: 404 })
        }
      } catch (error) {
        logMissingOnce("billing-delete", {
          id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },

    async deleteDelivery(id) {
      const base = resolveBase()
      if (!base) return
      try {
        const response = await axios.delete(`${base}/plan_delivery_rows/${encodeURIComponent(String(id))}`, {
          headers: xanoAuthHeaderRecord(),
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
        if (response.status === 404) {
          logMissingOnce("delivery-delete", { id, status: 404 })
        }
      } catch (error) {
        logMissingOnce("delivery-delete", {
          id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },

    async bulkBilling(rows) {
      const base = resolveBase()
      if (!base) return
      try {
        const response = await axios.post(
          `${base}/plan_billing_rows/bulk`,
          { rows },
          {
            headers: xanoPostHeaderRecord(),
            timeout: XANO_TIMEOUT_MS,
            validateStatus: (s) => s >= 200 && s < 500,
          }
        )
        if (response.status === 404) {
          logMissingOnce("billing-bulk", { status: 404, count: rows.length })
        } else if (response.status >= 400) {
          logMissingOnce("billing-bulk", { status: response.status, count: rows.length })
        }
      } catch (error) {
        logMissingOnce("billing-bulk", {
          message: error instanceof Error ? error.message : String(error),
          count: rows.length,
        })
      }
    },

    async bulkDelivery(rows) {
      const base = resolveBase()
      if (!base) return
      try {
        const response = await axios.post(
          `${base}/plan_delivery_rows/bulk`,
          { rows },
          {
            headers: xanoPostHeaderRecord(),
            timeout: XANO_TIMEOUT_MS,
            validateStatus: (s) => s >= 200 && s < 500,
          }
        )
        if (response.status === 404) {
          logMissingOnce("delivery-bulk", { status: 404, count: rows.length })
        } else if (response.status >= 400) {
          logMissingOnce("delivery-bulk", { status: response.status, count: rows.length })
        }
      } catch (error) {
        logMissingOnce("delivery-bulk", {
          message: error instanceof Error ? error.message : String(error),
          count: rows.length,
        })
      }
    },

    async patchVersionChecksum(versionId, checksum) {
      const base = resolveBase()
      if (!base) return
      try {
        const response = await axios.patch(
          `${base}/media_plan_versions/${encodeURIComponent(String(versionId))}`,
          { snapshot_checksum: checksum },
          {
            headers: xanoPostHeaderRecord(),
            timeout: XANO_TIMEOUT_MS,
            validateStatus: (s) => s >= 200 && s < 500,
          }
        )
        if (response.status === 404) {
          logMissingOnce("version-checksum", { versionId, status: 404 })
        } else if (response.status >= 400) {
          logMissingOnce("version-checksum", { versionId, status: response.status })
        }
      } catch (error) {
        logMissingOnce("version-checksum", {
          versionId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}

export type DualWritePlanRowsArgs = {
  versionId: string | number
  mba_number: string
  authoritative: AuthoritativeFinancials
  lineItems: LineItemInput[]
  overrides: BillingOverrideRow[]
  adserving?: BuildRowsAdservingOpts
  baseUrl?: string
}

export type DualWritePlanRowsResult = {
  wrote: boolean
  skipped: boolean
  checksum: string | null
  billingRowCount: number
  deliveryRowCount: number
}

/**
 * Replace-write billing + delivery rows for a version, then stamp snapshot_checksum.
 * No-ops when PLANC_ROWS_DUAL_WRITE is off. Soft-fails on missing Xano tables.
 */
export async function dualWritePlanRowsForVersion(
  args: DualWritePlanRowsArgs
): Promise<DualWritePlanRowsResult> {
  if (resolvePlanCRowsDualWriteMode() !== "on") {
    return {
      wrote: false,
      skipped: true,
      checksum: null,
      billingRowCount: 0,
      deliveryRowCount: 0,
    }
  }

  const versionId = Number(args.versionId)
  if (!Number.isFinite(versionId) || versionId <= 0) {
    return {
      wrote: false,
      skipped: true,
      checksum: null,
      billingRowCount: 0,
      deliveryRowCount: 0,
    }
  }

  const { billingRows, deliveryRows } = buildRows({
    authorityResult: args.authoritative,
    lineItems: args.lineItems,
    overrides: args.overrides,
    meta: {
      media_plan_version: versionId,
      mba_number: args.mba_number,
    },
    adserving: args.adserving,
  })

  const checksum = checksumForPlanRows({ billingRows, deliveryRows })
  const transport = transportOverride ?? createXanoTransport(args.baseUrl)

  try {
    const existingBilling = await transport.listBilling(versionId)
    const existingDelivery = await transport.listDelivery(versionId)

    await Promise.all(
      existingBilling
        .map((r) => r.id)
        .filter((id): id is string | number => id != null && String(id).length > 0)
        .map((id) => transport.deleteBilling(id))
    )
    await Promise.all(
      existingDelivery
        .map((r) => r.id)
        .filter((id): id is string | number => id != null && String(id).length > 0)
        .map((id) => transport.deleteDelivery(id))
    )

    if (billingRows.length > 0) await transport.bulkBilling(billingRows)
    if (deliveryRows.length > 0) await transport.bulkDelivery(deliveryRows)
    await transport.patchVersionChecksum(versionId, checksum)

    return {
      wrote: true,
      skipped: false,
      checksum,
      billingRowCount: billingRows.length,
      deliveryRowCount: deliveryRows.length,
    }
  } catch (error) {
    logMissingOnce("dual-write", {
      versionId,
      message: error instanceof Error ? error.message : String(error),
    })
    return {
      wrote: false,
      skipped: false,
      checksum,
      billingRowCount: billingRows.length,
      deliveryRowCount: deliveryRows.length,
    }
  }
}
