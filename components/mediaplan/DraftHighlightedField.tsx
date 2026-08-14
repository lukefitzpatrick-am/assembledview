"use client"

import type { ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useDraftFieldDiff } from "@/hooks/useDraftFieldDiff"
import type { DraftFieldKind } from "@/lib/mediaplan/drafts/fieldDiff"
import { cn } from "@/lib/utils"

export const DRAFT_FIELD_HIGHLIGHT_CLASS =
  "ring-2 ring-status-warning/70 ring-offset-1 ring-offset-background"

export function DraftHighlightedField(props: {
  lineItemId: string
  fieldPath: string
  value: unknown
  kind?: DraftFieldKind
  className?: string
  children: ReactNode
}) {
  const diff = useDraftFieldDiff(
    props.lineItemId,
    props.fieldPath,
    props.value,
    props.kind,
  )
  if (!diff.changed) return <>{props.children}</>
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn("rounded-input", DRAFT_FIELD_HIGHLIGHT_CLASS, props.className)}
            data-draft-changed="true"
            data-draft-field={props.fieldPath}
            data-draft-was={diff.wasFormatted}
            data-line-item-id={props.lineItemId}
          >
            {props.children}
          </div>
        </TooltipTrigger>
        <TooltipContent>Was {diff.wasFormatted}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
