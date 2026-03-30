"use client"

import { LayoutGrid, LayoutList } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import type { ListGridLayoutMode } from "@/lib/hooks/useListGridLayoutPreference"

type ListGridToggleProps = {
  value: ListGridLayoutMode
  onChange: (mode: ListGridLayoutMode) => void
  className?: string
  /** Overrides visible label next to the control */
  label?: string
}

export function ListGridToggle({ value, onChange, className, label = "Layout" }: ListGridToggleProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-sm text-muted-foreground whitespace-nowrap">{label}</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => {
          if (v === "list" || v === "grid") onChange(v)
        }}
        variant="outline"
        size="sm"
        aria-label="Choose list or grid layout"
      >
        <ToggleGroupItem value="list" aria-label="List view">
          <LayoutList className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="grid" aria-label="Grid view">
          <LayoutGrid className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
