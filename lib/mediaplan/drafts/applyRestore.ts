import type { PlanDraftStateV1 } from "./types"

export type DraftChannelApply = {
  hydration: Record<string, unknown[]>
  media: Record<string, unknown[]>
}

export type PlanDraftRestoreGate = {
  pending: PlanDraftStateV1 | null
  applied: boolean
}

export function initialPlanDraftRestoreGate(): PlanDraftRestoreGate {
  return { pending: null, applied: false }
}

function cloneRows(rows: unknown[]): unknown[] {
  return typeof structuredClone === "function"
    ? structuredClone(rows)
    : (JSON.parse(JSON.stringify(rows)) as unknown[])
}

/**
 * Resume writes both bags the editor keeps in parallel: container
 * `initialLineItems` (hydration) and the save/callback media arrays.
 * Empty arrays are a deleted-line signal — never skip them.
 */
export function buildDraftChannelApply(
  channels: Record<string, unknown[]>,
): DraftChannelApply {
  const hydration: Record<string, unknown[]> = {}
  const media: Record<string, unknown[]> = {}
  for (const [key, rows] of Object.entries(channels)) {
    if (!Array.isArray(rows)) continue
    hydration[key] = cloneRows(rows)
    media[key] = cloneRows(rows)
  }
  return { hydration, media }
}

export function clickResume(
  gate: PlanDraftRestoreGate,
  state: PlanDraftStateV1,
  hydrationSettled: boolean,
): { gate: PlanDraftRestoreGate; apply: PlanDraftStateV1 | null } {
  if (hydrationSettled) {
    return { gate: { pending: null, applied: true }, apply: state }
  }
  return { gate: { pending: state, applied: false }, apply: null }
}

export function flushWhenHydrationSettled(
  gate: PlanDraftRestoreGate,
  hydrationSettled: boolean,
): { gate: PlanDraftRestoreGate; apply: PlanDraftStateV1 | null } {
  if (!hydrationSettled || gate.applied || !gate.pending) {
    return { gate, apply: null }
  }
  return { gate: { pending: null, applied: true }, apply: gate.pending }
}

export function shouldApplyTipLineItems(gate: PlanDraftRestoreGate): boolean {
  return !gate.applied
}
