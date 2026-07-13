"use client"

import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import { STAGES, type StageId } from "./constants"

type PlanningStepperProps = {
  stage: StageId
  completed: Record<StageId, boolean>
  onSelect: (stage: StageId) => void
}

export function PlanningStepper({ stage, completed, onSelect }: PlanningStepperProps) {
  return (
    <nav aria-label="Planning stages" className="mb-6">
      <ol className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-0">
        {STAGES.map((s, i) => {
          const isCurrent = s.id === stage
          const isDone = completed[s.id]
          const clickable = isDone || isCurrent
          return (
            <li key={s.id} className="flex items-center">
              {i > 0 ? (
                <span
                  className="mx-1 hidden h-px w-4 bg-border sm:block"
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onSelect(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-input px-2.5 py-1.5 text-left text-xs transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrent && "bg-primary/10 font-medium text-foreground",
                  !isCurrent && isDone && "text-foreground hover:bg-muted/80",
                  !clickable && "cursor-not-allowed text-muted-foreground/60"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                    isCurrent && "bg-primary text-primary-foreground",
                    !isCurrent && isDone && "bg-status-success text-primary-foreground",
                    !isCurrent && !isDone && "bg-muted text-muted-foreground"
                  )}
                >
                  {isDone && !isCurrent ? <Check className="h-3 w-3" strokeWidth={2} /> : i + 1}
                </span>
                <span>{s.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
