"use client"

import { useEffect, useRef } from "react"
import { signalMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"

/**
 * Clears Expert "not saved yet" badges when page Save succeeds
 * (hasUnsavedChanges flips true → false).
 */
export function ExpertApplyDirtyClearOnSave({
  hasUnsavedChanges,
}: {
  hasUnsavedChanges: boolean
}) {
  const prev = useRef(hasUnsavedChanges)
  useEffect(() => {
    if (prev.current === true && hasUnsavedChanges === false) {
      signalMediaPlanPageSaved()
    }
    prev.current = hasUnsavedChanges
  }, [hasUnsavedChanges])
  return null
}
