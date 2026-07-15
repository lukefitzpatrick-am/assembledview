import * as React from "react"
import { AlertTriangle, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

export const EXPERT_REORDER_COL_WIDTH_PX = 44

type ReorderHandleProps = React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }

export function ExpertGridRowReorderCell({
  rowIndex,
  handleProps,
  isDragging,
  incompleteReasons,
  className,
  style,
}: {
  rowIndex: number
  handleProps: ReorderHandleProps
  isDragging?: boolean
  incompleteReasons?: string[]
  className?: string
  style?: React.CSSProperties
}) {
  const incompleteLabel =
    incompleteReasons && incompleteReasons.length > 0
      ? incompleteReasons.join(", ")
      : null
  return (
    <td
      className={cn("text-center", className)}
      style={{ width: EXPERT_REORDER_COL_WIDTH_PX, minWidth: EXPERT_REORDER_COL_WIDTH_PX, maxWidth: EXPERT_REORDER_COL_WIDTH_PX, ...style }}
    >
      <div
        {...handleProps}
        role="button"
        tabIndex={0}
        title="Drag to reorder this line item"
        aria-label={`Reorder line item ${rowIndex + 1}`}
        className={cn(
          "mx-auto flex h-8 w-full cursor-grab select-none items-center justify-center gap-0.5 rounded-sm text-muted-foreground active:cursor-grabbing",
          isDragging && "opacity-50",
        )}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="text-[11px] font-medium tabular-nums text-foreground">{rowIndex + 1}</span>
        {incompleteLabel ? (
          <span
            className="inline-flex text-status-behind-fg"
            title={`Incomplete: ${incompleteLabel}`}
            aria-label={`Incomplete row: ${incompleteLabel}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
    </td>
  )
}

export function ExpertGridRowReorderHeaderCell({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <th
      className={cn("text-center", className)}
      style={{ width: EXPERT_REORDER_COL_WIDTH_PX, minWidth: EXPERT_REORDER_COL_WIDTH_PX, maxWidth: EXPERT_REORDER_COL_WIDTH_PX, ...style }}
      title="Drag rows to reorder line item numbers"
    >
      #
    </th>
  )
}
