"use client"

import type { ReactNode } from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export interface SlideOverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Applied to the sheet panel (e.g. max width). */
  contentClassName?: string
}

export function SlideOver({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName,
}: SlideOverProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-full w-full min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl",
          contentClassName
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border/70 px-6 py-5 text-left">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {/* Content area: no padding — children handle layout (e.g. full-width accent bars) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
