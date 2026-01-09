import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react"
import * as React from "react"
import { TableHead } from "./table"
import { cn } from "@/lib/utils"

export type SortDirection = "asc" | "desc" | null

type SortableValue = string | number | Date | boolean | null | undefined

interface SortableTableHeaderProps {
  label: React.ReactNode
  direction: SortDirection
  onToggle: () => void
  className?: string
  align?: "left" | "center" | "right"
}

// Generic comparator used by both pages
export const compareValues = (
  a: SortableValue,
  b: SortableValue,
  direction: Exclude<SortDirection, null>
): number => {
  const normalize = (v: SortableValue) => {
    if (v instanceof Date) return v.getTime()
    if (typeof v === "string") return v.toLowerCase()
    if (v === true) return 1
    if (v === false) return 0
    return v ?? ""
  }

  const va = normalize(a)
  const vb = normalize(b)

  if (va < vb) return direction === "asc" ? -1 : 1
  if (va > vb) return direction === "asc" ? 1 : -1
  return 0
}

export const SortableTableHeader: React.FC<SortableTableHeaderProps> = ({
  label,
  direction,
  onToggle,
  className,
  align = "left",
}) => {
  const Icon =
    direction === "asc" ? ChevronUp : direction === "desc" ? ChevronDown : ChevronsUpDown

  return (
    <TableHead className={cn("p-0", className)} align={align}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="flex-1">{label}</span>
        <Icon className="h-4 w-4 shrink-0" />
      </button>
    </TableHead>
  )
}





































