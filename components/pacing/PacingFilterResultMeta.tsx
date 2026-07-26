"use client"

import { Button } from "@/components/ui/button"
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

export function PacingFilterCount({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="text-xs text-muted-foreground">
      <span className="num">{shown}</span> of <span className="num">{total}</span> line items
    </div>
  )
}
