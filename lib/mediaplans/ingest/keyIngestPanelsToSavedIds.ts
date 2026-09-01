/**
 * Remap ingest panels onto the line_item_ids this save actually wrote.
 * Match by source_row_ref identity, never array position. A deleted ingest
 * row has no saved identity and gets no panels. A human-added row carries
 * none and receives none. Order does not matter.
 */

import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"
import {
  ingestSourceRowRefsFromSavedLine,
  type SavedLineForIngestPanels,
} from "@/lib/mediaplans/ingest/ingestSourceRowRefs"
import {
  stampProposalForSave,
  type IngestPanelRow,
} from "@/lib/mediaplans/ingest/stampProposalForSave"

export type { SavedLineForIngestPanels }

export function keyIngestPanelsToSavedIds(args: {
  proposal: IngestProposal
  mbaNumber: string
  savedLineItems: SavedLineForIngestPanels[]
}): {
  panels: IngestPanelRow[]
  sourcePanelCount: number
  survivingIngestPanelCount: number
} {
  const { lineItems: stamped, panels } = stampProposalForSave(
    args.proposal,
    args.mbaNumber,
  )
  const sourcePanelCount = panels.length
  if (stamped.length === 0) {
    return { panels: [], sourcePanelCount, survivingIngestPanelCount: 0 }
  }

  const channel = stamped[0]!.channel
  const savedOfChannel = args.savedLineItems.filter((l) => l.channel === channel)

  const savedIdByRef = new Map<string, string>()
  for (const saved of savedOfChannel) {
    for (const ref of ingestSourceRowRefsFromSavedLine(saved)) {
      if (!savedIdByRef.has(ref)) savedIdByRef.set(ref, saved.lineItemId)
    }
  }

  const remapped = panels.flatMap((p) => {
    const ref = p.sourceRowRef?.trim()
    if (!ref) return []
    const lineItemId = savedIdByRef.get(ref)
    if (!lineItemId) return []
    return [
      {
        ...p,
        lineItemId,
        mbaNumber: args.mbaNumber.toLowerCase(),
      },
    ]
  })

  const survivingIngestPanelCount = panels.filter((p) => {
    const ref = p.sourceRowRef?.trim()
    return Boolean(ref && savedIdByRef.has(ref))
  }).length

  return { panels: remapped, sourcePanelCount, survivingIngestPanelCount }
}
