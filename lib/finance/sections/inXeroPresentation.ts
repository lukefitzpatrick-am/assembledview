/**
 * In Xero card presentation. Matching stays in draftMatch.ts — this file only
 * decides labels, grouping order, and which next-step sits on RowActionLine.
 */

import { INVOICING_CLIENT_GRID_CLASS } from "@/lib/finance/sections/invoicingRowPresentation"
import type { DraftMatchGrouped, DraftMatchOutcome, DraftMatchRow } from "@/lib/finance/sections/draftMatch"

/** Same two-column client grid as invoicing (CB-8b). */
export const IN_XERO_CLIENT_GRID_CLASS = INVOICING_CLIENT_GRID_CLASS

/** Exceptions first, agreement last. */
export const DRAFT_MATCH_OUTCOME_UI_ORDER: readonly DraftMatchOutcome[] = [
  "Differs",
  "Missing",
  "Extra",
  "Agrees",
]

export type InXeroPrimaryKind = "accept" | "assign"

export type InXeroClientCard = {
  clientKey: string
  clientName: string
  rows: DraftMatchRow[]
}

export function inXeroPrimaryAction(outcome: DraftMatchOutcome): InXeroPrimaryKind | null {
  if (outcome === "Differs") return "accept"
  if (outcome === "Extra") return "assign"
  return null
}

export function inXeroPrimaryLabel(kind: InXeroPrimaryKind): string {
  return kind === "accept" ? "Accept Xero figure" : "Assign"
}

export function isDraftMatchOutcomeCollapsedByDefault(outcome: DraftMatchOutcome): boolean {
  return outcome === "Agrees"
}

export function visibleDraftMatchOutcomes(grouped: DraftMatchGrouped): DraftMatchOutcome[] {
  return DRAFT_MATCH_OUTCOME_UI_ORDER.filter((outcome) => grouped[outcome].length > 0)
}

export function groupDraftMatchRowsByClient(rows: DraftMatchRow[]): InXeroClientCard[] {
  const cards: InXeroClientCard[] = []
  const index = new Map<string, number>()
  for (const rec of rows) {
    const clientKey =
      rec.clients_id != null ? String(rec.clients_id) : rec.client_name.trim().toLowerCase() || rec.id
    const existing = index.get(clientKey)
    if (existing == null) {
      index.set(clientKey, cards.length)
      cards.push({
        clientKey,
        clientName: rec.client_name,
        rows: [rec],
      })
    } else {
      cards[existing]!.rows.push(rec)
    }
  }
  return cards
}
