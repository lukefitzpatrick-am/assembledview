"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  onPrimary: () => void
  menu: Array<{ label: string; hint?: string; onSelect: () => void; disabled?: boolean }>
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
}: SplitActionButtonProps) {
  const bothDisabled = disabled || isBusy
  const shownLabel = isBusy ? busyLabel ?? label : label

  return (
    <div
      className={cn(
        "inline-flex h-9 shrink-0 overflow-hidden rounded-pill shadow-sm",
        variant === "outline" && "border-2 border-input",
      )}
    >
      <Button
        type="button"
        variant={variant}
        disabled={bothDisabled}
        title={title}
        onClick={onPrimary}
        className={cn(
          "h-9 rounded-none rounded-l-pill px-4 shadow-none hover:translate-y-0 hover:shadow-none active:scale-100",
          variant === "outline" && "border-0",
        )}
      >
        {shownLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            disabled={bothDisabled}
            aria-haspopup="menu"
            aria-label={`${label} menu`}
            className={cn(
              "h-9 w-8 rounded-none rounded-r-pill border-l border-border px-0 shadow-none hover:translate-y-0 hover:shadow-none active:scale-100",
              variant === "outline" && "border-0 border-l border-border",
            )}
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={6}>
          {menu.map((item) => (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              className="cursor-pointer flex-col items-start gap-0.5"
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
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
