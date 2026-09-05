"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type SplitActionButtonProps = {
  label: string
  busyLabel?: string
  isBusy?: boolean
  disabled?: boolean
  title?: string
  variant?: "action" | "outline"
  onPrimary?: () => void
  menu: Array<{ label: string; hint?: string; onSelect: () => void; disabled?: boolean }>
  hideCaret?: boolean
  menuOnly?: boolean
  menuHeader?: string
  onMenuOpenChange?: (open: boolean) => void
  size?: "default" | "compact"
  hintPlacement?: "below" | "end"
  menuSide?: "top" | "bottom"
}

export function SplitActionButton({
  label,
  busyLabel,
  isBusy = false,
  disabled = false,
  title,
  variant = "action",
  onPrimary,
  menu,
  hideCaret = false,
  menuOnly = false,
  menuHeader,
  onMenuOpenChange,
  size = "default",
  hintPlacement = "below",
  menuSide = "top",
}: SplitActionButtonProps) {
  const bothDisabled = disabled || isBusy
  const shownLabel = isBusy ? busyLabel ?? label : label
  const compact = size === "compact"
  const heightClass = compact ? "h-7 max-[375px]:h-11" : "h-9"
  const [open, setOpen] = useState(false)

  const setMenuOpen = (next: boolean) => {
    setOpen(next)
    onMenuOpenChange?.(next)
  }

  useEffect(() => {
    if (bothDisabled) setOpen(false)
  }, [bothDisabled])

  const primaryClass = cn(
    heightClass,
    "rounded-none px-4 shadow-none hover:translate-y-0 hover:shadow-none active:scale-100",
    compact && "px-2.5 text-xs",
    hideCaret ? "rounded-pill" : "rounded-l-pill",
    variant === "outline" && "border-0",
  )

  const caretClass = cn(
    heightClass,
    "w-8 rounded-none rounded-r-pill border-l border-border px-0 shadow-none hover:translate-y-0 hover:shadow-none active:scale-100",
    compact && "w-7",
    variant === "outline" && "border-0 border-l border-border",
  )

  const menuItems = menu.map((item) => (
    <DropdownMenuItem
      key={item.label}
      disabled={item.disabled}
      className={cn(
        "cursor-pointer",
        hintPlacement === "end"
          ? "flex-row items-center justify-between gap-3"
          : "flex-col items-start gap-0.5",
      )}
      onSelect={() => {
        if (item.disabled) return
        item.onSelect()
      }}
    >
      <span>{item.label}</span>
      {item.hint ? (
        <span className="text-xs font-normal text-muted-foreground">{item.hint}</span>
      ) : null}
    </DropdownMenuItem>
  ))

  const menuContent = (
    <DropdownMenuContent side={menuSide} align="end" sideOffset={6}>
      {menuHeader ? (
        <>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {menuHeader}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </>
      ) : null}
      {menuItems}
    </DropdownMenuContent>
  )

  if (hideCaret) {
    return (
      <div
        className={cn(
          "inline-flex shrink-0 overflow-hidden rounded-pill shadow-sm",
          heightClass,
          variant === "outline" && "border-2 border-input",
        )}
      >
        <Button
          type="button"
          variant={variant}
          disabled={bothDisabled}
          title={title}
          onClick={() => onPrimary?.()}
          className={primaryClass}
        >
          {shownLabel}
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-pill shadow-sm",
        heightClass,
        variant === "outline" && "border-2 border-input",
      )}
    >
      <DropdownMenu open={open} onOpenChange={setMenuOpen}>
        <Button
          type="button"
          variant={variant}
          disabled={bothDisabled}
          title={title}
          onClick={() => {
            if (menuOnly) {
              setMenuOpen(true)
              return
            }
            onPrimary?.()
          }}
          className={primaryClass}
        >
          {shownLabel}
        </Button>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            disabled={bothDisabled}
            aria-haspopup="menu"
            aria-label={`${label} menu`}
            className={caretClass}
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        {menuContent}
      </DropdownMenu>
    </div>
  )
}
