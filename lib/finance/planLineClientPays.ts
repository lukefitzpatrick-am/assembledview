/**
 * Plan-line `client_pays_for_media` lookup for receivable refusal.
 *
 * Join key is (version_id, line_item_id) — the same pair the production probe
 * used against blob entries. Schedule ids are often decorated
 * `billing-{mediaType}::{bare}`; plan rows store the bare id. Match either
 * exact or the suffix after `::`.
 */

import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { normalizeClientPaysForMedia } from "@/lib/finance/normalizeFields"
import { MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS } from "@/lib/finance/planLineItemEnrichment"

function tableKeyToCamelProperty(tableKey: string): string {
  return tableKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return null
}

function lineItemIdFromPlanRow(raw: Record<string, unknown>): string | null {
  const v = raw.line_item_id ?? raw.lineItemId
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function iterPlanLineRows(version: Record<string, unknown>): unknown[] {
  const out: unknown[] = []
  const consolidated = version.line_items ?? version.lineItems
  if (Array.isArray(consolidated)) out.push(...consolidated)
  for (const tableKey of MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS) {
    const camel = tableKeyToCamelProperty(tableKey)
    const raw = version[tableKey] ?? version[camel]
    if (Array.isArray(raw)) out.push(...raw)
  }
  return out
}

/** Canonical ids of plan lines on this version that are client-pays. */
export function collectClientPaysPlanLineCanonIds(
  version: Record<string, unknown>
): Set<string> {
  const versionId = Number(version.id ?? version.version_id ?? 0)
  const ids = new Set<string>()
  for (const row of iterPlanLineRows(version)) {
    const r = asRecord(row)
    if (!r) continue
    const rowVid = Number(r.version_id ?? r.versionId ?? versionId)
    if (
      Number.isFinite(versionId) &&
      versionId > 0 &&
      Number.isFinite(rowVid) &&
      rowVid > 0 &&
      rowVid !== versionId
    ) {
      continue
    }
    if (!normalizeClientPaysForMedia(r)) continue
    const id = lineItemIdFromPlanRow(r)
    if (!id) continue
    const canon = toBillingOverrideLineItemId(id)
    if (canon) ids.add(canon)
  }
  return ids
}

export function planLineIsClientPays(
  canonIds: ReadonlySet<string>,
  scheduleLineItemId: string | null | undefined
): boolean {
  const id = (scheduleLineItemId ?? "").trim()
  if (!id || canonIds.size === 0) return false
  if (canonIds.has(id)) return true
  const canon = toBillingOverrideLineItemId(id)
  if (canon && canonIds.has(canon)) return true
  const sep = id.indexOf("::")
  if (sep > 0) {
    const suffix = id.slice(sep + 2).trim()
    if (suffix && (canonIds.has(suffix) || canonIds.has(toBillingOverrideLineItemId(suffix)))) {
      return true
    }
  }
  return false
}

/** Stamp `clientPaysMedia` when the joined plan line is client-pays. Blob flag stays OR'd. */
export function overlayClientPaysFromPlanLines<
  T extends { planLineItemId?: string | null; clientPaysMedia?: boolean },
>(lines: T[], version: Record<string, unknown>): void {
  const ids = collectClientPaysPlanLineCanonIds(version)
  if (ids.size === 0) return
  for (const li of lines) {
    if (planLineIsClientPays(ids, li.planLineItemId)) {
      li.clientPaysMedia = true
    }
  }
}
