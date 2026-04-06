"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { ChevronRight } from "lucide-react"

import MediaGanttChart from "@/app/dashboard/[slug]/[mba_number]/components/MediaGanttChart"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { normaliseLineItemsByType } from "@/lib/mediaplan/normalizeLineItem"
import { serializeLineItemsForGantt } from "@/lib/mediaplan/serializeLineItemsForGantt"
import { cn } from "@/lib/utils"

const EMPTY_LINE_ITEMS: unknown[] = []

function campaignDateToIso(d: Date | null | undefined): string {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return ""
  return format(d, "yyyy-MM-dd")
}

export type MediaContainerTimelineCollapsibleProps = {
  mediaTypeKey: string
  /** RHF useWatch may be typed loosely (e.g. television); we only treat arrays as line items. */
  lineItems: unknown
  campaignStartDate: Date
  campaignEndDate: Date
  className?: string
}

export default function MediaContainerTimelineCollapsible({
  mediaTypeKey,
  lineItems,
  campaignStartDate,
  campaignEndDate,
  className,
}: MediaContainerTimelineCollapsibleProps) {
  const lineItemArray = Array.isArray(lineItems) ? lineItems : EMPTY_LINE_ITEMS

  const normalised = useMemo(() => {
    const serialized = serializeLineItemsForGantt(lineItemArray, mediaTypeKey)
    return normaliseLineItemsByType({ [mediaTypeKey]: serialized })
  }, [lineItemArray, mediaTypeKey])

  const startIso = campaignDateToIso(campaignStartDate)
  const endIso = campaignDateToIso(campaignEndDate)

  if (lineItemArray.length === 0) return null

  return (
    <Collapsible
      defaultOpen={false}
      className={cn("group border-t border-border/40 pt-3 mt-3", className)}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-2 text-left text-sm font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
          aria-hidden
        />
        Schedule preview
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 data-[state=closed]:animate-none">
        <MediaGanttChart lineItems={normalised} startDate={startIso} endDate={endIso} />
      </CollapsibleContent>
    </Collapsible>
  )
}
