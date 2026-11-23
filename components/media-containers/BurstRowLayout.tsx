"use client"

import { useId, type ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
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
  name,
  value,
  muted = false,
  note,
  warning,
}: {
  label: string
  /** Full accessible name, e.g. "Production Total, burst 1, line 2". */
  name?: string
  value: string
  muted?: boolean
  note?: string
  warning?: ReactNode
}) {
  const id = useId()
  return (
    <div className={MP_BURST_READONLY_CELL}>
      <Label htmlFor={id} className={cn(MP_BURST_FIELD_LABEL, "leading-tight")}>
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          type="text"
          aria-label={name}
          className={cn(
            MP_BURST_READONLY_INPUT,
            muted && "bg-muted/30 border-border/40 text-muted-foreground",
          )}
          value={value}
          readOnly
        />
        {warning}
      </div>
      {note ? (
        <span className="text-[11px] text-muted-foreground">{note}</span>
      ) : null}
    </div>
  )
}

