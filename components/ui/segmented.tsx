"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"

import { cn } from "@/lib/utils"

type ToggleGroupSingleProps = Extract<
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>,
  { type: "single" }
>

type SegmentedProps = Omit<ToggleGroupSingleProps, "type"> & {
  value: string
  onValueChange: (value: string) => void
}

const Segmented = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  SegmentedProps
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    type="single"
    className={cn(
      "inline-flex items-center rounded-input bg-[var(--fill-track)] p-[3px]",
      className
    )}
    {...props}
  />
))
Segmented.displayName = "Segmented"

const SegmentedItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "inline-flex h-7 items-center justify-center rounded-[7px] px-3 text-[13px] font-medium text-[var(--text-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-card data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-e0",
      className
    )}
    {...props}
  />
))
SegmentedItem.displayName = "SegmentedItem"

export { Segmented, SegmentedItem }
