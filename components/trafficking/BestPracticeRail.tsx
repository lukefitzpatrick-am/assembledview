"use client"

import { ChevronDown } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { isEmptyBestPractice, type BestPractice } from "@/lib/types/bestPractice"
import type { MediaContainerBestPractice } from "@/lib/types/publisher"
import { channelLabel, containerKeyForChannel } from "@/lib/naming/fromPlan"
import { cn } from "@/lib/utils"

type BestPracticeRailProps = {
  channelKeys: string[]
  rows: MediaContainerBestPractice[]
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}

function BestPracticeBody({ bp }: { bp: BestPractice }) {
  if (isEmptyBestPractice(bp) || !bp) {
    return <p className="text-sm text-muted-foreground">No notes for this channel.</p>
  }
  return (
    <div className="space-y-4">
      {bp.sections.map((section, index) => {
        const heading = section.heading?.trim() ?? ""
        const items = (section.items ?? []).map((i) => i.trim()).filter(Boolean)
        if (!heading && items.length === 0) return null
        return (
          <div key={`${heading}-${index}`} className="space-y-1.5">
            {heading ? (
              <h4 className="text-sm font-semibold text-foreground">{heading}</h4>
            ) : null}
            {items.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function BestPracticeRail({
  channelKeys,
  rows,
  open,
  onOpenChange,
  className,
}: BestPracticeRailProps) {
  const blocks = channelKeys.map((channelKey) => {
    const containerKey = containerKeyForChannel(channelKey)
    const match = containerKey
      ? rows.find((r) => r.media_container === containerKey && r.is_active !== false)
      : undefined
    return {
      channelKey,
      label: channelLabel(channelKey),
      bp: match?.best_practice ?? null,
    }
  })

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={cn("w-full", className)}>
      <div className="rounded-card border border-border bg-card shadow-e1">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto w-full items-center justify-between rounded-card px-4 py-3 text-left hover:bg-table-row-hover"
          >
            <span className="text-sm font-semibold text-foreground">Best practice</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open ? "rotate-180" : "",
              )}
              aria-hidden
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-5 border-t border-border px-4 py-4">
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channels on this tab.</p>
            ) : (
              blocks.map((block) => (
                <div key={block.channelKey} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {block.label}
                  </p>
                  <BestPracticeBody bp={block.bp} />
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
