"use client"

import { MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type RowActionMenuItem = {
  label: string
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
  disabledReason?: string
}

export function RowActionMenu({ items }: { items: RowActionMenuItem[] }) {
  if (items.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {items.map((item) => {
          const menuItem = (
            <DropdownMenuItem
              disabled={item.disabled}
              title={item.disabled ? item.disabledReason : undefined}
              className={cn(
                "cursor-pointer",
                item.destructive && "text-status-critical-fg focus:text-status-critical-fg",
                item.disabled && "cursor-not-allowed",
              )}
              onSelect={(event) => {
                if (item.disabled) {
                  event.preventDefault()
                  return
                }
                item.onSelect()
              }}
            >
              {item.label}
            </DropdownMenuItem>
          )
          if (item.disabled && item.disabledReason) {
            return (
              <span key={item.label} title={item.disabledReason} className="block">
                {menuItem}
              </span>
            )
          }
          return (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              className={cn(
                "cursor-pointer",
                item.destructive && "text-status-critical-fg focus:text-status-critical-fg",
              )}
              onSelect={() => item.onSelect()}
            >
              {item.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
