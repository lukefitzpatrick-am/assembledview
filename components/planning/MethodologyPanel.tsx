"use client"

import { Info } from "lucide-react"
import { useEffect } from "react"

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
import { cn } from "@/lib/utils"

type MethodologyPanelProps = {
  rows: PlanningMethodologyRow[]
  /** Controlled open (optional) — used when Stage E link opens the same panel. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Hide the header trigger when opened only via external link. */
  showTrigger?: boolean
  triggerLabel?: string
  /** Scroll/highlight a methodology_id when the sheet opens (e.g. `dfii`). */
  focusId?: string | null
}

export function MethodologyPanel({
  rows,
  open,
  onOpenChange,
  showTrigger = true,
  triggerLabel = "How we calculate",
  focusId,
}: MethodologyPanelProps) {
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order)

  useEffect(() => {
    if (!open || !focusId) return
    const t = window.setTimeout(() => {
      document
        .getElementById(`methodology-${focusId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
    return () => window.clearTimeout(t)
  }, [open, focusId])

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
            ordered.map((row) => {
              const focused = focusId != null && row.methodology_id === focusId
              return (
                <article
                  key={row.methodology_id}
                  id={`methodology-${row.methodology_id}`}
                  className={cn(
                    "space-y-2 border-b border-border pb-5 last:border-0",
                    focused && "rounded-input bg-surface-muted/60 p-3 ring-1 ring-ring"
                  )}
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
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
