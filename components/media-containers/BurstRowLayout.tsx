"use client"

import type { ReactNode } from "react"
import { Copy, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  MP_BURST_ACTION_COLUMN,
  MP_BURST_CARD,
  MP_BURST_CARD_CONTENT,
  MP_BURST_DATE_RANGE,
  MP_BURST_FIELD_LABEL,
  MP_BURST_GRID_7,
  MP_BURST_LABEL_COLUMN,
  MP_BURST_LABEL_HEADING,
  MP_BURST_READONLY_CELL,
  MP_BURST_READONLY_INPUT,
  MP_BURST_ROW_SHELL,
  MP_BURST_SECTION_OUTER,
} from "@/lib/mediaplan/burstSectionLayout"

export function BurstSection({ children }: { children: ReactNode }) {
  return <div className={MP_BURST_SECTION_OUTER}>{children}</div>
}

export function BurstRowCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn(MP_BURST_CARD, className)}>
      <CardContent className={MP_BURST_CARD_CONTENT}>{children}</CardContent>
    </Card>
  )
}

export function BurstRowInner({ children }: { children: ReactNode }) {
  return <div className={MP_BURST_ROW_SHELL}>{children}</div>
}

export function BurstLabel({ children }: { children: ReactNode }) {
  return (
    <div className={MP_BURST_LABEL_COLUMN}>
      <h4 className={MP_BURST_LABEL_HEADING}>{children}</h4>
    </div>
  )
}

export function BurstFieldGrid({
  children,
  className = MP_BURST_GRID_7,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}

export function BurstDateRangeColumn({ children }: { children: ReactNode }) {
  return <div className={MP_BURST_DATE_RANGE}>{children}</div>
}

export function BurstFieldLabel({ children }: { children: ReactNode }) {
  return <FormLabel className={MP_BURST_FIELD_LABEL}>{children}</FormLabel>
}

export function BurstReadonlyMetric({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className={MP_BURST_READONLY_CELL}>
      <FormLabel className={cn(MP_BURST_FIELD_LABEL, "leading-tight")}>
        {label}
      </FormLabel>
      <Input
        type="text"
        className={cn(
          MP_BURST_READONLY_INPUT,
          muted && "bg-muted/30 border-border/40 text-muted-foreground",
        )}
        value={value}
        readOnly
      />
    </div>
  )
}

export function BurstRowActions({
  onAdd,
  onDuplicate,
  onRemove,
}: {
  onAdd: () => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  return (
    <div className={MP_BURST_ACTION_COLUMN}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 text-sm px-3"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 text-sm px-3"
        onClick={onDuplicate}
      >
        <Copy className="h-4 w-4 mr-1" />
        Duplicate
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 text-sm px-3"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
