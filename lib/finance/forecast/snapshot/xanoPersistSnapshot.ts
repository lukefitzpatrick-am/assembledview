/**
 * @deprecated App persists via `pgSnapshots.persistFinanceForecastSnapshotToPostgres` (X5).
 * Kept for emergency/manual Xano writes only — do not wire routes here.
 */
import { xanoPostHeaderRecord } from "@/lib/api/xano"
import type { FinanceForecastSnapshotStagingPayload } from "@/lib/types/financeForecastSnapshot"

const createPath = "finance_forecast_snapshots_create"

/** @deprecated Use persistFinanceForecastSnapshotToPostgres. */
export async function persistFinanceForecastSnapshotToXano(
  payload: FinanceForecastSnapshotStagingPayload
): Promise<{ snapshot_id: string }> {
  const base = process.env.XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL?.replace(/\/$/, "")
  if (!base) {
    throw new Error("XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL is not set")
  }

  const url = `${base}/${createPath}`

  const res = await fetch(url, {
    method: "POST",
    headers: xanoPostHeaderRecord(),
    body: JSON.stringify({
      header: payload.header,
      lines: payload.lines,
    }),
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Xano snapshot create failed (${res.status}): ${text || res.statusText}`)
  }

  const data = (await res.json()) as { snapshot_id?: string; id?: string }
  const snapshot_id = data.snapshot_id ?? data.id ?? ""
  if (!snapshot_id) {
    throw new Error("Xano snapshot create returned no snapshot_id")
  }
  return { snapshot_id }
}
