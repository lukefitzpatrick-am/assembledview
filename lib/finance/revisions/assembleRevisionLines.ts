/**
 * Join line_items to billing-basis schedule_months for the revision planner.
 * Pure, so the id join can be tested without a database.
 *
 * schedule_months rows carry either the bare line id or the decorated
 * `billing-{media}::bare` id (MB-4 / MB-11); line_items always carry the
 * bare id. Both sides are keyed on the bare id, so a decorated row still
 * lands on its line instead of in `unmatchedLineIds`.
 */

import {
  buildCanonicalBillingLineIdSet,
  canonicalBillingLineIdSetHas,
  toBillingOverrideLineItemId,
} from "@/lib/finance/manualBillingOverridesUi"

import type { RevisionLine } from "./types"

export type RevisionLineRow = {
  lineItemId: string
  channel: string
  publisher: string | null
  platform: string | null
  clientPaysForMedia: boolean | null
  position: number | null
}

export type RevisionBillingCell = {
  lineItemId: string
  component: "media" | "fee" | "adserving"
  month: string // YYYY-MM-01
  amountCents: number
}

export function revisionLineLabel(li: Pick<RevisionLineRow, "lineItemId" | "publisher" | "platform" | "channel">): string {
  const who = (li.publisher ?? li.platform ?? "").trim() || li.channel
  return `${who} · ${li.lineItemId}`
}

export function assembleRevisionLines(args: {
  lineRows: readonly RevisionLineRow[]
  billingRows: readonly RevisionBillingCell[]
  aaLineIds: ReadonlySet<string>
}): { lines: RevisionLine[]; unmatchedLineIds: string[] } {
  const aaIds = buildCanonicalBillingLineIdSet(args.aaLineIds)
  const byId = new Map<string, RevisionLine>()
  const sortedLines = [...args.lineRows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  for (const li of sortedLines) {
    const key = toBillingOverrideLineItemId(li.lineItemId)
    if (!key || byId.has(key)) continue
    byId.set(key, {
      lineItemId: li.lineItemId,
      label: revisionLineLabel(li),
      channel: li.channel,
      isProduction: li.channel === "production",
      clientPaysForMedia: li.clientPaysForMedia === true,
      isAaLine: canonicalBillingLineIdSetHas(aaIds, li.lineItemId),
      media: {},
      fee: {},
      adserving: {},
    })
  }
  const unmatched = new Set<string>()
  for (const r of args.billingRows) {
    if (r.lineItemId.startsWith("__service__")) continue
    const key = toBillingOverrideLineItemId(r.lineItemId)
    const line = byId.get(key)
    if (!line) {
      unmatched.add(r.lineItemId)
      continue
    }
    const m = r.month.slice(0, 7)
    const rec = r.component === "media" ? line.media : r.component === "fee" ? line.fee : line.adserving
    rec[m] = (rec[m] ?? 0) + r.amountCents
  }
  const lines = [...byId.values()].filter(
    (l) => Object.keys(l.media).length + Object.keys(l.fee).length + Object.keys(l.adserving).length > 0,
  )
  return { lines, unmatchedLineIds: [...unmatched].sort() }
}
