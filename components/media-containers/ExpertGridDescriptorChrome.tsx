"use client"

import { Copy, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function descriptorPinTooltip(pinned: boolean | null): string {
  return pinned === false ? "Collapse descriptors" : "Keep descriptors expanded"
}

export function ExpertGridDescriptorPinButton({
  pinned,
  onCycle,
}: {
  pinned: boolean | null
  onCycle: () => void
}) {
  const tooltip = descriptorPinTooltip(pinned)
  const Icon = pinned === false ? PinOff : Pin
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground",
            pinned === true && "text-primary",
            pinned === false && "text-muted-foreground"
          )}
          aria-label={tooltip}
          aria-pressed={pinned !== null}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onCycle()
          }}
        >
          <Icon className="h-3 w-3" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export function ExpertGridCompactRowLabelChrome({
  labelText,
  onDuplicate,
  onDelete,
  deleteDisabled,
}: {
  labelText: string
  onDuplicate: () => void
  onDelete: () => void
  deleteDisabled: boolean
}) {
  return (
    <>
      <span
        data-eg-compact-chrome=""
        className="pointer-events-none absolute inset-y-0 left-0 right-6 z-[1] flex items-center overflow-hidden px-1 text-xs"
        title={labelText}
      >
        <span className="truncate">{labelText || "\u00a0"}</span>
      </span>
      <div
        data-eg-compact-chrome=""
        className="absolute right-0 top-1/2 z-[2] -translate-y-1/2"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground"
              aria-label="Row actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[8rem]">
            <DropdownMenuItem onSelect={() => onDuplicate()}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={deleteDisabled}
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete()}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}
