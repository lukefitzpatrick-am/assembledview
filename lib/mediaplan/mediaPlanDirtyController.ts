/**
 * Single owner of MBA create/edit page-level dirty state.
 *
 * PROPERTY (P2 inventory + amendments): dirty clears on save SUCCESS only —
 * never on save attempt / early return / catch. Call sites must use
 * `clearDirtyOnSaveSuccess` after a confirmed persist; there is intentionally
 * no `clearDirtyOnSaveAttempt` API.
 *
 * Hydration / load resets use `clearDirtyForHydration` (not a save path).
 */

export type MediaPlanDirtyController = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => boolean
  /** True when the page should treat edits as unsaved. */
  getHasUnsavedChanges: () => boolean
  /**
   * Bumped on every accepted dirty-mark, including already-dirty.
   * Autosave consumes this via `subscribe`, not the sticky boolean.
   */
  getEditRevision: () => number
  /** User / form edits after the dirty gate is open. */
  markUnsavedChanges: () => void
  /**
   * Channel total / line-item republishes. Same gate as markUnsavedChanges,
   * plus the post-fee passive quiet window.
   */
  markPassiveChannelChange: () => void
  /** Bypass the gate (draft resume, explicit "user already dirty" paths). */
  forceDirty: () => void
  /**
   * ONLY save-path clear. Call after a successful draft/version/publish step.
   * Do not call from attempt / early-return / catch paths.
   */
  clearDirtyOnSaveSuccess: () => void
  /** Load / hydrate / gate-open clears — not a save. */
  clearDirtyForHydration: () => void
  closeGate: () => void
  openGate: () => void
  isGateOpen: () => boolean
  resetPassiveQuiet: () => void
  quietPassiveForMs: (ms: number) => void
  /** Temporarily close the gate around bootstrap writes, then restore. */
  runWithGateClosed: <T>(fn: () => T) => T
}

export type CreateMediaPlanDirtyControllerOptions = {
  now?: () => number
}

export function createMediaPlanDirtyController(
  options: CreateMediaPlanDirtyControllerOptions = {}
): MediaPlanDirtyController {
  const now = options.now ?? (() => Date.now())
  let dirty = false
  let editRevision = 0
  let gateOpen = false
  let passiveQuietUntil = 0
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const setDirty = (next: boolean) => {
    if (dirty === next) return
    dirty = next
    emit()
  }

  /** Same path as set-dirty-true, but always emits so autosave can re-arm. */
  const noteEdit = () => {
    editRevision += 1
    if (dirty) {
      emit()
      return
    }
    dirty = true
    emit()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return dirty
    },
    getHasUnsavedChanges() {
      return dirty
    },
    getEditRevision() {
      return editRevision
    },
    markUnsavedChanges() {
      if (!gateOpen) return
      noteEdit()
    },
    markPassiveChannelChange() {
      if (!gateOpen) return
      if (now() < passiveQuietUntil) return
      noteEdit()
    },
    forceDirty() {
      noteEdit()
    },
    clearDirtyOnSaveSuccess() {
      setDirty(false)
    },
    clearDirtyForHydration() {
      setDirty(false)
    },
    closeGate() {
      gateOpen = false
    },
    openGate() {
      gateOpen = true
    },
    isGateOpen() {
      return gateOpen
    },
    resetPassiveQuiet() {
      passiveQuietUntil = 0
    },
    quietPassiveForMs(ms) {
      passiveQuietUntil = now() + ms
    },
    runWithGateClosed(fn) {
      const wasOpen = gateOpen
      gateOpen = false
      try {
        return fn()
      } finally {
        gateOpen = wasOpen
      }
    },
  }
}
