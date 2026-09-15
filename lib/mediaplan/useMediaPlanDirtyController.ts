"use client"

import { useRef, useSyncExternalStore } from "react"
import {
  createMediaPlanDirtyController,
  type MediaPlanDirtyController,
} from "@/lib/mediaplan/mediaPlanDirtyController"

export type UseMediaPlanDirtyControllerResult = MediaPlanDirtyController & {
  hasUnsavedChanges: boolean
}

/**
 * React adapter for {@link createMediaPlanDirtyController}.
 * One instance per create/edit page mount.
 *
 * Snapshot is the sticky boolean only. Already-dirty marks still `emit`
 * (for autosave re-arm) but `Object.is(true, true)` bails — the 365KB
 * create/edit tree does not re-render per keystroke. Do not snapshot
 * `editRevision` here.
 */
export function useMediaPlanDirtyController(): UseMediaPlanDirtyControllerResult {
  const ctrlRef = useRef<MediaPlanDirtyController | null>(null)
  if (ctrlRef.current == null) {
    ctrlRef.current = createMediaPlanDirtyController()
  }
  const ctrl = ctrlRef.current
  const hasUnsavedChanges = useSyncExternalStore(
    ctrl.subscribe,
    ctrl.getSnapshot,
    ctrl.getSnapshot
  )
  return {
    ...ctrl,
    hasUnsavedChanges,
  }
}
