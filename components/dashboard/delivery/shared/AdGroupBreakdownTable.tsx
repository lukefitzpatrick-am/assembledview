"use client"

/**
 * Thin search-compatible wrapper around EntityBreakdownTable.
 * Call sites that already pass spend rows keep the previous 6-column table.
 */
import {
  EntityBreakdownTable,
  type EntityBreakdownRow,
} from "./EntityBreakdownTable"

export type AdGroupBreakdownRow = EntityBreakdownRow

export type AdGroupBreakdownTableProps = {
  rows: AdGroupBreakdownRow[]
  knownPlanLineIds: string[]
  className?: string
  defaultOpen?: boolean
}

export function AdGroupBreakdownTable({
  rows,
  knownPlanLineIds,
  className,
  defaultOpen,
}: AdGroupBreakdownTableProps) {
  return (
    <EntityBreakdownTable
      rows={rows}
      knownPlanLineIds={knownPlanLineIds}
      entityNoun={{ singular: "ad group", plural: "ad groups" }}
      columns="spend"
      className={className}
      defaultOpen={defaultOpen}
    />
  )
}
