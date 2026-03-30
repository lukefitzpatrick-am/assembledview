import { createHash } from "crypto"

import type { FinanceForecastDataset, FinanceForecastLine } from "@/lib/types/financeForecast"

const STABLE_SPACE = /\s+/g

/**
 * Canonical JSON string for hashing (sorted keys, stable number formatting not required — JSON.stringify order fixed by construction).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, replacer)
}

function replacer(_key: string, v: unknown): unknown {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(obj).sort()) {
      out[k] = obj[k]
    }
    return out
  }
  return v
}

/** Full dataset fingerprint (e.g. stamp on snapshot header notes or sidecar audit). */
export function hashFinanceForecastDataset(dataset: FinanceForecastDataset): string {
  const payload = stableStringify(dataset)
  return createHash("sha256").update(payload).digest("hex")
}

/**
 * Per logical line: hash source + dimensions + all monthly amounts + fy_total (integrity for one forecast line).
 */
export function hashFinanceForecastLineForSnapshot(line: FinanceForecastLine): string {
  const payload = stableStringify({
    client_id: String(line.client_id).trim(),
    client_name: String(line.client_name).trim().replace(STABLE_SPACE, " "),
    campaign_id: line.campaign_id ?? null,
    mba_number: line.mba_number ?? null,
    media_plan_version_id: line.media_plan_version_id,
    version_number: line.version_number,
    group_key: line.group_key,
    line_key: line.line_key,
    scenario: line.scenario,
    monthly: line.monthly,
    fy_total: line.fy_total,
    source: line.source,
  })
  return createHash("sha256").update(payload).digest("hex")
}
