"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Shown when a channel container has no line items yet (replaces the auto $0 starter row).
 */
export function ContainerEmptyLinesPlaceholder({
  onAdd,
  className,
}: {
  onAdd: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">Add your first line</p>
      <p className="max-w-sm text-xs text-muted-foreground/80">
        This channel is enabled with no lines yet — nothing will bill until you add one.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onAdd}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add line item
      </Button>
    </div>
  )
}
