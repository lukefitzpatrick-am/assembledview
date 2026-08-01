/**
 * AP bill → publisher attribution for finance Costs.
 *
 * Honest rule (documented on the API payload + invoices UI):
 * - `xero_contact_links` maps Xero contacts → **clients** (AR / PC6). It does **not**
 *   carry a publisher_id, so it cannot attribute AP bills to publishers. We do not
 *   invent a bridge through clients.
 * - Attribution is therefore contact-name heuristics against `publishers.publisher_name`
 *   and against booked publisher identity labels in scope (same `normalizeContactKey`).
 * - Unmatched bills always land in the Unattributed bills group — never dropped.
 */

import { normalizeContactKey } from "@/lib/xero/normalizeContact"

export type ApAttributionMethod = "name" | "unattributed"

export type PublisherNameRow = {
  id: number
  publisherName: string
}

export type ApBillForAttribution = {
  id: number
  contactName: string | null
}

export type ApAttributionResult = {
  publisherKey: string | null
  publisherLabel: string | null
  publisherId: number | null
  method: ApAttributionMethod
  heuristic: boolean
}

/** Build lookup: normalized contact key → canonical publisher label + id. */
export function buildPublisherNameIndex(
  publishers: PublisherNameRow[]
): Map<string, { id: number; label: string }> {
  const map = new Map<string, { id: number; label: string }>()
  for (const p of publishers) {
    const label = (p.publisherName ?? "").trim()
    if (!label) continue
    const key = normalizeContactKey(label)
    if (!key || map.has(key)) continue
    map.set(key, { id: p.id, label })
  }
  return map
}

/**
 * Prefer exact name match to `publishers.publisher_name`.
 * Optional `bookedLabels` lets bills attach to a booked identity string that is not
 * in the publishers table (still heuristic).
 */
export function attributeApBillToPublisher(
  contactName: string | null | undefined,
  publisherByKey: Map<string, { id: number; label: string }>,
  bookedLabelsByKey?: Map<string, string>
): ApAttributionResult {
  const raw = (contactName ?? "").trim()
  if (!raw) {
    return {
      publisherKey: null,
      publisherLabel: null,
      publisherId: null,
      method: "unattributed",
      heuristic: false,
    }
  }
  const key = normalizeContactKey(raw)
  if (!key) {
    return {
      publisherKey: null,
      publisherLabel: null,
      publisherId: null,
      method: "unattributed",
      heuristic: false,
    }
  }

  const fromTable = publisherByKey.get(key)
  if (fromTable) {
    return {
      publisherKey: key,
      publisherLabel: fromTable.label,
      publisherId: fromTable.id,
      method: "name",
      heuristic: true,
    }
  }

  const bookedLabel = bookedLabelsByKey?.get(key)
  if (bookedLabel) {
    return {
      publisherKey: key,
      publisherLabel: bookedLabel,
      publisherId: null,
      method: "name",
      heuristic: true,
    }
  }

  return {
    publisherKey: null,
    publisherLabel: null,
    publisherId: null,
    method: "unattributed",
    heuristic: false,
  }
}

export const AP_ATTRIBUTION_RULE_TEXT = [
  "xero_contact_links is client-scoped (AR/PC6) and is not used for AP→publisher.",
  "AP bills are attributed when normalizeContactKey(xero_contacts.name) equals",
  "normalizeContactKey(publishers.publisher_name) or a booked publisher identity in scope",
  "(flagged heuristic). Otherwise the bill appears under Unattributed bills.",
].join(" ")
