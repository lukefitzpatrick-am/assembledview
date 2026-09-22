import { normalizeLineItemId } from "./channels"

export type RelabelDriftKind = "legacy" | "drift"

export type RelabelDriftFinding = {
  kind: RelabelDriftKind
  code: RelabelDriftKind
  message: string
  mbaNumber?: string
  channel?: string
  platformEntityId?: string
  mapLineItemId?: string | null
  relabelId?: number
  relabelLineItemId?: string
}

export type RelabelMapRow = {
  channel: string
  platformLineItemId: string
  lineItemId: string | null
  mbaNumber?: string | null
}

export type RelabelAppliedRow = {
  id: number
  channel: string
  platformEntityId: string
  toLineItemId: string
  mbaNumber?: string | null
  status?: string
}

export type RelabelDriftReport = {
  legacy: RelabelDriftFinding[]
  drift: RelabelDriftFinding[]
  findings: RelabelDriftFinding[]
}

export function relabelMapKey(channel: string, platformEntityId: string): string {
  return `${String(channel ?? "").toLowerCase().trim()}|${String(platformEntityId ?? "").toLowerCase().trim()}`
}

function latestAppliedByEntity(applied: RelabelAppliedRow[]): Map<string, RelabelAppliedRow> {
  const byKey = new Map<string, RelabelAppliedRow>()
  for (const row of applied) {
    if (row.status && row.status !== "applied") continue
    const key = relabelMapKey(row.channel, row.platformEntityId)
    const prev = byKey.get(key)
    if (!prev || row.id > prev.id) byKey.set(key, row)
  }
  return byKey
}

/**
 * Compare active LINE_ITEM_LABEL_MAP rows with applied delivery_relabels.
 * Map rows with no matching relabel are legacy (pre-feature warehouse rows).
 * Applied relabels whose map row is missing or points at a different line are drift.
 */
export function compareRelabelMap(
  mapRows: RelabelMapRow[],
  applied: RelabelAppliedRow[],
): RelabelDriftReport {
  const appliedByKey = latestAppliedByEntity(applied)
  const mapByKey = new Map<string, RelabelMapRow>()
  for (const row of mapRows) {
    mapByKey.set(relabelMapKey(row.channel, row.platformLineItemId), row)
  }

  const legacy: RelabelDriftFinding[] = []
  const drift: RelabelDriftFinding[] = []

  for (const row of mapRows) {
    const key = relabelMapKey(row.channel, row.platformLineItemId)
    if (appliedByKey.has(key)) continue
    const lineId = normalizeLineItemId(row.lineItemId) || "—"
    legacy.push({
      kind: "legacy",
      code: "legacy",
      channel: row.channel,
      platformEntityId: row.platformLineItemId,
      mapLineItemId: normalizeLineItemId(row.lineItemId) || null,
      mbaNumber: row.mbaNumber ?? undefined,
      message: `legacy: ${row.channel} / ${row.platformLineItemId} → ${lineId} (no applied relabel)`,
    })
  }

  for (const relabel of appliedByKey.values()) {
    const key = relabelMapKey(relabel.channel, relabel.platformEntityId)
    const map = mapByKey.get(key)
    const expected = normalizeLineItemId(relabel.toLineItemId)
    if (!map) {
      drift.push({
        kind: "drift",
        code: "drift",
        channel: relabel.channel,
        platformEntityId: relabel.platformEntityId,
        relabelId: relabel.id,
        relabelLineItemId: expected,
        mbaNumber: relabel.mbaNumber ?? undefined,
        message: `drift: relabel #${relabel.id} ${relabel.channel} / ${relabel.platformEntityId} → ${expected} but map row is missing`,
      })
      continue
    }
    const mappedTo = normalizeLineItemId(map.lineItemId)
    if (mappedTo !== expected) {
      drift.push({
        kind: "drift",
        code: "drift",
        channel: relabel.channel,
        platformEntityId: relabel.platformEntityId,
        mapLineItemId: mappedTo || null,
        relabelId: relabel.id,
        relabelLineItemId: expected,
        mbaNumber: relabel.mbaNumber ?? undefined,
        message: `drift: relabel #${relabel.id} ${relabel.channel} / ${relabel.platformEntityId} → ${expected} but map points elsewhere (${mappedTo || "—"})`,
      })
    }
  }

  return { legacy, drift, findings: [...legacy, ...drift] }
}
