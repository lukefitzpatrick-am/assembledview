/**
 * Snapshot list/lines — Postgres. The `FromXano` names stay for route compatibility.
 */

import type {
  FinanceForecastSnapshotLineRecord,
  FinanceForecastSnapshotRecord,
} from "@/lib/types/financeForecastSnapshot"
import {
  fetchFinanceForecastSnapshotLinesFromPostgres,
  fetchFinanceForecastSnapshotListFromPostgres,
  findFinanceForecastSnapshotHeaderFromPostgres,
  isSnapshotStorageConfigured as isPgSnapshotStorageConfigured,
} from "@/lib/finance/forecast/snapshot/pgSnapshots"

export function isSnapshotStorageConfigured(): boolean {
  return isPgSnapshotStorageConfigured()
}

export async function fetchFinanceForecastSnapshotListFromXano(): Promise<
  FinanceForecastSnapshotRecord[]
> {
  // Name retained for route compatibility; reads Postgres.
  return fetchFinanceForecastSnapshotListFromPostgres()
}

export async function fetchFinanceForecastSnapshotLinesFromXano(
  snapshotId: string
): Promise<FinanceForecastSnapshotLineRecord[]> {
  return fetchFinanceForecastSnapshotLinesFromPostgres(snapshotId)
}

export async function findFinanceForecastSnapshotHeader(
  snapshotId: string,
  headers?: FinanceForecastSnapshotRecord[]
): Promise<FinanceForecastSnapshotRecord | null> {
  return findFinanceForecastSnapshotHeaderFromPostgres(snapshotId, headers)
}
