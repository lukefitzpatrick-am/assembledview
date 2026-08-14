"use client"

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ChecklistItem } from "@/lib/codex/types"
import { cn } from "@/lib/utils"

export function TaskChecklist({
  items,
  onToggle,
  onDelete,
  onMove,
}: {
  items: ChecklistItem[]
  onToggle: (item: ChecklistItem) => void
  onDelete?: (item: ChecklistItem) => void
  onMove?: (itemId: number, direction: -1 | 1) => void
}) {
  if (items.length === 0) return null

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={item.id}
          className="flex items-start gap-2 rounded-input border border-border/60 px-2 py-1.5"
        >
          <input
            type="checkbox"
            checked={Boolean(item.done)}
            onChange={() => onToggle(item)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={item.label}
            aria-checked={Boolean(item.done)}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span
            className={cn(
              "min-w-0 flex-1 text-sm",
              item.done && "text-muted-foreground line-through",
            )}
          >
            {item.label}
          </span>
          {onMove || onDelete ? (
            <div className="flex shrink-0 gap-0.5">
              {onMove ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => onMove(item.id, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === items.length - 1}
                    onClick={() => onMove(item.id, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : null}
              {onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onDelete(item)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
