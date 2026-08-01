"use client"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  MEASURE_GROUPS,
  measurePickerState,
} from "@/lib/finance/sections/investment/measureCatalog"
import type {
  InvestmentCutDim,
  InvestmentCutMeasure,
} from "@/lib/finance/sections/investment/cutTypes"
import { cn } from "@/lib/utils"

type Props = {
  dimensions: InvestmentCutDim[]
  measures: InvestmentCutMeasure[]
  onChange: (next: InvestmentCutMeasure[]) => void
  lineFiltersActive?: boolean
  fy?: number
}

export function InvestmentMeasurePicker({
  dimensions,
  measures,
  onChange,
  lineFiltersActive,
  fy,
}: Props) {
  const items = measurePickerState(
    dimensions,
    lineFiltersActive
      ? { publishers: ["*"] } // any line filter disables Actuals
      : undefined,
    { fy }
  )

  function toggle(key: InvestmentCutMeasure, disabled: boolean) {
    if (disabled) return
    if (measures.includes(key)) {
      if (measures.length <= 1) return
      onChange(measures.filter((m) => m !== key))
    } else {
      onChange([...measures, key])
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        {MEASURE_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group.id)
          return (
            <div key={group.id}>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groupItems.map((item) => {
                  const active = measures.includes(item.key)
                  const chip = (
                    <button
                      type="button"
                      disabled={item.disabled}
                      onClick={() => toggle(item.key, item.disabled)}
                      className={cn(
                        "rounded-pill border px-2 py-0.5 text-xs transition",
                        item.disabled && "cursor-not-allowed opacity-50",
                        !item.disabled && "interactive-tint cursor-pointer",
                        active && !item.disabled
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-muted-foreground"
                      )}
                      aria-pressed={active}
                      aria-disabled={item.disabled}
                    >
                      <Badge
                        variant={active && !item.disabled ? "info" : "outline"}
                        className="pointer-events-none border-0 bg-transparent p-0 text-xs font-normal"
                      >
                        {item.label}
                      </Badge>
                    </button>
                  )
                  if (item.disabled && item.disabledReason) {
                    return (
                      <Tooltip key={item.key}>
                        <TooltipTrigger asChild>{chip}</TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          {item.disabledReason}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }
                  return <span key={item.key}>{chip}</span>
                })}
              </div>
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
