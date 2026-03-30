/**
 * Adds conservative `attribution` explanations to finance forecast variance month lines.
 * Uses snapshot line pairs, soft-key version transitions, and media_plan_versions rows
 * when two distinct version IDs are involved for the same campaign line + month.
 */

import { indexSnapshotLinesByComparisonKey, snapshotLineComparisonKey } from "@/lib/finance/forecast/snapshot/compareSnapshotLines"
import type { FinanceForecastMediaPlanVersionInput } from "@/lib/types/financeForecast"
import type { FinanceForecastSnapshotLineRecord } from "@/lib/types/financeForecastSnapshot"
import type {
  FinanceForecastVarianceAttribution,
  FinanceForecastVarianceDriverCode,
  FinanceForecastVarianceMonthLineRow,
  FinanceForecastVarianceReport,
} from "@/lib/types/financeForecastVariance"

import { extractVersionAttributionSlice, normalizeStatusBucket } from "./versionAttributionSlice"

const FALLBACK_EXPLANATION = "Source data changed"

function softPairKey(line: FinanceForecastSnapshotLineRecord): string {
  return [
    line.client_id,
    line.mba_number ?? "",
    line.group_key,
    line.line_key,
    line.month_key,
  ].join("\u001f")
}

function comparisonKeyFromVarianceRow(row: FinanceForecastVarianceMonthLineRow): string {
  const synthetic: FinanceForecastSnapshotLineRecord = {
    id: "",
    snapshot_id: "",
    client_id: row.client_id,
    client_name: row.client_name,
    campaign_id: row.campaign_id,
    mba_number: row.mba_number,
    media_plan_version_id: row.media_plan_version_id,
    version_number: row.version_number,
    group_key: row.group_key,
    line_key: row.line_key,
    month_key: row.month_key,
    amount: 0,
    fy_total: 0,
    source_hash: null,
    source_debug_json: null,
  }
  return snapshotLineComparisonKey(synthetic)
}

function diffSlicesToDrivers(
  a: NonNullable<ReturnType<typeof extractVersionAttributionSlice>>,
  b: NonNullable<ReturnType<typeof extractVersionAttributionSlice>>
): FinanceForecastVarianceDriverCode[] {
  const d: FinanceForecastVarianceDriverCode[] = []
  if (
    a.version_number != null &&
    b.version_number != null &&
    b.version_number > a.version_number
  ) {
    d.push("version_number_increased")
  }
  if (normalizeStatusBucket(a.status) !== normalizeStatusBucket(b.status)) {
    d.push("campaign_status_changed")
  }
  if (a.billingFingerprint !== b.billingFingerprint) {
    d.push("billing_schedule_changed")
  }
  if (a.deliveryFingerprint !== b.deliveryFingerprint) {
    d.push("delivery_schedule_changed")
  }
  if (
    (a.campaign_start_date ?? "") !== (b.campaign_start_date ?? "") ||
    (a.campaign_end_date ?? "") !== (b.campaign_end_date ?? "")
  ) {
    d.push("campaign_dates_changed")
  }
  if (a.publisherFeeFingerprint !== b.publisherFeeFingerprint) {
    d.push("publisher_fee_changed")
  }
  if (a.clientFeeFingerprint !== b.clientFeeFingerprint) {
    d.push("client_fee_changed")
  }
  return d
}

function synthesizeExplanation(
  drivers: FinanceForecastVarianceDriverCode[],
  oldSlice: NonNullable<ReturnType<typeof extractVersionAttributionSlice>>,
  newSlice: NonNullable<ReturnType<typeof extractVersionAttributionSlice>>
): string {
  const ob = normalizeStatusBucket(oldSlice.status)
  const nb = normalizeStatusBucket(newSlice.status)

  if (drivers.includes("campaign_status_changed") && ob === "draft" && nb === "approved") {
    return "Campaign moved from draft to approved."
  }
  if (drivers.includes("version_number_increased")) {
    const vo = oldSlice.version_number
    const vn = newSlice.version_number
    if (vo != null && vn != null) {
      return `Media plan version advanced (v${vo} → v${vn}).`
    }
    return "A newer media plan version is now used for this forecast line."
  }
  if (drivers.includes("billing_schedule_changed")) {
    return "Billing schedule changed between snapshots."
  }
  if (drivers.includes("delivery_schedule_changed")) {
    return "Delivery schedule changed between snapshots."
  }
  if (drivers.includes("campaign_dates_changed")) {
    return "Campaign start or end dates changed."
  }
  if (drivers.includes("publisher_fee_changed")) {
    return "Publisher commission or fee inputs changed on the plan version."
  }
  if (drivers.includes("client_fee_changed")) {
    return "Client fee or retainer fields on the plan version changed."
  }
  if (drivers.includes("campaign_status_changed")) {
    return "Campaign status changed between snapshots."
  }
  return FALLBACK_EXPLANATION
}

function attributeFromVersionRecords(
  vOldRaw: FinanceForecastMediaPlanVersionInput | Record<string, unknown> | undefined,
  vNewRaw: FinanceForecastMediaPlanVersionInput | Record<string, unknown> | undefined,
  oldLine: FinanceForecastSnapshotLineRecord,
  newLine: FinanceForecastSnapshotLineRecord
): FinanceForecastVarianceAttribution {
  const sOld = extractVersionAttributionSlice(vOldRaw ?? null)
  const sNew = extractVersionAttributionSlice(vNewRaw ?? null)

  if (!sOld || !sNew) {
    if (
      oldLine.version_number != null &&
      newLine.version_number != null &&
      newLine.version_number > oldLine.version_number
    ) {
      return {
        explanation: `Media plan version advanced (v${oldLine.version_number} → v${newLine.version_number}).`,
        confidence: "medium",
        drivers: ["version_number_increased"],
      }
    }
    return {
      explanation: FALLBACK_EXPLANATION,
      confidence: "low",
      drivers: ["source_inputs_unclear"],
    }
  }

  const drivers = diffSlicesToDrivers(sOld, sNew)
  if (drivers.length === 0) {
    return {
      explanation: FALLBACK_EXPLANATION,
      confidence: "low",
      drivers: ["source_inputs_unclear"],
    }
  }

  return {
    explanation: synthesizeExplanation(drivers, sOld, sNew),
    confidence: "high",
    drivers,
  }
}

