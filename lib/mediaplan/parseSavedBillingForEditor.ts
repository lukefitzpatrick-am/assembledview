/**
 * The media plan editor's read of a saved billing schedule (B4, 2 Nov 2026).
 *
 * Months come from the shared lib parser (`parsePersistedBillingScheduleToMonths`),
 * the same one finance uses, so the editor shows saved billing as saved: the
 * saved month fee (no search or social fee estimate), minus signs kept, and a
 * missing month media total rebuilt from the line items (P5, P6). This module
 * adds only what the editor needs on top: the grand total and the saved
 * partial approval metadata.
 */
import { normalizeBillingScheduleToArray, parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import type { BillingMonth } from "@/lib/billing/types"
import { parseMoney } from "@/lib/money"
import { hydratePartialMbaFromSavedMetadata, type PartialApprovalMetadata } from "@/lib/mediaplan/partialMba"

export type SavedBillingForEditor = {
  months: BillingMonth[]
  billingTotalFormatted: string
  partial: {
    hydrate: ReturnType<typeof hydratePartialMbaFromSavedMetadata>
    metadata: PartialApprovalMetadata
  } | null
}

const fmtAud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })

export function parseSavedBillingForEditor(billingSchedule: unknown): SavedBillingForEditor | null {
  const entries = normalizeBillingScheduleToArray(billingSchedule)
  if (!entries) return null
  const months = parsePersistedBillingScheduleToMonths(entries)
  if (!months) return null

  const total = months.reduce((sum, m) => sum + (parseMoney(m.totalAmount) ?? 0), 0)

  const partialEntry = (entries as Array<Record<string, unknown>>).find(
    (e) => e?.partialApproval ?? e?.partial_approval,
  )
  const savedPartial = (partialEntry?.partialApproval ?? partialEntry?.partial_approval) as
    | PartialApprovalMetadata
    | undefined
  const partial =
    savedPartial?.isPartial === true
      ? { hydrate: hydratePartialMbaFromSavedMetadata(savedPartial), metadata: savedPartial }
      : null

  return { months, billingTotalFormatted: fmtAud.format(total), partial }
}
