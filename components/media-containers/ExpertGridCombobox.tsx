"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Combobox as BaseCombobox, type ComboboxProps } from "@/components/ui/combobox"

// Re-export so a grid only changes its import path (one line), not its JSX or type imports.
export { ComboboxModalProvider } from "@/components/ui/combobox"
export type { ComboboxOption, ComboboxProps } from "@/components/ui/combobox"

/**
 * Expert-grid Combobox: the open panel sizes to its content (min = trigger
 * width, max = 32rem/90vw) so full option text shows past the narrow grid
 * column. Scoped to expert grids — ui/combobox stays trigger-width-locked for
 * the 33 non-expert consumers.
 */
export function Combobox(props: ComboboxProps) {
  return (
    <BaseCombobox
      {...props}
      contentClassName={cn(
        "w-auto min-w-[--radix-popover-trigger-width] max-w-[min(32rem,90vw)]",
        props.contentClassName,
      )}
    />
  )
}
