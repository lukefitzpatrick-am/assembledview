"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { ErrorState, LoadingState } from "@/components/ui/states"
import { cn } from "@/lib/utils"

const SLOW_HINT_MS = 8000

/**
 * Shared media-container loading / empty / error surfaces (UX-6 / UX-21).
 */
export function MediaContainerLoadState({
  loading,
  error,
  onRetry,
  label = "channel",
  className,
}: {
  loading: boolean
  error?: string | null
  onRetry?: () => void
  label?: string
  className?: string
}) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const id = window.setTimeout(() => setSlow(true), SLOW_HINT_MS)
    return () => window.clearTimeout(id)
  }, [loading])

  if (error) {
    return (
      <ErrorState
        className={className}
        title={`Couldn't load ${label}`}
        message={error}
        onRetry={onRetry}
      />
    )
  }

  if (!loading) return null

  return (
    <div className={cn("space-y-3 py-4", className)} aria-busy="true">
      <LoadingState rows={3} />
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        {slow ? (
          <>
            <AlertTriangle className="h-4 w-4 text-status-behind-fg" aria-hidden />
            <span>Still working on {label}… this is taking longer than usual.</span>
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span>Loading {label}…</span>
          </>
        )}
      </div>
    </div>
  )
}
