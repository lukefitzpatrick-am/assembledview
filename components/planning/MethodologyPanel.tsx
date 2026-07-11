"use client"

import { Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { PlanningMethodologyRow } from "@/lib/planning/types"

type MethodologyPanelProps = {
  rows: PlanningMethodologyRow[]
  /** Controlled open (optional) — used when Stage E link opens the same panel. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Hide the header trigger when opened only via external link. */
  showTrigger?: boolean
  triggerLabel?: string
}

export function MethodologyPanel({
  rows,
  open,
  onOpenChange,
  showTrigger = true,
  triggerLabel = "How we calculate",
}: MethodologyPanelProps) {
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
            {triggerLabel}
          </Button>
        </SheetTrigger>
      ) : null}
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>How we calculate</SheetTitle>
          <SheetDescription>
            Methodology notes from the planning warehouse — editable in Snowflake.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No methodology rows loaded yet. Seed PLANNING_METHODOLOGY in Snowsight.
            </p>
          ) : (
            ordered.map((row) => (
              <article
                key={row.methodology_id}
                className="space-y-2 border-b border-border pb-5 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{row.title}</h3>
                  {row.data_source ? (
                    <Badge variant="outline" className="font-normal">
                      {row.data_source}
                    </Badge>
                  ) : null}
                </div>
                {row.formula_text ? (
                  <pre className="overflow-x-auto rounded-input border border-border bg-surface-muted p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {row.formula_text}
                  </pre>
                ) : null}
                {row.description ? (
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                ) : null}
                {row.updated_at ? (
                  <p className="text-[10px] text-muted-foreground">
                    Updated {row.updated_at}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
