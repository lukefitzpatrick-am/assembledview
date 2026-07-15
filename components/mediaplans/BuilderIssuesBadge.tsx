"use client"

import { AlertTriangle, ChevronRight } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  scrollToBuilderTarget,
  type BuilderIssue,
} from "@/lib/mediaplan/builderIssues"
import { cn } from "@/lib/utils"

/**
 * Sticky "N Issues" control — opens an itemised click-to-navigate checklist.
 */
export function BuilderIssuesBadge({
  issues,
  className,
}: {
  issues: BuilderIssue[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  if (issues.length === 0) return null

  const errorCount = issues.filter((i) => i.severity === "error").length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 rounded-pill border-pacing-behind/50 bg-pacing-behind-bg/40 text-status-behind-fg hover:bg-pacing-behind-bg",
            errorCount > 0 &&
              "border-pacing-critical/50 bg-pacing-critical-bg/50 text-status-critical-fg hover:bg-pacing-critical-bg",
            className
          )}
          aria-label={`${issues.length} builder issues`}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          <span className="num text-xs font-semibold">
            {issues.length} {issues.length === 1 ? "Issue" : "Issues"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-xs font-semibold text-foreground">Checklist</p>
          <p className="text-[11px] text-muted-foreground">
            Click an item to jump to it. Resolving items clears them from this list.
          </p>
        </div>
        <ul className="max-h-64 overflow-y-auto py-1" role="list">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-table-row-hover"
                onClick={() => {
                  scrollToBuilderTarget(issue.scrollTargetId)
                  setOpen(false)
                }}
              >
                <Badge
                  variant={issue.severity === "error" ? "critical" : "behind"}
                  size="sm"
                  className="mt-0.5 shrink-0 rounded-pill px-1.5 text-[10px] uppercase"
                >
                  {issue.severity === "error" ? "Must fix" : "Review"}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-foreground">
                    {issue.title}
                  </span>
                  {issue.detail ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {issue.detail}
                    </span>
                  ) : null}
                </span>
                {issue.scrollTargetId ? (
                  <ChevronRight
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
