import { normalizeLineItemId } from "./channels"
import type { RelabelBeforeState, RelabelRevertPlan } from "./types"

export function revertPlanFromPayload(payload: RelabelBeforeState): RelabelRevertPlan {
  return {
    restoreRanges: (payload.previousByRange ?? []).map((range) => ({ ...range })),
    reinsertDeletedRows: (payload.deletedDuplicateRows ?? []).map((row) => ({ ...row })),
    deactivateMap: {
      channel: payload.channel,
      platformEntityId: payload.platformEntityId,
      lineItemId: normalizeLineItemId(payload.lineItemId),
    },
    reactivateMap: payload.priorActiveMap ? { ...payload.priorActiveMap } : null,
  }
}
