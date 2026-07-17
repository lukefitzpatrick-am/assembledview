import { xanoPostHeaderRecord } from "@/lib/api/xano"
import type { FinanceForecastSnapshotStagingPayload } from "@/lib/types/financeForecastSnapshot"

const createPath = "finance_forecast_snapshots_create"

/**
 * Persists an immutable snapshot header + lines to Xano in one request.
 * Configure `XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL` to your api group base
 * (see `docs/finance-forecast-snapshots-xano.md`).
 *
 * Expected Xano function input: `{ header, lines }` matching staging payload shapes
 * (lines without `snapshot_id`; Xano assigns ids and sets `snapshot_id` on each line).
 */
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
