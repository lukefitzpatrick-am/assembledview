import { cn } from "@/lib/utils"

import { journeyLineDone, journeyModel, type JourneyStatus } from "@/components/brand/journeySteps"

const DOT: Record<string, string> = {
  "done-first": "bg-am-sky",
  done: "bg-am-forest-light",
  current: "bg-am-lime ring-4 ring-accent/25",
  future: "border-2 border-am-context-black bg-transparent",
}

export function JourneyLine({
  status,
  className,
}: {
  status: JourneyStatus
  className?: string
}) {
  const model = journeyModel(status)

  if (model.kind === "cancelled") {
    return (
      <p className={cn("m-0", className)}>
        <span className="inline-flex rounded-pill bg-am-panel px-3 py-1 text-[13px] font-semibold text-am-muted-on-black line-through">
          {model.label}
        </span>
      </p>
    )
  }

  return (
    <ol
      aria-label="Campaign stage"
      className={cn("m-0 flex list-none flex-wrap items-center gap-y-2.5 p-0", className)}
    >
      {model.steps.map((step, index) => {
        const last = index === model.steps.length - 1
        return (
          <li key={step.id} className="flex items-center" data-step={step.id} data-state={step.state}>
            <span
              className={cn(
                "inline-flex items-center gap-2 text-[13px] font-semibold",
                step.state === "current" ? "text-am-white" : "text-am-muted-on-black",
              )}
            >
              <span className={cn("size-3.5 shrink-0 rounded-full", DOT[step.state])} aria-hidden />
              {step.label}
            </span>
            {last ? null : (
              <span
                className={cn(
                  "mx-2 h-0.5 w-9",
                  journeyLineDone(step.state) ? "bg-am-forest-light" : "bg-am-context-black",
                )}
                data-line={journeyLineDone(step.state) ? "done" : "future"}
                aria-hidden
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