function attributeSameVersionLines(
  oldLine: FinanceForecastSnapshotLineRecord,
  newLine: FinanceForecastSnapshotLineRecord
): FinanceForecastVarianceAttribution {
  const hashMatch =
    oldLine.source_hash != null &&
    newLine.source_hash != null &&
    oldLine.source_hash === newLine.source_hash
  const amountMatch = Math.abs((oldLine.amount ?? 0) - (newLine.amount ?? 0)) < 1e-6

  if (hashMatch && amountMatch) {
    return {
      explanation: "No change detected in captured line inputs between snapshots.",
      confidence: "high",
      drivers: [],
    }
  }

  return {
    explanation: FALLBACK_EXPLANATION,
    confidence: "low",
    drivers: ["source_inputs_unclear"],
  }
}

function attributeStructuralNew(): FinanceForecastVarianceAttribution {
  return {
    explanation: "New forecast line appears in the newer snapshot (new version or campaign composition).",
    confidence: "medium",
    drivers: ["line_item_added"],
  }
}

function attributeStructuralRemoved(): FinanceForecastVarianceAttribution {
  return {
    explanation: "Forecast line no longer appears in the newer snapshot (superseded or removed).",
    confidence: "medium",
    drivers: ["line_item_removed"],
  }
}

/**
 * Mutates `report.by_month_line[*].attribution` in place.
 */
export function enrichFinanceForecastVarianceReportAttribution(
  report: FinanceForecastVarianceReport,
  linesOlder: FinanceForecastSnapshotLineRecord[],
  linesNewer: FinanceForecastSnapshotLineRecord[],
  versionById: Map<string, FinanceForecastMediaPlanVersionInput | Record<string, unknown>>
): void {
  const olderHard = indexSnapshotLinesByComparisonKey(linesOlder)
  const newerHard = indexSnapshotLinesByComparisonKey(linesNewer)

  const softOlder = new Map<string, FinanceForecastSnapshotLineRecord[]>()
  const softNewer = new Map<string, FinanceForecastSnapshotLineRecord[]>()
  for (const l of linesOlder) {
    const k = softPairKey(l)
    const arr = softOlder.get(k) ?? []
    arr.push(l)
    softOlder.set(k, arr)
  }
  for (const l of linesNewer) {
    const k = softPairKey(l)
    const arr = softNewer.get(k) ?? []
    arr.push(l)
    softNewer.set(k, arr)
  }

  const transitionByHard = new Map<string, FinanceForecastVarianceAttribution>()
  const softKeys = new Set<string>()
  for (const k of softOlder.keys()) softKeys.add(k)
  for (const k of softNewer.keys()) softKeys.add(k)

  for (const sk of softKeys) {
    const oList = softOlder.get(sk) ?? []
    const nList = softNewer.get(sk) ?? []

    if (oList.length > 1 || nList.length > 1) {
      continue
    }

    if (oList.length === 1 && nList.length === 1) {
      const o = oList[0]
      const n = nList[0]
      if (String(o.media_plan_version_id ?? "") !== String(n.media_plan_version_id ?? "")) {
        const vO = versionById.get(String(o.media_plan_version_id ?? ""))
        const vN = versionById.get(String(n.media_plan_version_id ?? ""))
        const attr = attributeFromVersionRecords(vO, vN, o, n)
        transitionByHard.set(snapshotLineComparisonKey(o), attr)
        transitionByHard.set(snapshotLineComparisonKey(n), attr)
      }
      continue
    }

    if (oList.length === 0 && nList.length === 1) {
      transitionByHard.set(snapshotLineComparisonKey(nList[0]), attributeStructuralNew())
      continue
    }

    if (oList.length === 1 && nList.length === 0) {
      transitionByHard.set(snapshotLineComparisonKey(oList[0]), attributeStructuralRemoved())
    }
  }

  for (const row of report.by_month_line) {
    const hk = comparisonKeyFromVarianceRow(row)

    if (transitionByHard.has(hk)) {
      row.attribution = transitionByHard.get(hk)!
      continue
    }

    const oLine = olderHard.get(hk) ?? null
    const nLine = newerHard.get(hk) ?? null

    if (oLine && nLine) {
      if (String(oLine.media_plan_version_id ?? "") === String(nLine.media_plan_version_id ?? "")) {
        row.attribution = attributeSameVersionLines(oLine, nLine)
      } else {
        const vO = versionById.get(String(oLine.media_plan_version_id ?? ""))
        const vN = versionById.get(String(nLine.media_plan_version_id ?? ""))
        row.attribution = attributeFromVersionRecords(vO, vN, oLine, nLine)
      }
      continue
    }

    if (oLine && !nLine) {
      row.attribution = {
        explanation: FALLBACK_EXPLANATION,
        confidence: "low",
        drivers: ["source_inputs_unclear"],
      }
      continue
    }

    if (!oLine && nLine) {
      row.attribution = attributeStructuralNew()
      continue
    }

    row.attribution = {
      explanation: FALLBACK_EXPLANATION,
      confidence: "low",
      drivers: ["source_inputs_unclear"],
    }
  }
}
