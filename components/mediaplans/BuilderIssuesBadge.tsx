"use client"

import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"
import { useId, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  scrollToBuilderTarget,
  type BuilderIssue,
} from "@/lib/mediaplan/builderIssues"
import { cn } from "@/lib/utils"

/**
 * Sticky "N Issues" disclosure — expands an itemised click/keyboard checklist.
 */
export function BuilderIssuesBadge({
  issues,
  className,
}: {
  issues: BuilderIssue[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  if (issues.length === 0) return null

  const errorCount = issues.filter((i) => i.severity === "error").length

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full max-w-md", className)}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 rounded-pill border-pacing-behind/50 bg-pacing-behind-bg/40 text-status-behind-fg hover:bg-pacing-behind-bg",
            errorCount > 0 &&
              "border-pacing-critical/50 bg-pacing-critical-bg/50 text-status-critical-fg hover:bg-pacing-critical-bg"
          )}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${issues.length} builder issues. ${open ? "Collapse" : "Expand"} list.`}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          <span className="num text-xs font-semibold">
            {issues.length} {issues.length === 1 ? "Issue" : "Issues"}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        id={panelId}
        className="mt-2 overflow-hidden data-[state=closed]:animate-out data-[state=open]:animate-in"
      >
        <div className="rounded-card border border-border/70 bg-card shadow-e1">
          <div className="border-b border-border/60 px-3 py-2">
            <p className="text-xs font-semibold text-foreground">Checklist</p>
            <p className="text-[11px] text-muted-foreground">
              Activate an item to jump to its field. Resolving items clears them from this list.
            </p>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="list">
            {issues.map((issue) => (
              <li key={issue.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-table-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
                    {(issue.fieldLabel || issue.stepLabel) && (
                      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {[issue.stepLabel, issue.fieldLabel].filter(Boolean).join(" · ")}
                      </span>
                    )}
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
