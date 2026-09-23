import "server-only"

import type { RelabelActiveMap, RelabelBeforeState, RelabelDeletedRow, RelabelPreview } from "./shared/types"

export class RelabelApplyError extends Error {
  constructor(
    public code: "blocked" | "needs_ack" | "invalid" | "no_change",
    message: string,
  ) {
    super(message)
    this.name = "RelabelApplyError"
  }
}

export function assertApplyAllowed(
  preview: RelabelPreview,
  opts: { acknowledgeWarnings?: boolean } = {},
): void {
  if (preview.blocks.length > 0) {
    throw new RelabelApplyError(
      "blocked",
      `Relabel is blocked: ${preview.blocks.map((b) => b.code).join(", ")}.`,
    )
  }
  if (preview.state === "no_change") {
    throw new RelabelApplyError(
      "no_change",
      `Already attributed to ${preview.lineItemId} for this scope. Nothing to write.`,
    )
  }
  if (preview.warnings.length > 0 && !opts.acknowledgeWarnings) {
    throw new RelabelApplyError(
      "needs_ack",
      `Relabel has warnings that must be acknowledged: ${preview.warnings.map((w) => w.code).join(", ")}.`,
    )
  }
}

export function buildApplyLogPayload(
  preview: RelabelPreview,
  extras: { deletedDuplicateRows?: RelabelDeletedRow[]; priorActiveMap?: RelabelActiveMap | null } = {},
): RelabelBeforeState {
  return {
    channel: preview.channel,
    platformEntityId: preview.platformEntityId,
    entityName: preview.entityName,
    lineItemId: preview.lineItemId,
    dateFrom: preview.dateFrom,
    dateTo: preview.dateTo,
    previousByRange: preview.moves.map((move) => ({ ...move })),
    priorActiveMap: extras.priorActiveMap ?? preview.activeMap,
    deletedDuplicateRows: extras.deletedDuplicateRows ?? [],
  }
}
