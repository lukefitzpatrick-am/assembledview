/**
 * "Why isn't this on the AA plan?" (FB-10). Read-only explanation of the
 * rule the Advertising Associates media plan applies to one line.
 *
 * Mirrors `lineItemBillsViaAdvertisingAssociates` and
 * `shouldIncludeMediaPlanLineItem` (lib/mediaplan/advertisingAssociatesExcel.ts):
 * - A line is on the AA plan when ANY of its publisher fields (network,
 *   platform, site; production stores its publisher in network) resolves to
 *   a publisher whose billing agency is "advertising associates".
 * - Resolution: `resolvePublisherNameMatch` (name, then alias, then
 *   publisher id; trimmed, case-insensitive, lowest id when a name is shared).
 * - Any other billing agency, blank included, counts as Assembled Media
 *   (`classifyBillingAgency`).
 * - The plan only lists lines with a bonus buy type or any amount
 *   (`included` false = nothing to list yet).
 * - Client pays for media does NOT take a line off the AA plan; it is noted.
 *
 * Pure: no DB, no React.
 */

import type { PublisherIdentityRow } from "@/lib/publisher/publisherUniqueness"
import {
  publisherBillsViaAdvertisingAssociates,
  resolvePublisherNameMatch,
  type PublisherMatchedBy,
  type PublisherNameIndex,
} from "@/lib/publisher/resolvePublisherName"

export type AaRoutingLine = {
  /** The line's publisher fields as typed or picked (network, platform, site, publisher). */
  names: readonly (string | null | undefined)[]
  clientPaysForMedia?: boolean | null
  /** False when the line has no amount and is not bonus. Omit when unknown. */
  included?: boolean | null
}

export type AaRoutingReason =
  | "publisher_blank"
  | "publisher_not_found"
  | "billing_agency_assembled_media"
  | "billing_agency_other"
  | "no_amount"

export type AaRoutingExplanation = {
  onAaPlan: boolean
  /** The name that decided the result (the AA match, else the first resolved, else the first typed). */
  enteredName: string | null
  publisher: { id: number | null; name: string; billingAgency: string | null } | null
  matchedBy: PublisherMatchedBy | null
  /** Billing agency as AA routing reads it. Null when no publisher resolved. */
  billingAgency: "Advertising Associates" | "Assembled Media" | null
  /** Why the line misses AA. Null when it is on the AA plan. */
  reason: AaRoutingReason | null
  message: string
  notes: string[]
}

function rowId(p: PublisherIdentityRow): number | null {
  const n = Number(p.id)
  return Number.isFinite(n) && n > 0 ? n : null
}

function describe<T extends PublisherIdentityRow>(p: T) {
  const agency = String(p.billingagency ?? "").trim()
  return {
    id: rowId(p),
    name: String(p.publisher_name ?? "").trim(),
    billingAgency: agency || null,
  }
}

function matchNote(entered: string, canonical: string, matchedBy: PublisherMatchedBy): string | null {
  if (matchedBy === "name") {
    return entered === canonical
      ? null
      : `"${entered}" matched ${canonical} by name (case and spaces ignored).`
  }
  if (matchedBy === "alias") {
    return `"${entered}" is not a publisher name. It is read as ${canonical} (approved alias). Pick ${canonical} to store the real name.`
  }
  return `"${entered}" is not a publisher name. It matched ${canonical} by publisher ID. Pick ${canonical} to store the real name.`
}

export function explainAaRouting<T extends PublisherIdentityRow>(
  line: AaRoutingLine,
  publishersIndex: PublisherNameIndex<T>,
): AaRoutingExplanation {
  const names: string[] = []
  for (const raw of line.names) {
    const s = typeof raw === "string" ? raw.trim() : ""
    if (s && !names.includes(s)) names.push(s)
  }
  const notes: string[] = []
  if (line.clientPaysForMedia === true) {
    notes.push("Client pays for media is on. That does not take the line off the AA plan.")
  }

  if (names.length === 0) {
    return {
      onAaPlan: false,
      enteredName: null,
      publisher: null,
      matchedBy: null,
      billingAgency: null,
      reason: "publisher_blank",
      message: "No publisher on this line, so it cannot match Advertising Associates. Pick a publisher.",
      notes,
    }
  }

  const resolved = names.map((name) => ({ name, match: resolvePublisherNameMatch(name, publishersIndex) }))
  const aa = resolved.find((r) => r.match && publisherBillsViaAdvertisingAssociates(r.match.publisher))
  const decider = aa ?? resolved.find((r) => r.match) ?? resolved[0]!

  if (!decider.match) {
    return {
      onAaPlan: false,
      enteredName: decider.name,
      publisher: null,
      matchedBy: null,
      billingAgency: null,
      reason: "publisher_not_found",
      message: `"${decider.name}" is not in Publishers, so it cannot match Advertising Associates. Pick a publisher, or ask for this one to be added.`,
      notes,
    }
  }

  const publisher = describe(decider.match.publisher)
  const note = matchNote(decider.name, publisher.name, decider.match.matchedBy)
  if (note) notes.unshift(note)

  if (aa) {
    if (line.included === false) {
      return {
        onAaPlan: false,
        enteredName: decider.name,
        publisher,
        matchedBy: decider.match.matchedBy,
        billingAgency: "Advertising Associates",
        reason: "no_amount",
        message: `${publisher.name} bills via Advertising Associates, but the line has no amount yet, so the AA plan does not list it.`,
        notes,
      }
    }
    return {
      onAaPlan: true,
      enteredName: decider.name,
      publisher,
      matchedBy: decider.match.matchedBy,
      billingAgency: "Advertising Associates",
      reason: null,
      message: `On the AA plan. ${publisher.name} bills via Advertising Associates.`,
      notes,
    }
  }

  const agencyKey = String(publisher.billingAgency ?? "").toLowerCase()
  if (agencyKey === "assembled media") {
    return {
      onAaPlan: false,
      enteredName: decider.name,
      publisher,
      matchedBy: decider.match.matchedBy,
      billingAgency: "Assembled Media",
      reason: "billing_agency_assembled_media",
      message: `Not on the AA plan. ${publisher.name} bills via Assembled Media.`,
      notes,
    }
  }
  return {
    onAaPlan: false,
    enteredName: decider.name,
    publisher,
    matchedBy: decider.match.matchedBy,
    billingAgency: "Assembled Media",
    reason: "billing_agency_other",
    message: publisher.billingAgency
      ? `Not on the AA plan. ${publisher.name} has billing agency "${publisher.billingAgency}", which counts as Assembled Media.`
      : `Not on the AA plan. ${publisher.name} has no billing agency set, which counts as Assembled Media.`,
    notes,
  }
}
