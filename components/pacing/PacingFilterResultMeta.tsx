"use client"

import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/states"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"

export function PacingFilterEmptyState() {
  const resetToDefaults = usePacingFilterStore((s) => s.resetToDefaults)

  return (
    <div className="rounded-card border border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">
        No line items match these filters
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => resetToDefaults()}
      >
        Reset
      </Button>
    </div>
  )
}

/** Fail-closed UI when client_ids are selected but the id→name map never loaded. */
export function PacingClientFilterUnavailable() {
  return (
    <ErrorState
      title="Client filter unavailable"
      message="The client list could not be loaded, so filtered results are hidden. Retry to reload clients."
      onRetry={() => {
        window.location.reload()
      }}
      retryLabel="Retry"
    />
  )
}

export function PacingFilterCount({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="text-xs text-muted-foreground">
      <span className="num">{shown}</span> of <span className="num">{total}</span> line items
    </div>
  )
}
